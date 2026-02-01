const { ipcRenderer } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * VidTok Renderer Logic
 * Manages the TikTok-style vertical feed and recommendation triggers.
 */

const feed = document.getElementById('feed');
let downloadedFiles = new Set();
let observer;

/**
 * Triggers the download of a YouTube video and attaches it to the container.
 */
async function downloadAndPlay(video, container) {
    const pythonScript = path.join(__dirname, '../backend/streamer.py');
    const command = `python3 "${pythonScript}" "${video.url}"`;

    console.log(`Starting background download for: ${video.title}`);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Download error for ${video.id}: ${error.message}`);
            container.innerHTML = `<div class="error-msg">Stream unavailable</div>`;
            return;
        }

        try {
            const result = JSON.parse(stdout);
            if (result.error) {
                container.innerHTML = `<div class="error-msg">Error: ${result.error}</div>`;
                return;
            }

            const videoPath = result.path;
            downloadedFiles.add(videoPath);

            renderVideoElement(container, result.title, videoPath, video.id);
        } catch (e) {
            console.error('Failed to parse download result:', stdout);
        }
    });
}

/**
 * Renders the actual video element and UI overlays into the container.
 */
function renderVideoElement(container, title, videoPath, videoId) {
    container.innerHTML = `
        <div class="ui-overlay">
            <h3>${title}</h3>
        </div>
        <div class="side-bar">
            <div class="action-btn like-btn" data-video-id="${videoId}">❤️</div>
            <div class="action-btn">💬</div>
            <div class="action-btn">🔁</div>
        </div>
        <video src="file://${videoPath}" autoplay loop></video>
    `;

    // Add interaction listeners
    const likeBtn = container.querySelector('.like-btn');
    likeBtn.onclick = () => handleInterestTrigger(videoId, 'like');
}

/**
 * Handles user interest signals (likes, long watches).
 */
async function handleInterestTrigger(videoId, type) {
    console.log(`Interest trigger: ${type} on video ${videoId}`);
    
    // Fetch related content to keep the feed fresh
    const relatedVideos = await ipcRenderer.invoke('get-related-videos', videoId);
    
    if (relatedVideos && !relatedVideos.error) {
        appendVideosToFeed(relatedVideos);
    }
}

/**
 * Appends a list of video objects to the feed and observes them.
 */
function appendVideosToFeed(videos) {
    videos.forEach(video => {
        if (document.getElementById(`v-${video.id}`)) return; // Avoid duplicates

        const container = document.createElement('div');
        container.className = 'video-container';
        container.id = `v-${video.id}`;
        container.innerHTML = `<p class="buffering">Discovering...</p>`;
        
        feed.appendChild(container);
        observer.observe(container);
    });
}

/**
 * Initializes the main trending feed.
 */
async function initFeed() {
    const trending = await ipcRenderer.invoke('get-trending-videos');
    
    if (trending.error) {
        feed.innerHTML = `<div class="error-msg">Global feed offline</div>`;
        return;
    }

    feed.innerHTML = '';
    
    // Initialize IntersectionObserver for lazy-loading/streaming
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const videoId = entry.target.id.replace('v-', '');
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                
                // Track start time for interest detection
                entry.target._viewStartTime = Date.now();

                if (!entry.target.querySelector('video')) {
                    downloadAndPlay({ id: videoId, url: videoUrl, title: '' }, entry.target);
                } else {
                    entry.target.querySelector('video').play();
                }
            } else {
                // Pause video when scrolled away
                const v = entry.target.querySelector('video');
                if (v) v.pause();

                // Check if user spent enough time to signal interest
                if (entry.target._viewStartTime) {
                    const duration = (Date.now() - entry.target._viewStartTime) / 1000;
                    if (duration > 20) {
                        const videoId = entry.target.id.replace('v-', '');
                        handleInterestTrigger(videoId, 'long_watch');
                    }
                }
            }
        });
    }, { threshold: 0.7 });

    appendVideosToFeed(trending);
}

/**
 * Global Cleanup on application exit.
 */
window.onbeforeunload = () => {
    downloadedFiles.forEach(file => {
        if (fs.existsSync(file)) {
            try {
                fs.unlinkSync(file);
            } catch (e) {
                console.error(`Cleanup failed for ${file}:`, e);
            }
        }
    });
};

// Start the app
initFeed();
