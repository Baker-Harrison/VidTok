const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const storage = require('./storage');
const { filterAndMapVideos } = require('./utils');
require('dotenv').config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const STREAM_PORT = 8888;
const TEMP_DIR = path.join(app.getPath('temp'), 'vidtok_cache');
const LOG_FILE = path.join(TEMP_DIR, 'backend.log');

// Redundancy Layer 1: API Retry Logic
axiosRetry(axios, { 
    retries: 3, 
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        // Retry on network errors or 429 (rate limit)
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
    }
});

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Robust Logging System
 */
function logBackend(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, entry);
    } catch (e) {
        console.error('Logging failed:', e);
    }
    console.log(msg);
}

logBackend('Starting VidTok Backend with Redundancy Layer...');

/**
 * Local Streaming Server (Redundancy Layer 2: Resilient Proxy)
 */
const server = express();

server.get('/stream/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    logBackend(`Stream requested for: ${videoId}`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const pythonScript = path.join(__dirname, '../backend/streamer.py');

    // Redundancy: Timeout protection for Python script
    const pythonTimeout = setTimeout(() => {
        logBackend(`Python script timed out for: ${videoId}`);
        if (!res.headersSent) res.status(504).send('Metadata timeout');
    }, 10000);

    exec(`${PYTHON_EXE} "${pythonScript}" "${url}"`, async (error, stdout) => {
        clearTimeout(pythonTimeout);
        if (error) {
            logBackend(`Python Error: ${error.message}`);
            return res.status(500).send('Error fetching stream metadata');
        }

        let metadata;
        try {
            metadata = JSON.parse(stdout);
            if (metadata.error) {
                logBackend(`Metadata Error: ${metadata.error}`);
                return res.status(404).send(metadata.error);
            }
        } catch (e) {
            logBackend(`JSON Parse Error: ${stdout}`);
            return res.status(500).send('Invalid metadata response');
        }

        const streamUrl = metadata.stream_url;
        const filePath = path.join(TEMP_DIR, `${videoId}.mp4`);

        try {
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                timeout: 30000, // 30s timeout for stream start
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                }
            });

            res.setHeader('Content-Type', 'video/mp4');
            if (metadata.filesize) res.setHeader('Content-Length', metadata.filesize);

            const fileStream = fs.createWriteStream(filePath);
            
            // Double-pipe with error handling
            response.data.pipe(res);
            response.data.pipe(fileStream);

            req.on('close', () => {
                logBackend(`Client disconnected: ${videoId}`);
                if (!fileStream.writableEnded) fileStream.end();
            });

            response.data.on('error', (err) => {
                logBackend(`Upstream stream error for ${videoId}: ${err.message}`);
                if (!res.headersSent) res.status(502).send('Upstream failure');
                fileStream.destroy();
            });

        } catch (e) {
            logBackend(`Proxy Pipeline Error for ${videoId}: ${e.message}`);
            if (!res.headersSent) res.status(500).send('Streaming logic failed');
        }
    });
});

/**
 * Resolves the correct Python executable path.
 */
function getPythonPath() {
    const rootDir = path.join(__dirname, '..');
    const venvPaths = [
        path.join(rootDir, 'venv', 'bin', 'python3'),
        path.join(rootDir, '.venv', 'bin', 'python3'),
        path.join(rootDir, 'venv', 'Scripts', 'python.exe'),
        path.join(rootDir, '.venv', 'Scripts', 'python.exe'),
    ];

    for (const venvPath of venvPaths) {
        if (fs.existsSync(venvPath)) return `"${venvPath}"`;
    }
    return 'python3';
}

const PYTHON_EXE = getPythonPath();

server.listen(STREAM_PORT, () => {
    logBackend(`Streaming proxy active on port ${STREAM_PORT}`);
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    win.loadFile('src/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Redundancy Layer 3: Safe Cleanup
    try {
        if (fs.existsSync(TEMP_DIR)) {
            const files = fs.readdirSync(TEMP_DIR);
            for (const file of files) {
                if (file.endsWith('.mp4')) {
                    fs.unlinkSync(path.join(TEMP_DIR, file));
                }
            }
        }
    } catch (e) {
        logBackend(`Cleanup Error: ${e.message}`);
    }
    if (process.platform !== 'darwin') app.quit();
});

/**
 * IPC Handlers with Centralized Redundancy
 */
ipcMain.handle('get-trending-videos', async () => {
    return safeApiCall(async () => {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,contentDetails,statistics',
                chart: 'mostPopular',
                regionCode: 'US',
                maxResults: 20,
                key: API_KEY
            }
        });
        return filterAndMapVideos(response.data.items);
    }, 'trending feed');
});

ipcMain.handle('get-related-videos', async (event, videoId) => {
    return safeApiCall(async () => {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                relatedToVideoId: videoId,
                type: 'video',
                maxResults: 10,
                key: API_KEY
            }
        });

        const videoIds = response.data.items.map(i => i.id.videoId).join(',');
        const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,contentDetails,statistics',
                id: videoIds,
                key: API_KEY
            }
        });

        return filterAndMapVideos(detailsResponse.data.items);
    }, 'related videos');
});

async function safeApiCall(fn, context) {
    try {
        return await fn();
    } catch (error) {
        handleApiError(error);
        return { error: `Failed to fetch ${context}` };
    }
}

ipcMain.handle('toggle-like', (e, id, meta) => storage.toggleLike(id, meta));
ipcMain.handle('check-like', (e, id) => storage.isLiked(id));
ipcMain.handle('get-preferences', () => storage.getPreferences());
ipcMain.handle('save-preferences', (e, c, t) => storage.savePreferences(c, t));
ipcMain.handle('get-likes', () => storage.getLikes());
ipcMain.handle('search-channels', async (e, q) => {
    return safeApiCall(async () => {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', q, type: 'channel', maxResults: 5, key: API_KEY }
        });
        return response.data.items.map(item => ({
            id: item.snippet.channelId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.default.url
        }));
    }, 'channel search');
});

ipcMain.handle('get-personalized-feed', async (event, prefs) => {
    return safeApiCall(async () => {
        const query = [...prefs.channels, ...prefs.topics].join(' ') || 'trending';
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', q: query, type: 'video', maxResults: 25, key: API_KEY }
        });

        const videoIds = response.data.items.map(i => i.id.videoId).join(',');
        const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'snippet,contentDetails,statistics', id: videoIds, key: API_KEY }
        });

        return filterAndMapVideos(detailsResponse.data.items);
    }, 'personalized feed');
});

function handleApiError(error) {
    const details = error.response ? error.response.data : error.message;
    logBackend(`YouTube API Error: ${JSON.stringify(details)}`);
}
