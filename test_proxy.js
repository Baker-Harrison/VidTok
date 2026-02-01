const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const videoId = 'dQw4w9WgXcQ';
const url = `https://www.youtube.com/watch?v=${videoId}`;
const pythonScript = path.join(__dirname, 'backend/streamer.py');

console.log('Testing streamer.py...');
exec(`python3 "${pythonScript}" "${url}"`, async (error, stdout) => {
    if (error) {
        console.error('Python error:', error);
        return;
    }

    try {
        const metadata = JSON.parse(stdout);
        console.log('Metadata fetched:', metadata.title);

        const streamUrl = metadata.stream_url;
        console.log('Testing stream URL with axios...');
        
        const response = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
            }
        });

        console.log('Response status:', response.status);
        console.log('Content-Type:', response.headers['content-type']);
        
        let chunkCount = 0;
        response.data.on('data', (chunk) => {
            chunkCount++;
            if (chunkCount === 1) {
                console.log('Received first chunk of size:', chunk.length);
                process.exit(0);
            }
        });

        response.data.on('error', (err) => {
            console.error('Axios stream error:', err);
            process.exit(1);
        });

    } catch (e) {
        console.error('Node test failed:', e);
        process.exit(1);
    }
});
