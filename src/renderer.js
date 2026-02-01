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
let allVideos = [];

const VIRTUAL_WINDOW_TARGET = 15;
const MAX_DOM_CARDS = 30;
const DEFAULT_CARD_HEIGHT = 240;
const DEFAULT_ROW_GAP = 20;

const virtualState = {
    cardPool: [],
    topSpacer: null,
    bottomSpacer: null,
    itemHeight: null,
    rowGap: DEFAULT_ROW_GAP,
    columns: 1,
    lastRange: { start: 0, end: -1 },
    rafHandle: null,
    forceNextRender: false,
};

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
    if (!append) {
        allVideos = [];
        contentContainer.scrollTop = 0;
    }
    if (Array.isArray(videos) && videos.length > 0) {
        allVideos = append ? allVideos.concat(videos) : videos.slice();
    }
    scheduleVirtualRender(true);
}

function ensureSpacers() {
    if (!virtualState.topSpacer) {
        virtualState.topSpacer = document.createElement('div');
        virtualState.topSpacer.className = 'grid-spacer';
        virtualState.topSpacer.style.gridColumn = '1 / -1';
        virtualState.topSpacer.style.height = '0px';
    }
    if (!virtualState.bottomSpacer) {
        virtualState.bottomSpacer = document.createElement('div');
        virtualState.bottomSpacer.className = 'grid-spacer';
        virtualState.bottomSpacer.style.gridColumn = '1 / -1';
        virtualState.bottomSpacer.style.height = '0px';
    }
}

function buildCardElement() {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
        <div class="thumb" style="background-size: cover;">
            <span class="duration-badge">0:00</span>
            <div class="preview-container"></div>
        </div>
        <div class="video-info">
            <h4></h4>
            <p style="color: #666; font-size: 0.8rem; margin-top: 5px;"></p>
        </div>
    `;
    return card;
}

function updateCard(card, video) {
    card.id = `card-${video.id}`;
    card.dataset.videoId = video.id;

    const thumb = card.querySelector('.thumb');
    thumb.style.backgroundImage = `url('${video.thumbnail}')`;

    const duration = card.querySelector('.duration-badge');
    duration.textContent = video.duration || '0:00';

    const title = card.querySelector('.video-info h4');
    title.textContent = video.title || '';

    const views = card.querySelector('.video-info p');
    views.textContent = video.views || '';

    const container = card.querySelector('.preview-container');
    container.innerHTML = '';
    if (card.__previewTimeout) {
        clearTimeout(card.__previewTimeout);
        card.__previewTimeout = null;
    }

    card.onclick = () => watchVideo(video);

    card.onmouseenter = () => {
        card.__previewTimeout = setTimeout(() => {
            const vid = document.createElement('video');
            vid.src = `http://localhost:8888/stream/${video.id}`;
            vid.muted = true;
            vid.autoplay = true;
            vid.loop = true;
            vid.className = 'preview-video';
            container.appendChild(vid);
        }, 800);
    };

    card.onmouseleave = () => {
        if (card.__previewTimeout) {
            clearTimeout(card.__previewTimeout);
            card.__previewTimeout = null;
        }
        container.innerHTML = '';
    };
}

function computeGridMetrics() {
    const styles = getComputedStyle(videoGrid);
    if (styles.gridTemplateColumns && styles.gridTemplateColumns !== 'none') {
        const columns = styles.gridTemplateColumns.split(' ').length;
        virtualState.columns = Math.max(1, columns);
    }
    const rowGapValue = parseFloat(styles.rowGap || styles.gridRowGap || styles.gap || DEFAULT_ROW_GAP);
    if (!Number.isNaN(rowGapValue)) {
        virtualState.rowGap = rowGapValue;
    }
}

function scheduleVirtualRender(force = false) {
    if (force) virtualState.forceNextRender = true;
    if (virtualState.rafHandle) return;
    const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
    virtualState.rafHandle = raf(() => {
        virtualState.rafHandle = null;
        renderVirtualWindow(virtualState.forceNextRender);
        virtualState.forceNextRender = false;
    });
}

function renderVirtualWindow(force = false) {
    if (!videoGrid) return;
    if (!allVideos || allVideos.length === 0) {
        videoGrid.innerHTML = '';
        virtualState.cardPool = [];
        virtualState.lastRange = { start: 0, end: -1 };
        return;
    }

    ensureSpacers();
    computeGridMetrics();

    const columns = virtualState.columns || 1;
    const rowHeight = (virtualState.itemHeight || DEFAULT_CARD_HEIGHT) + virtualState.rowGap;
    const desiredCount = Math.min(allVideos.length, Math.max(VIRTUAL_WINDOW_TARGET, Math.min(MAX_DOM_CARDS, allVideos.length)));

    const scrollTop = contentContainer.scrollTop || 0;
    const approxRow = Math.floor(scrollTop / rowHeight);
    const approxIndex = approxRow * columns;
    const halfWindow = Math.floor(desiredCount / 2);

    let startIndex = Math.max(0, approxIndex - halfWindow);
    const maxStart = Math.max(0, allVideos.length - desiredCount);
    if (startIndex > maxStart) startIndex = maxStart;

    const endIndex = Math.min(allVideos.length - 1, startIndex + desiredCount - 1);

    if (!force && startIndex === virtualState.lastRange.start && endIndex === virtualState.lastRange.end) {
        return;
    }
    virtualState.lastRange = { start: startIndex, end: endIndex };

    const neededCount = endIndex - startIndex + 1;
    if (virtualState.cardPool.length > neededCount) {
        virtualState.cardPool.length = neededCount;
    } else {
        while (virtualState.cardPool.length < neededCount) {
            virtualState.cardPool.push(buildCardElement());
        }
    }

    for (let i = 0; i < neededCount; i += 1) {
        updateCard(virtualState.cardPool[i], allVideos[startIndex + i]);
    }

    const totalRows = Math.ceil(allVideos.length / columns);
    const startRow = Math.floor(startIndex / columns);
    const endRow = Math.floor(endIndex / columns);
    virtualState.topSpacer.style.height = `${startRow * rowHeight}px`;
    virtualState.bottomSpacer.style.height = `${Math.max(0, (totalRows - endRow - 1) * rowHeight)}px`;

    videoGrid.replaceChildren(
        virtualState.topSpacer,
        ...virtualState.cardPool,
        virtualState.bottomSpacer
    );

    if (!virtualState.itemHeight && virtualState.cardPool[0]) {
        const rect = virtualState.cardPool[0].getBoundingClientRect();
        if (rect.height) {
            virtualState.itemHeight = rect.height;
            renderVirtualWindow(true);
        }
    }
}

async function watchVideo(video) {
    watchOverlay.style.display = 'block';
    player.src = `http://localhost:8888/stream/${video.id}`;
    let hasMarkedViewed = false;
    
    // Load persisted volume/mute settings
    const settings = await ipcRenderer.invoke('get-settings');
    player.volume = settings.volume;
    player.muted = settings.muted;

    // Load saved playback position
    const savedPos = await ipcRenderer.invoke('get-position', video.id);
    player.currentTime = savedPos;

    player.ontimeupdate = () => {
        progressBar.style.width = `${(player.currentTime / player.duration) * 100}%`;

        if (!hasMarkedViewed && player.currentTime >= 5) {
            hasMarkedViewed = true;
            ipcRenderer.invoke('mark-viewed', video.id);
        }
        
        // Save position every 5 seconds to reduce DB load
        if (Math.floor(player.currentTime) % 5 === 0) {
            ipcRenderer.invoke('save-position', video.id, player.currentTime);
        }
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
    scheduleVirtualRender();
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

window.addEventListener('resize', () => scheduleVirtualRender(true));

window.__vidtok = {
    setVirtualVideos: (videos) => {
        allVideos = Array.isArray(videos) ? videos.slice() : [];
        scheduleVirtualRender(true);
    },
    setVirtualDimensions: (dims = {}) => {
        if (typeof dims.itemHeight === 'number') virtualState.itemHeight = dims.itemHeight;
        if (typeof dims.rowGap === 'number') virtualState.rowGap = dims.rowGap;
        if (typeof dims.columns === 'number') virtualState.columns = Math.max(1, dims.columns);
    },
    renderVirtualWindow: (force = true) => renderVirtualWindow(force),
    getDomCardCount: () => videoGrid.querySelectorAll('.video-card').length,
};

checkOnboarding();
