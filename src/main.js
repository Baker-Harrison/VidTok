const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
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

server.get('/stream/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    logBackend(`Stream requested for: ${videoId}`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const pythonScript = path.join(__dirname, '../backend/streamer.py');

    exec(`python3 "${pythonScript}" "${url}"`, async (error, stdout) => {
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
        width: 450, // TikTok-like aspect ratio
        height: 800,
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
