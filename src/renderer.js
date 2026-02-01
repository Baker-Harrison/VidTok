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
                    <div class="side-bar">
                        <div class="action-btn">❤️</div>
                        <div class="action-btn">💬</div>
                        <div class="action-btn">🔁</div>
                    </div>
                    <video src="file://${videoPath}" autoplay loop controls></video>
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
    console.log('Fetching real feed from YouTube...');
    const videos = await ipcRenderer.invoke('get-trending-videos');
    
    if (videos.error) {
        feed.innerHTML = `<p>Error loading feed: ${videos.error}</p>`;
        return;
    }

    feed.innerHTML = '';
    videos.forEach((video, index) => {
        const container = document.createElement('div');
        container.className = 'video-container';
        container.id = `v-${video.id}`;
        container.innerHTML = `
            <div class="ui-overlay">
                <h3>${video.title}</h3>
            </div>
            <p>Buffering ${video.title}...</p>
        `;
        feed.appendChild(container);
        
        // Start download/stream for the first video immediately
        if (index === 0) {
            downloadAndPlay(video.url, container);
        }
    });

    // Observer to trigger download when scrolling to a new video
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const videoId = entry.target.id.replace('v-', '');
                const video = videos.find(v => v.id === videoId);
                
                // Analytics: track how long user stays on this video
                let startTime = Date.now();
                
                if (video && !entry.target.querySelector('video')) {
                    downloadAndPlay(video.url, entry.target);
                }

                // If user scrolls away, calculate time spent
                entry.target._timer = startTime;
            } else {
                if (entry.target._timer) {
                    const timeSpent = (Date.now() - entry.target._timer) / 1000;
                    console.log(`User spent ${timeSpent}s on ${entry.target.id}`);
                    if (timeSpent > 30) {
                        // "Algorithm": Fetch related content based on this video
                        // ipcRenderer.invoke('fetch-related', videoId);
                    }
                }
            }
        });
    }, { threshold: 0.8 });

    document.querySelectorAll('.video-container').forEach(c => observer.observe(c));
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
