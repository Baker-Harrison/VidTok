const { ipcRenderer } = require('electron');

/**
 * VidTok Desktop Engine
 * Onboarding, Personalized Feed, and Full Screen Playback
 */

const onboarding = document.getElementById('onboarding');
const mainView = document.getElementById('main-view');
const videoGrid = document.getElementById('video-grid');
const watchOverlay = document.getElementById('watch-overlay');
const player = document.getElementById('player');
const closeWatch = document.getElementById('close-watch');

async function checkOnboarding() {
    const prefs = await ipcRenderer.invoke('get-preferences');
    if (prefs) {
        showMainView(prefs);
    }
}

document.getElementById('finish-onboarding').onclick = async () => {
    const channels = document.getElementById('fav-channels').value.split(',').map(s => s.trim());
    const topics = document.getElementById('fav-topics').value.split(',').map(s => s.trim());
    
    if (topics.length > 0) {
        await ipcRenderer.invoke('save-preferences', channels, topics);
        showMainView({ channels, topics });
    }
};

async function showMainView(prefs) {
    onboarding.style.display = 'none';
    mainView.style.display = 'grid';
    
    // Load initial feed
    const videos = await ipcRenderer.invoke('get-personalized-feed', prefs);
    renderGrid(videos);
}

function renderGrid(videos) {
    videoGrid.innerHTML = '';
    videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <div class="thumb">
                <span class="pulse">▶</span>
            </div>
            <div class="video-info">
                <h4>${video.title}</h4>
            </div>
        `;
        card.onclick = () => watchVideo(video);
        videoGrid.appendChild(card);
    });
}

async function watchVideo(video) {
    watchOverlay.style.display = 'block';
    player.src = `http://localhost:8888/stream/${video.id}`;
    
    // Algorithm: Fetch related content in background while user watches
    const related = await ipcRenderer.invoke('get-related-videos', video.id);
    if (related && !related.error) {
        // Soft inject into the top of the grid
        prependToGrid(related);
    }
}

function prependToGrid(videos) {
    videos.forEach(video => {
        if (document.getElementById(`card-${video.id}`)) return;
        const card = document.createElement('div');
        card.className = 'video-card';
        card.id = `card-${video.id}`;
        card.innerHTML = `
            <div class="thumb"><span>New</span></div>
            <div class="video-info">
                <h4>${video.title}</h4>
            </div>
        `;
        card.onclick = () => watchVideo(video);
        videoGrid.insertBefore(card, videoGrid.firstChild);
    });
}

closeWatch.onclick = () => {
    watchOverlay.style.display = 'none';
    player.pause();
    player.src = "";
};

// Start
checkOnboarding();
