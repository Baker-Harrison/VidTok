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
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
    }
});

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function logBackend(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, entry);
    } catch (e) {
        console.error('Logging failed:', e);
    }
    console.log(msg);
}

logBackend('Starting VidTok Backend...');

const server = express();

server.get('/stream/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const pythonScript = path.join(__dirname, '../backend/streamer.py');

    const pythonTimeout = setTimeout(() => {
        if (!res.headersSent) res.status(504).send('Metadata timeout');
    }, 10000);

    exec(`${PYTHON_EXE} "${pythonScript}" "${url}"`, async (error, stdout) => {
        clearTimeout(pythonTimeout);
        if (error) return res.status(500).send('Stream error');

        let metadata;
        try {
            metadata = JSON.parse(stdout);
            if (metadata.error) return res.status(404).send(metadata.error);
        } catch (e) {
            return res.status(500).send('Parse error');
        }

        try {
            const response = await axios({
                method: 'get',
                url: metadata.stream_url,
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            res.setHeader('Content-Type', 'video/mp4');
            if (metadata.filesize) res.setHeader('Content-Length', metadata.filesize);

            const filePath = path.join(TEMP_DIR, `${videoId}.mp4`);
            const fileStream = fs.createWriteStream(filePath);
            
            response.data.pipe(res);
            response.data.pipe(fileStream);

            req.on('close', () => { if (!fileStream.writableEnded) fileStream.end(); });
        } catch (e) {
            if (!res.headersSent) res.status(500).send('Streaming failed');
        }
    });
});

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

server.listen(STREAM_PORT);

function createWindow() {
    const win = new BrowserWindow({
        width: 1280, height: 720,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    win.loadFile('src/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    if (process.platform !== 'darwin') app.quit();
});

async function safeApiCall(fn, context) {
    try { return await fn(); } 
    catch (error) { 
        handleApiError(error); 
        return { error: `Failed to fetch ${context}` }; 
    }
}

function handleApiError(error) {
    const details = error.response ? error.response.data : error.message;
    logBackend(`YouTube API Error: ${JSON.stringify(details)}`);
}

/**
 * IPC Handlers with Pagination and Recursive Discovery
 */
ipcMain.handle('get-trending-videos', async (event, pageToken = null) => {
    return safeApiCall(async () => {
        const sinceTimestamp = Date.now() - (48 * 60 * 60 * 1000);
        const viewedIds = await storage.getViewedIds(sinceTimestamp);
        const viewedSet = new Set(viewedIds);
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,contentDetails,statistics',
                chart: 'mostPopular',
                regionCode: 'US',
                maxResults: 15,
                pageToken,
                key: API_KEY
            }
        });
        const filteredItems = response.data.items.filter(item => !viewedSet.has(item.id));
        return {
            videos: filterAndMapVideos(filteredItems),
            nextPageToken: response.data.nextPageToken
        };
    }, 'trending feed');
});

ipcMain.handle('get-related-videos', async (event, videoId) => {
    return safeApiCall(async () => {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', relatedToVideoId: videoId, type: 'video', maxResults: 10, key: API_KEY }
        });
        const videoIds = response.data.items.map(i => i.id.videoId).join(',');
        const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'snippet,contentDetails,statistics', id: videoIds, key: API_KEY }
        });
        return filterAndMapVideos(detailsResponse.data.items);
    }, 'related videos');
});

ipcMain.handle('toggle-like', (e, id, meta) => storage.toggleLike(id, meta));
ipcMain.handle('check-like', (e, id) => storage.isLiked(id));
ipcMain.handle('get-preferences', () => storage.getPreferences());
ipcMain.handle('save-preferences', (e, c, t) => storage.savePreferences(c, t));
ipcMain.handle('get-likes', () => storage.getLikes());
ipcMain.handle('get-settings', () => storage.getSettings());
ipcMain.handle('save-settings', (e, s) => storage.saveSettings(s));
ipcMain.handle('save-position', (e, id, pos) => storage.savePlaybackPosition(id, pos));
ipcMain.handle('get-position', (e, id) => storage.getPlaybackPosition(id));

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

ipcMain.handle('ping-api', async () => {
    try {
        const response = await axios.head('https://www.googleapis.com/generate_204', {
            timeout: 4000,
            validateStatus: (status) => status >= 200 && status < 400,
        });
        return { ok: response.status >= 200 && response.status < 400 };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('get-personalized-feed', async (event, prefs, pageToken = null) => {
    return safeApiCall(async () => {
        const sinceTimestamp = Date.now() - (48 * 60 * 60 * 1000);
        const viewedIds = await storage.getViewedIds(sinceTimestamp);
        const viewedSet = new Set(viewedIds);
        const likes = await storage.getLikes();
        let query = [...prefs.channels, ...prefs.topics];
        
        // Recursive Algorithm 2.0: Interest Blending
        if (likes && likes.length > 0) {
            const recentLikes = likes.slice(0, 3).map(l => l.title);
            logBackend(`Blending interests with recent likes: ${recentLikes.join(', ')}`);
            query = [...recentLikes, ...query];
        }

        const queryString = query.join(' ') || 'trending';
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', q: queryString, type: 'video', maxResults: 20, pageToken, key: API_KEY }
        });

        const videoIds = response.data.items.map(i => i.id.videoId).join(',');
        const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'snippet,contentDetails,statistics', id: videoIds, key: API_KEY }
        });

        return {
            videos: filterAndMapVideos(detailsResponse.data.items.filter(item => !viewedSet.has(item.id))),
            nextPageToken: response.data.nextPageToken
        };
    }, 'personalized feed');
});

ipcMain.handle('mark-viewed', (e, id) => storage.markViewed(id));
