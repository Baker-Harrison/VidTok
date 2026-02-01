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
const navForYou = document.getElementById('nav-for-you');
const navLiked = document.getElementById('nav-liked');
const feedTitle = document.getElementById('feed-title');

let currentPrefs = null;

async function checkOnboarding() {
    const prefs = await ipcRenderer.invoke('get-preferences');
    if (prefs) {
        currentPrefs = prefs;
        showMainView(prefs);
    }
}

document.getElementById('finish-onboarding').onclick = async () => {
    const channels = document.getElementById('fav-channels').value.split(',').map(s => s.trim());
    const topics = document.getElementById('fav-topics').value.split(',').map(s => s.trim());
    
    if (topics.length > 0) {
        currentPrefs = { channels, topics };
        await ipcRenderer.invoke('save-preferences', channels, topics);
        showMainView(currentPrefs);
    }
};

async function showMainView(prefs) {
    onboarding.style.display = 'none';
    mainView.style.display = 'grid';
    loadForYou();
}

async function loadForYou() {
    feedTitle.innerText = "For You";
    updateNavUI('for-you');
    const videos = await ipcRenderer.invoke('get-personalized-feed', currentPrefs);
    renderGrid(videos);
}

async function loadLiked() {
    feedTitle.innerText = "Liked Videos";
    updateNavUI('liked');
    const likes = await ipcRenderer.invoke('get-likes');
    // Map database likes to feed format
    const videos = likes.map(l => ({
        id: l.videoId,
        title: l.title || "Liked Video",
        url: `https://www.youtube.com/watch?v=${l.videoId}`
    }));
    renderGrid(videos);
}

function updateNavUI(activeId) {
    navForYou.style.color = activeId === 'for-you' ? '#fff' : '#666';
    navForYou.style.background = activeId === 'for-you' ? 'rgba(255,255,255,0.1)' : 'none';
    navLiked.style.color = activeId === 'liked' ? '#fff' : '#666';
    navLiked.style.background = activeId === 'liked' ? 'rgba(255,255,255,0.1)' : 'none';
}

navForYou.onclick = loadForYou;
navLiked.onclick = loadLiked;

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
