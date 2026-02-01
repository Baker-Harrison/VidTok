const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const feed = document.getElementById('feed');
let currentVideos = [];

async function downloadAndPlay(url, container) {
    const pythonScript = path.join(__dirname, '../backend/streamer.py');
    const command = `python3 "${pythonScript}" "${url}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            container.innerHTML = `<p>Error loading video: ${error.message}</p>`;
            return;
        }

        try {
            const result = JSON.parse(stdout);
            if (result.error) {
                container.innerHTML = `<p>Error: ${result.error}</p>`;
            } else {
                const videoPath = result.path;
                container.innerHTML = `
                    <div class="ui-overlay">
                        <h3>${result.title}</h3>
                    </div>
                    <video src="file://${videoPath}" autoplay loop muted controls></video>
                `;
                
                // Store path to delete later
                currentVideos.push(videoPath);
            }
        } catch (e) {
            console.error('Failed to parse result:', stdout);
            container.innerHTML = `<p>Failed to load video</p>`;
        }
    });
}

async function loadFeed() {
    // Mocking YouTube API results for now
    const videoUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=9bZkp7q19f0'
    ];

    feed.innerHTML = '';
    videoUrls.forEach((url, index) => {
        const container = document.createElement('div');
        container.className = 'video-container';
        container.id = `v-${index}`;
        container.innerHTML = `<p>Loading Video ${index + 1}...</p>`;
        feed.appendChild(container);
        
        // In a real app, we'd only load the current and next few
        downloadAndPlay(url, container);
    });
}

// Cleanup on exit
window.onbeforeunload = () => {
    currentVideos.forEach(v => {
        if (fs.existsSync(v)) {
            fs.unlinkSync(v);
        }
    });
};

loadFeed();
