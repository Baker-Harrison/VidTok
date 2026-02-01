const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.YOUTUBE_API_KEY;

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

/**
 * Filters out short videos and maps them to a consistent format.
 */
function filterAndMapVideos(items) {
    return items.filter(item => {
        const duration = item.contentDetails.duration;
        // Exclude videos under 60 seconds (Shorts)
        const isShort = duration.startsWith('PT') && !duration.includes('M') && !duration.includes('H');
        return !isShort;
    }).map(item => ({
        id: item.id,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id}`
    })).slice(0, 10);
}

/**
 * Centralized API error handling.
 */
function handleApiError(error) {
    const details = error.response ? error.response.data : error.message;
    console.error('YouTube API Error:', details);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
