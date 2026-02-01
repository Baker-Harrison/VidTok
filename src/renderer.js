const { ipcRenderer } = require('electron');

/**
 * VidTok Renderer
 */

const feed = document.getElementById('feed');
let observer;

function logStatus(msg) {
    console.log(`[Renderer] ${msg}`);
}

async function loadVideoIntoContainer(videoId, title, container) {
    logStatus(`Loading ${videoId}...`);
    const streamProxyUrl = `http://localhost:8888/stream/${videoId}`;

    // Pre-emptively set the UI
    container.innerHTML = `
        <div class="status-layer">
            <div class="buffering pulse">Buffering...</div>
        </div>
        <div class="ui-overlay">
            <h3>${title}</h3>
        </div>
        <div class="side-bar">
            <div class="action-btn like-btn">❤️</div>
            <div class="action-btn">💬</div>
            <div class="action-btn">🔁</div>
        </div>
    `;

    const videoElement = document.createElement('video');
    videoElement.src = streamProxyUrl;
    videoElement.loop = true;
    videoElement.autoplay = true;
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';

    videoElement.onplaying = () => {
        const status = container.querySelector('.status-layer');
        if (status) status.remove();
    };

    videoElement.onerror = () => {
        container.innerHTML = `<div class="error-msg">Failed to stream video.</div>`;
    };

    container.appendChild(videoElement);
}

function appendVideos(videos) {
    videos.forEach(video => {
        if (document.getElementById(`v-${video.id}`)) return;

        const container = document.createElement('div');
        container.className = 'video-container';
        container.id = `v-${video.id}`;
        container.setAttribute('data-title', video.title);
        container.innerHTML = `<div class="status-layer"><div class="buffering">Discovering...</div></div>`;
        
        feed.appendChild(container);
        observer.observe(container);
    });
}

async function init() {
    logStatus('Starting Feed...');

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const videoId = entry.target.id.replace('v-', '');
            const title = entry.target.getAttribute('data-title');
            const video = entry.target.querySelector('video');

            if (entry.isIntersecting) {
                if (!video) {
                    loadVideoIntoContainer(videoId, title, entry.target);
                } else {
                    video.play();
                }
            } else {
                if (video) video.pause();
            }
        });
    }, { threshold: 0.6 });

    const videos = await ipcRenderer.invoke('get-trending-videos');
    
    const loader = document.getElementById('initial-loader');
    if (loader) loader.remove();

    if (videos && videos.length > 0) {
        appendVideos(videos);
    } else {
        feed.innerHTML = '<div class="error-msg">No videos found. Check your YouTube API key or quota.</div>';
    }
}

init();
