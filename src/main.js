const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const storage = require('./storage');
require('dotenv').config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const STREAM_PORT = 8888;
const TEMP_DIR = path.join(app.getPath('temp'), 'vidtok_cache');
const LOG_FILE = path.join(TEMP_DIR, 'backend.log');

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function logBackend(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, entry);
    console.log(msg);
}

logBackend('Starting VidTok Backend...');

/**
 * Local Streaming Server
 */
const server = express();

/**
 * Resolves the correct Python executable path.
 * Favors virtual environments (venv/.venv) in the project root.
 */
function getPythonPath() {
    const rootDir = path.join(__dirname, '..');
    const venvPaths = [
        path.join(rootDir, 'venv', 'bin', 'python3'),
        path.join(rootDir, '.venv', 'bin', 'python3'),
        path.join(rootDir, 'venv', 'Scripts', 'python.exe'), // Windows
        path.join(rootDir, '.venv', 'Scripts', 'python.exe'), // Windows
    ];

    for (const venvPath of venvPaths) {
        if (fs.existsSync(venvPath)) {
            logBackend(`Using Virtualenv Python: ${venvPath}`);
            return `"${venvPath}"`;
        }
    }

    logBackend('Virtualenv not found. Falling back to system python3.');
    return 'python3';
}

const PYTHON_EXE = getPythonPath();

server.get('/stream/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    logBackend(`Stream requested for: ${videoId}`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const pythonScript = path.join(__dirname, '../backend/streamer.py');

    exec(`${PYTHON_EXE} "${pythonScript}" "${url}"`, async (error, stdout) => {
        if (error) {
            logBackend(`Python Error: ${error.message}`);
            return res.status(500).send('Error fetching stream metadata');
        }

        try {
            const metadata = JSON.parse(stdout);
            if (metadata.error) {
                logBackend(`Metadata Error: ${metadata.error}`);
                return res.status(404).send(metadata.error);
            }

            const streamUrl = metadata.stream_url;
            logBackend(`Proxied Stream URL obtained for ${videoId}`);

            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                }
            });

            res.setHeader('Content-Type', 'video/mp4');
            if (metadata.filesize) res.setHeader('Content-Length', metadata.filesize);

            response.data.pipe(res);
            logBackend(`Streaming started for ${videoId}`);

            // Background download
            const filePath = path.join(TEMP_DIR, `${videoId}.mp4`);
            if (!fs.existsSync(filePath)) {
                const fileStream = fs.createWriteStream(filePath);
                response.data.pipe(fileStream);
                fileStream.on('finish', () => logBackend(`Download complete for ${videoId}`));
            }

        } catch (e) {
            logBackend(`Proxy Error: ${e.message}`);
            res.status(500).send('Streaming logic failed');
        }
    });
});

server.listen(STREAM_PORT, () => {
    logBackend(`Streaming proxy active on port ${STREAM_PORT}`);
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1280, // Desktop 16:9 ratio
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
    if (process.platform !== 'darwin') app.quit();
});

/**
 * IPC Handlers
 */
ipcMain.handle('get-trending-videos', async () => {
    logBackend('Fetching trending videos...');
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,contentDetails',
                chart: 'mostPopular',
                regionCode: 'US',
                maxResults: 20,
                key: API_KEY
            }
        });
        return filterAndMapVideos(response.data.items);
    } catch (error) {
        logBackend(`YouTube List Error: ${error.message}`);
        return { error: 'Failed to fetch trending videos' };
    }
});

ipcMain.handle('get-related-videos', async (event, videoId) => {
    logBackend(`Fetching related for ${videoId}...`);
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                relatedToVideoId: videoId,
                type: 'video',
                maxResults: 5,
                key: API_KEY
            }
        });
        return response.data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));
    } catch (error) {
        logBackend(`YouTube Related Error: ${error.message}`);
        return { error: 'Failed to fetch related videos' };
    }
});

/**
 * Persistence IPC Handlers
 */
ipcMain.handle('toggle-like', async (event, videoId, metadata) => {
    return await storage.toggleLike(videoId, metadata);
});

ipcMain.handle('check-like', async (event, videoId) => {
    return await storage.isLiked(videoId);
});

ipcMain.handle('get-preferences', async () => {
    return await storage.getPreferences();
});

ipcMain.handle('save-preferences', async (event, channels, topics) => {
    return await storage.savePreferences(channels, topics);
});

ipcMain.handle('get-personalized-feed', async (event, prefs) => {
    logBackend(`Fetching personalized feed for topics: ${prefs.topics.join(', ')}`);
    try {
        // Search for videos based on topics
        const query = prefs.topics.join(' ');
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults: 15,
                key: API_KEY
            }
        });

        return response.data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));
    } catch (error) {
        handleApiError(error);
        return { error: 'Failed to fetch personalized feed' };
    }
});

function filterAndMapVideos(items) {
    return items.filter(item => {
        const duration = item.contentDetails.duration;
        const isShort = duration.startsWith('PT') && !duration.includes('M') && !duration.includes('H');
        return !isShort;
    }).map(item => ({
        id: item.id,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id}`
    })).slice(0, 10);
}
