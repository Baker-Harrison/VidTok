jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
  },
}));

const { ipcRenderer } = require('electron');

const buildDom = () => {
  document.body.innerHTML = `
    <div id="onboarding"></div>
    <div id="main-view"></div>
    <div id="video-grid" class="grid"></div>
    <div id="watch-overlay"></div>
    <video id="player"></video>
    <div id="progress-bar"></div>
    <div id="progress-container"></div>
    <button id="close-watch"></button>
    <button id="nav-for-you"></button>
    <button id="nav-liked"></button>
    <h3 id="feed-title"></h3>
    <div id="content"></div>
    <input id="channel-input" />
    <div id="channel-suggestions"></div>
    <div id="channel-pills"></div>
    <input id="topic-input" />
    <div id="topic-pills"></div>
    <button id="finish-onboarding"></button>
  `;
};

describe('Discovery Grid Virtualization', () => {
  beforeEach(() => {
    jest.resetModules();
    buildDom();

    ipcRenderer.invoke.mockImplementation((channel) => {
      if (channel === 'get-preferences') return Promise.resolve(null);
      if (channel === 'get-settings') return Promise.resolve({ volume: 1, muted: false });
      if (channel === 'get-position') return Promise.resolve(0);
      if (channel === 'get-likes') return Promise.resolve([]);
      if (channel === 'get-personalized-feed') return Promise.resolve({ videos: [], nextPageToken: null });
      return Promise.resolve(null);
    });

    const content = document.getElementById('content');
    Object.defineProperty(content, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(content, 'scrollHeight', { value: 5000, configurable: true });

    require('./renderer.js');
  });

  test('DOM count remains stable while scrolling a long list', () => {
    const videos = Array.from({ length: 200 }, (_, i) => ({
      id: `v${i}`,
      title: `Video ${i}`,
      thumbnail: `thumb-${i}`,
      duration: '1:00',
      views: '1K',
    }));

    window.__vidtok.setVirtualDimensions({ itemHeight: 220, rowGap: 20, columns: 3 });
    window.__vidtok.setVirtualVideos(videos);
    window.__vidtok.renderVirtualWindow(true);

    const initialCount = window.__vidtok.getDomCardCount();
    expect(initialCount).toBeGreaterThan(0);
    expect(initialCount).toBeLessThanOrEqual(30);

    const content = document.getElementById('content');
    content.scrollTop = 3000;
    window.__vidtok.renderVirtualWindow(true);

    const afterScrollCount = window.__vidtok.getDomCardCount();
    expect(afterScrollCount).toBeLessThanOrEqual(30);
    expect(afterScrollCount).toBe(initialCount);
  });
});
