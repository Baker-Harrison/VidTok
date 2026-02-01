const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * VidTok Renderer
 * Fixes: Container sizing, Scroll Snap, and Intersection Logic
 */

const feed = document.getElementById('feed');
let downloadedFiles = new Set();
let observer;

/**
 * Spotify-style Streaming Proxy Integration
 */
async function downloadAndPlay(video, container) {
    const streamProxyUrl = `http://localhost:8888/stream/${video.id}`;
    
    // Create UI Structure first
    container.innerHTML = `
        <div class="ui-overlay">
            <h3>${video.title}</h3>
        </div>
        <div class="side-bar">
            <div class="action-btn like-btn" title="Like">❤️</div>
            <div class="action-btn" title="Comment">💬</div>
            <div class="action-btn" title="Share">🔁</div>
        </div>
        <div class="buffering pulse">Buffering...</div>
    `;

    // Create Video Element
    const videoElement = document.createElement('video');
    videoElement.src = streamProxyUrl;
    videoElement.loop = true;
    videoElement.playsInline = true;
    
    // When metadata loads, remove the text "Discovering"
    videoElement.onloadedmetadata = () => {
        const buff = container.querySelector('.buffering');
        if (buff) buff.remove();
    };

    container.appendChild(videoElement);

    const likeBtn = container.querySelector('.like-btn');
    likeBtn.onclick = () => handleInterestTrigger(video.id, 'like');
    
    // Auto-play if this is the visible one
    if (container._isVisible) {
        videoElement.play().catch(e => console.warn('Autoplay blocked:', e));
    }
}

async function handleInterestTrigger(videoId, type) {
    console.log(`[Signal] ${type} for ${videoId}`);
    const relatedVideos = await ipcRenderer.invoke('get-related-videos', videoId);
    if (relatedVideos && !relatedVideos.error) {
        appendVideosToFeed(relatedVideos);
    }
}

function appendVideosToFeed(videos) {
    videos.forEach(video => {
        if (document.getElementById(`v-${video.id}`)) return;

        const container = document.createElement('div');
        container.className = 'video-container';
        container.id = `v-${video.id}`;
        container.innerHTML = `<div class="buffering pulse">Discovering...</div>`;
        
        feed.appendChild(container);
        if (observer) observer.observe(container);
    });
}

async function initFeed() {
    // Setup observer BEFORE fetching to catch the initial append
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target._isVisible = true;
                const videoId = entry.target.id.replace('v-', '');
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                entry.target._viewStartTime = Date.now();

                const videoNode = entry.target.querySelector('video');
                if (!videoNode) {
                    // Title isn't known here yet, will be updated by stream
                    downloadAndPlay({ id: videoId, url: videoUrl, title: 'Loading...' }, entry.target);
                } else {
                    videoNode.play();
                }
            } else {
                entry.target._isVisible = false;
                const videoNode = entry.target.querySelector('video');
                if (videoNode) videoNode.pause();

                if (entry.target._viewStartTime) {
                    const timeSpent = (Date.now() - entry.target._viewStartTime) / 1000;
                    if (timeSpent > 20) {
                        const videoId = entry.target.id.replace('v-', '');
                        handleInterestTrigger(videoId, 'long_watch');
                    }
                }
            }
        });
    }, { threshold: 0.6 });

    const trending = await ipcRenderer.invoke('get-trending-videos');
    
    const loader = document.getElementById('initial-loader');
    if (loader) loader.remove();

    if (trending.error) {
        feed.innerHTML = `<div class="error-msg">Feed unavailable. Check API Key.</div>`;
        return;
    }

    appendVideosToFeed(trending);
}

window.onbeforeunload = () => {
    // Files are managed by the main process (temp_cache)
};

initFeed();
