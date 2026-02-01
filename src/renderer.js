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
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const closeWatch = document.getElementById('close-watch');
const navForYou = document.getElementById('nav-for-you');
const navLiked = document.getElementById('nav-liked');
const feedTitle = document.getElementById('feed-title');

const channelInput = document.getElementById('channel-input');
const channelSuggestions = document.getElementById('channel-suggestions');
const channelPillsContainer = document.getElementById('channel-pills');
const topicInput = document.getElementById('topic-input');
const topicPillsContainer = document.getElementById('topic-pills');

let currentPrefs = null;
let selectedChannels = [];
let selectedTopics = [];
let debounceTimer;

async function checkOnboarding() {
    const prefs = await ipcRenderer.invoke('get-preferences');
    if (prefs) {
        currentPrefs = prefs;
        showMainView(prefs);
    }
}

/**
 * Autocomplete for Channels
 */
channelInput.oninput = () => {
    clearTimeout(debounceTimer);
    const query = channelInput.value.trim();
    
    if (query.length < 2) {
        channelSuggestions.style.display = 'none';
        return;
    }

    debounceTimer = setTimeout(async () => {
        const results = await ipcRenderer.invoke('search-channels', query);
        if (results && !results.error) {
            renderSuggestions(results);
        }
    }, 400);
};

function renderSuggestions(channels) {
    channelSuggestions.innerHTML = '';
    channelSuggestions.style.display = 'block';

    channels.forEach(channel => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.innerHTML = `
            <img src="${channel.thumbnail}" />
            <span>${channel.title}</span>
        `;
        div.onclick = () => {
            addPill('channel', channel.title);
            channelInput.value = '';
            channelSuggestions.style.display = 'none';
        };
        channelSuggestions.appendChild(div);
    });
}

/**
 * Pill Management
 */
function addPill(type, value) {
    if (type === 'channel' && !selectedChannels.includes(value)) {
        selectedChannels.push(value);
        renderPills('channel');
    } else if (type === 'topic' && !selectedTopics.includes(value)) {
        selectedTopics.push(value);
        renderPills('topic');
    }
}

function removePill(type, value) {
    if (type === 'channel') {
        selectedChannels = selectedChannels.filter(v => v !== value);
        renderPills('channel');
    } else {
        selectedTopics = selectedTopics.filter(v => v !== value);
        renderPills('topic');
    }
}

function renderPills(type) {
    const container = type === 'channel' ? channelPillsContainer : topicPillsContainer;
    const list = type === 'channel' ? selectedChannels : selectedTopics;
    
    container.innerHTML = '';
    list.forEach(val => {
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.innerHTML = `
            <span>${val}</span>
            <span class="remove">×</span>
        `;
        pill.querySelector('.remove').onclick = () => removePill(type, val);
        container.appendChild(pill);
    });
}

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

topicInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        const val = topicInput.value.trim();
        if (val) {
            addPill('topic', val);
            topicInput.value = '';
        }
    }
};

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
    navForYou.classList.toggle('active', activeId === 'for-you');
    navLiked.classList.toggle('active', activeId === 'liked');
    
    // Explicitly reset colors if needed, but the CSS class handles it now
    navForYou.style.color = activeId === 'for-you' ? '#fff' : '#666';
    navLiked.style.color = activeId === 'liked' ? '#fff' : '#666';
}

navForYou.onclick = loadForYou;
navLiked.onclick = loadLiked;

function playNextInGrid(currentId) {
    const cards = Array.from(videoGrid.querySelectorAll('.video-card'));
    const currentIndex = cards.findIndex(c => c.id === `card-${currentId}` || c.getAttribute('data-id') === currentId);
    
    if (currentIndex !== -1 && currentIndex < cards.length - 1) {
        const nextCard = cards[currentIndex + 1];
        nextCard.click();
    } else {
        logStatus('Reached end of feed.');
        closeWatch.click();
    }
}

function renderGrid(videos) {
    if (!videos || videos.length === 0) {
        videoGrid.innerHTML = '<div class="error-msg">No videos found. Try adding more topics in Onboarding.</div>';
        return;
    }
    videoGrid.innerHTML = '';
    videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.id = `card-${video.id}`;
        card.setAttribute('data-id', video.id);
        
        // Redundancy: Thumbnail fallback
        const thumbUrl = video.thumbnail || 'https://via.placeholder.com/1280x720/111/fff?text=No+Thumbnail';
        
        card.innerHTML = `
            <div class="thumb" style="background-image: url('${thumbUrl}'); background-size: cover; background-position: center;">
                <span class="duration-badge">${video.duration || '0:00'}</span>
            </div>
            <div class="video-info">
                <h4>${video.title || 'Untitled Video'}</h4>
                <p style="color: #666; font-size: 0.8rem; margin-top: 5px;">${video.views || 'Unknown'} views</p>
            </div>
        `;
        card.onclick = () => watchVideo(video);
        videoGrid.appendChild(card);
    });
}

function watchVideo(video) {
    watchOverlay.style.display = 'block';
    player.src = `http://localhost:8888/stream/${video.id}`;
    
    // Auto-next logic
    player.onended = () => {
        logStatus('Video ended, playing next...');
        playNextInGrid(video.id);
    };

    // Update progress bar
    player.ontimeupdate = () => {
        const percent = (player.currentTime / player.duration) * 100;
        progressBar.style.width = `${percent}%`;
    };

    // Seek on progress bar click
    progressContainer.onclick = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        player.currentTime = pos * player.duration;
    };

    // Play/Pause on click
    player.onclick = () => {
        if (player.paused) player.play();
        else player.pause();
    };

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
            <div class="thumb" style="background-image: url('${video.thumbnail}'); background-size: cover; background-position: center;">
                <span class="duration-badge">${video.duration}</span>
            </div>
            <div class="video-info">
                <h4>${video.title}</h4>
                <p style="color: #666; font-size: 0.8rem; margin-top: 5px;">${video.views}</p>
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

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        if (watchOverlay.style.display === 'block') {
            closeWatch.click();
        }
    } else if (e.code === 'Space') {
        if (watchOverlay.style.display === 'block') {
            e.preventDefault();
            if (player.paused) player.play();
            else player.pause();
        }
    } else if (e.code === 'KeyM') {
        if (watchOverlay.style.display === 'block') {
            player.muted = !player.muted;
        }
    }
});

// Start
checkOnboarding();
