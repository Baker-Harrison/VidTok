const { ipcRenderer } = require('electron');

const onboarding = document.getElementById('onboarding');
const mainView = document.getElementById('main-view');
const videoGrid = document.getElementById('video-grid');
const watchOverlay = document.getElementById('watch-overlay');
const player = document.getElementById('player');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const closeWatch = document.getElementById('close-watch');
const navForYou = document.getElementById('nav-for-you');
const navLiked = document.getElementById('nav-liked');
const feedTitle = document.getElementById('feed-title');
const contentContainer = document.getElementById('content');

const channelInput = document.getElementById('channel-input');
const channelSuggestions = document.getElementById('channel-suggestions');
const channelPillsContainer = document.getElementById('channel-pills');
const topicInput = document.getElementById('topic-input');
const topicPillsContainer = document.getElementById('topic-pills');

let currentPrefs = null;
let selectedChannels = [];
let selectedTopics = [];
let debounceTimer;

let nextPageToken = null;
let isLoadingMore = false;
let currentViewMode = 'for-you';

async function checkOnboarding() {
    const prefs = await ipcRenderer.invoke('get-preferences');
    if (prefs) {
        currentPrefs = prefs;
        showMainView(prefs);
    }
}

document.getElementById('finish-onboarding').onclick = async () => {
    if (selectedTopics.length > 0 || selectedChannels.length > 0) {
        currentPrefs = { channels: selectedChannels, topics: selectedTopics };
        await ipcRenderer.invoke('save-preferences', selectedChannels, selectedTopics);
        showMainView(currentPrefs);
    }
};

async function showMainView(prefs) {
    onboarding.style.display = 'none';
    mainView.style.display = 'grid';
    loadForYou();
}

async function loadForYou(append = false) {
    if (isLoadingMore) return;
    isLoadingMore = true;
    currentViewMode = 'for-you';
    updateNavUI('for-you');
    
    const result = await ipcRenderer.invoke('get-personalized-feed', currentPrefs, append ? nextPageToken : null);
    
    if (result.error) {
        if (!append) videoGrid.innerHTML = `<div class="error-msg">${result.error}</div>`;
    } else {
        nextPageToken = result.nextPageToken;
        renderGrid(result.videos, append);
    }
    isLoadingMore = false;
}

async function loadLiked() {
    currentViewMode = 'liked';
    feedTitle.innerText = "Liked Videos";
    updateNavUI('liked');
    const videos = await ipcRenderer.invoke('get-likes');
    renderGrid(videos.map(l => ({
        id: l.videoId,
        title: l.title,
        thumbnail: l.thumbnail,
        duration: l.duration,
        views: l.views
    })), false);
}

function renderGrid(videos, append = false) {
    if (!append) videoGrid.innerHTML = '';
    videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.id = `card-${video.id}`;
        card.innerHTML = `
            <div class="thumb" style="background-image: url('${video.thumbnail}'); background-size: cover;">
                <span class="duration-badge">${video.duration || '0:00'}</span>
                <div class="preview-container"></div>
            </div>
            <div class="video-info">
                <h4>${video.title}</h4>
                <p style="color: #666; font-size: 0.8rem; margin-top: 5px;">${video.views || ''}</p>
            </div>
        `;
        
        card.onclick = () => watchVideo(video);

        // Hover Preview Logic
        let previewTimeout;
        card.onmouseenter = () => {
            previewTimeout = setTimeout(() => {
                const container = card.querySelector('.preview-container');
                const vid = document.createElement('video');
                vid.src = `http://localhost:8888/stream/${video.id}`;
                vid.muted = true;
                vid.autoplay = true;
                vid.loop = true;
                vid.className = 'preview-video';
                container.appendChild(vid);
            }, 800); // Wait 800ms before starting preview
        };

        card.onmouseleave = () => {
            clearTimeout(previewTimeout);
            const container = card.querySelector('.preview-container');
            container.innerHTML = '';
        };

        videoGrid.appendChild(card);
    });
}

async function watchVideo(video) {
    watchOverlay.style.display = 'block';
    player.src = `http://localhost:8888/stream/${video.id}`;
    
    // Load persisted volume/mute settings
    const settings = await ipcRenderer.invoke('get-settings');
    player.volume = settings.volume;
    player.muted = settings.muted;

    player.ontimeupdate = () => {
        progressBar.style.width = `${(player.currentTime / player.duration) * 100}%`;
    };
    
    // Save volume/mute changes
    player.onvolumechange = () => {
        ipcRenderer.invoke('save-settings', { 
            volume: player.volume, 
            muted: player.muted 
        });
    };
}

// Infinite Scroll Detection
contentContainer.onscroll = () => {
    if (currentViewMode !== 'for-you') return;
    const { scrollTop, scrollHeight, clientHeight } = contentContainer;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadForYou(true);
    }
};

function updateNavUI(activeId) {
    navForYou.classList.toggle('active', activeId === 'for-you');
    navLiked.classList.toggle('active', activeId === 'liked');
}

navForYou.onclick = () => { nextPageToken = null; loadForYou(); };
navLiked.onclick = loadLiked;
closeWatch.onclick = () => { watchOverlay.style.display = 'none'; player.pause(); player.src = ""; };

// Channel Autocomplete
channelInput.oninput = () => {
    const q = channelInput.value.trim();
    if (q.length < 2) {
        channelSuggestions.style.display = 'none';
        return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        const res = await ipcRenderer.invoke('search-channels', q);
        if (res && !res.error) renderSuggestions(res);
    }, 400);
};

channelInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        const val = channelInput.value.trim();
        if (val) {
            addPill('channel', val);
            channelInput.value = '';
            channelSuggestions.style.display = 'none';
        }
    }
};

// Close suggestions on outside click
document.addEventListener('click', (e) => {
    if (e.target !== channelInput) {
        channelSuggestions.style.display = 'none';
    }
});

function renderSuggestions(list) {
    if (list.error) {
        channelSuggestions.innerHTML = `<div class="suggestion" style="color: #ff4b4b;">${list.error}</div>`;
        channelSuggestions.style.display = 'block';
        return;
    }
    channelSuggestions.innerHTML = '';
    channelSuggestions.style.display = 'block';
    list.forEach(c => {
        const d = document.createElement('div');
        d.className = 'suggestion';
        d.innerHTML = `<img src="${c.thumbnail}" /><span>${c.title}</span>`;
        d.onclick = () => { 
            addPill('channel', c.title); 
            channelInput.value = ''; 
            channelSuggestions.style.display = 'none'; 
        };
        channelSuggestions.appendChild(d);
    });
}

function addPill(type, val) {
    if (!val) return;
    const list = type === 'channel' ? selectedChannels : selectedTopics;
    if (!list.includes(val)) { 
        list.push(val); 
        renderPills(type); 
    }
    updateFinishButton();
}

function updateFinishButton() {
    const btn = document.getElementById('finish-onboarding');
    const hasData = selectedChannels.length > 0 || selectedTopics.length > 0;
    btn.style.opacity = hasData ? '1' : '0.5';
    btn.disabled = !hasData;
}

function renderPills(type) {
    const cont = type === 'channel' ? channelPillsContainer : topicPillsContainer;
    const list = type === 'channel' ? selectedChannels : selectedTopics;
    cont.innerHTML = '';
    list.forEach(v => {
        const p = document.createElement('div');
        p.className = 'pill';
        p.innerHTML = `<span>${v}</span><span class="remove">×</span>`;
        p.querySelector('.remove').onclick = () => {
            if (type === 'channel') selectedChannels = selectedChannels.filter(x => x !== v);
            else selectedTopics = selectedTopics.filter(x => x !== v);
            renderPills(type);
        };
        cont.appendChild(p);
    });
}

topicInput.onkeydown = (e) => { if (e.key === 'Enter' && topicInput.value) { addPill('topic', topicInput.value); topicInput.value = ''; } };
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') closeWatch.click();
    else if (e.code === 'Space' && watchOverlay.style.display === 'block') {
        e.preventDefault();
        player.paused ? player.play() : player.pause();
    }
});

checkOnboarding();
