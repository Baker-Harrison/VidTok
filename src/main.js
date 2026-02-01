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

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Local Streaming Server
 * Acts as a proxy to allow Spotify-style "stream-while-downloading"
 */
const server = express();

server.get('/stream/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const pythonScript = path.join(__dirname, '../backend/streamer.py');

    exec(`python3 "${pythonScript}" "${url}"`, async (error, stdout) => {
        if (error) {
            return res.status(500).send('Error fetching stream metadata');
        }

        try {
            const metadata = JSON.parse(stdout);
            if (metadata.error) return res.status(404).send(metadata.error);

            const streamUrl = metadata.stream_url;
            const filePath = path.join(TEMP_DIR, `${videoId}.mp4`);

            // Start proxying the stream
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream'
            });

            // Set headers for video playback
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Length', metadata.filesize);

            // Double pipe: To browser AND to local file
            const fileStream = fs.createWriteStream(filePath);
            response.data.pipe(res); // Stream to user (instant playback)
            response.data.pipe(fileStream); // Download to disk

            req.on('close', () => {
                fileStream.end();
            });

        } catch (e) {
            res.status(500).send('Streaming logic failed');
        }
    });
});

server.listen(STREAM_PORT, () => {
    console.log(`Streaming proxy active on port ${STREAM_PORT}`);
});

/**
 * Electron Lifecycle
 */
function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
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
    // Cleanup temp files on exit
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    if (process.platform !== 'darwin') app.quit();
});

/**
 * IPC Handlers
 */
ipcMain.handle('get-trending-videos', async () => {
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
        handleApiError(error);
        return { error: 'Failed to fetch trending videos' };
    }
});

ipcMain.handle('get-related-videos', async (event, videoId) => {
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
        handleApiError(error);
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

function handleApiError(error) {
    const details = error.response ? error.response.data : error.message;
    console.error('YouTube API Error:', details);
}
