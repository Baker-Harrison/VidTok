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

        // Filter out Shorts (< 60s and portrait-ish)
        // Duration is in ISO 8601 (e.g., PT1M20S)
        const videos = response.data.items.filter(item => {
            const duration = item.contentDetails.duration;
            // Basic regex to exclude very short videos (usually < 1min)
            // Shorts are usually under PT1M
            const isShort = duration.startsWith('PT') && !duration.includes('M') && !duration.includes('H');
            return !isShort;
        }).map(item => ({
            id: item.id,
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id}`
        }));

        return videos.slice(0, 10);
    } catch (error) {
        console.error('YouTube API Error:', error.response ? error.response.data : error.message);
        return { error: 'Failed to fetch videos' };
    }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
