const mockGetAllPlayRecords = jest.fn();

jest.mock('./db.client', () => ({
  generateStorageKey: (source: string, id: string) => `${source}+${id}`,
  getAllPlayRecords: mockGetAllPlayRecords,
  parseStorageKey: jest.fn(),
}));

export {};

type RuntimeConfigWindow = Window & {
  RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
};

function createServerResponse() {
  return {
    continueWatchingCount: 1,
    hasUpdates: true,
    timestamp: Date.now(),
    updatedCount: 1,
    updatedSeries: [
      {
        cover: '',
        currentEpisode: 1,
        hasContinueWatching: true,
        hasNewEpisode: true,
        source_name: '测试源',
        sourceKey: 'source',
        title: '测试剧集',
        totalEpisodes: 2,
        videoId: 'id',
        year: '2026',
      },
    ],
  };
}

describe('watching updates server mode', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (window as RuntimeConfigWindow).RUNTIME_CONFIG;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    mockGetAllPlayRecords.mockReset();
    (window as RuntimeConfigWindow).RUNTIME_CONFIG = {
      STORAGE_TYPE: 'redis',
    };
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (window as RuntimeConfigWindow).RUNTIME_CONFIG = originalRuntimeConfig;
    consoleErrorSpy.mockRestore();
    jest.resetModules();
  });

  it('rejects when the server responds with a non-success status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const { checkWatchingUpdates } = await import('./watching-updates');

    await expect(checkWatchingUpdates()).rejects.toThrow(
      '获取追更提醒失败: 503',
    );
  });

  it('rejects when the server returns an invalid payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ hasUpdates: true, updatedSeries: null }),
      ok: true,
      status: 200,
    });
    const { checkWatchingUpdates } = await import('./watching-updates');

    await expect(checkWatchingUpdates()).rejects.toThrow(
      '获取追更提醒失败: invalid payload',
    );
  });

  it('rejects when the server request fails', async () => {
    const networkError = new Error('network unavailable');
    global.fetch = jest.fn().mockRejectedValue(networkError);
    const { checkWatchingUpdates } = await import('./watching-updates');

    await expect(checkWatchingUpdates()).rejects.toBe(networkError);
  });

  it('caches a valid response and publishes one update event', async () => {
    const responseData = createServerResponse();
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => responseData,
      ok: true,
      status: 200,
    });
    const eventListener = jest.fn();
    window.addEventListener('watchingUpdatesChanged', eventListener);
    const { checkWatchingUpdates, getDetailedWatchingUpdates } =
      await import('./watching-updates');

    await expect(checkWatchingUpdates()).resolves.toBeUndefined();

    expect(getDetailedWatchingUpdates()).toEqual(responseData);
    expect(eventListener).toHaveBeenCalledTimes(1);
    expect(eventListener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          hasUpdates: true,
          invalidated: false,
          updatedCount: 1,
        },
      }),
    );
    window.removeEventListener('watchingUpdatesChanged', eventListener);
  });
});
