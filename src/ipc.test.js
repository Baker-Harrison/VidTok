const fs = require('fs');
const os = require('os');
const path = require('path');

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vidtok-ipc-'));

const createIpcMainMock = () => {
  const handlers = new Map();
  return {
    handlers,
    handle: jest.fn((channel, handler) => {
      handlers.set(channel, handler);
    })
  };
};

const setupMain = ({ tempDir, storageMock } = {}) => {
  jest.resetModules();
  jest.unmock('./storage');
  const ipcMainMock = createIpcMainMock();
  const userDataPath = path.join(tempDir, 'userData');
  const tempPath = path.join(tempDir, 'temp');

  jest.doMock('electron', () => ({
    app: {
      getPath: jest.fn((name) => {
        if (name === 'userData') return userDataPath;
        if (name === 'temp') return tempPath;
        return tempDir;
      }),
      whenReady: jest.fn(() => Promise.resolve()),
      on: jest.fn(),
      quit: jest.fn()
    },
    BrowserWindow: jest.fn(() => ({ loadFile: jest.fn() })),
    ipcMain: ipcMainMock
  }));

  jest.doMock('express', () => jest.fn(() => ({
    get: jest.fn(),
    listen: jest.fn()
  })));

  jest.doMock('axios-retry', () => ({ default: jest.fn() }));
  jest.doMock('axios', () => ({ get: jest.fn() }));

  if (storageMock) {
    jest.doMock('./storage', () => storageMock);
  }

  require('./main');

  return {
    axios: require('axios'),
    ipcMainMock,
    storageMock
  };
};

describe('IPC integration tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('get-trending-videos calls YouTube API and filters viewed results', async () => {
    const tempDir = createTempDir();
    const storageMock = {
      getViewedIds: jest.fn().mockResolvedValue(['v2'])
    };
    const { axios, ipcMainMock } = setupMain({ tempDir, storageMock });

    axios.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'v1',
            snippet: { title: 'Video 1', thumbnails: { high: { url: 'thumb1' } } },
            contentDetails: { duration: 'PT2M10S' },
            statistics: { viewCount: '123' }
          },
          {
            id: 'v2',
            snippet: { title: 'Video 2', thumbnails: { high: { url: 'thumb2' } } },
            contentDetails: { duration: 'PT3M00S' },
            statistics: { viewCount: '456' }
          }
        ],
        nextPageToken: 'next-page'
      }
    });

    const handler = ipcMainMock.handlers.get('get-trending-videos');
    const result = await handler(null, 'page-1');

    expect(axios.get).toHaveBeenCalledWith('https://www.googleapis.com/youtube/v3/videos', expect.objectContaining({
      params: expect.objectContaining({
        chart: 'mostPopular',
        pageToken: 'page-1'
      })
    }));
    expect(storageMock.getViewedIds).toHaveBeenCalledTimes(1);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].id).toBe('v1');
    expect(result.nextPageToken).toBe('next-page');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('get-personalized-feed blends likes and topics correctly', async () => {
    const tempDir = createTempDir();
    const storageMock = {
      getViewedIds: jest.fn().mockResolvedValue([]),
      getLikes: jest.fn().mockResolvedValue([
        { title: 'Like One' },
        { title: 'Like Two' },
        { title: 'Like Three' },
        { title: 'Like Four' }
      ])
    };
    const { axios, ipcMainMock } = setupMain({ tempDir, storageMock });

    axios.get
      .mockResolvedValueOnce({
        data: {
          items: [{ id: { videoId: 'id1' } }, { id: { videoId: 'id2' } }],
          nextPageToken: 'next-personal'
        }
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'id1',
              snippet: { title: 'Video A', thumbnails: { high: { url: 'thumbA' } } },
              contentDetails: { duration: 'PT5M00S' },
              statistics: { viewCount: '1000' }
            },
            {
              id: 'id2',
              snippet: { title: 'Video B', thumbnails: { high: { url: 'thumbB' } } },
              contentDetails: { duration: 'PT4M10S' },
              statistics: { viewCount: '2000' }
            }
          ]
        }
      });

    const handler = ipcMainMock.handlers.get('get-personalized-feed');
    const prefs = { channels: ['Channel A'], topics: ['Topic A', 'Topic B'] };
    const result = await handler(null, prefs, 'token-1');

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get.mock.calls[0][0]).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(axios.get.mock.calls[0][1].params.q)
      .toBe('Like One Like Two Like Three Channel A Topic A Topic B');
    expect(axios.get.mock.calls[1][0]).toBe('https://www.googleapis.com/youtube/v3/videos');
    expect(axios.get.mock.calls[1][1].params.id).toBe('id1,id2');
    expect(result.videos).toHaveLength(2);
    expect(result.nextPageToken).toBe('next-personal');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('save-settings/get-settings round-trip through NeDB', async () => {
    const tempDir = createTempDir();
    const { ipcMainMock } = setupMain({ tempDir });

    const saveHandler = ipcMainMock.handlers.get('save-settings');
    const getHandler = ipcMainMock.handlers.get('get-settings');

    await saveHandler(null, { volume: 0.4, muted: true });
    const settings = await getHandler();

    expect(settings.volume).toBe(0.4);
    expect(settings.muted).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
