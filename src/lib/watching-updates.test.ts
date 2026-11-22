jest.mock('@/lib/auth', () => ({
  getAuthInfoFromBrowserCookie: () => ({ username: 'test-user' }),
}));

import {
  type WatchingUpdate,
  checkWatchingUpdates,
  forceClearWatchingUpdatesCache,
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  markUpdatesAsViewed,
} from './watching-updates';

function createUpdate(overrides: Partial<WatchingUpdate> = {}): WatchingUpdate {
  return {
    continueWatchingCount: 0,
    hasUpdates: true,
    timestamp: Date.now(),
    updatedCount: 1,
    updatedSeries: [
      {
        title: '测试剧集',
        source_name: '测试源',
        year: '2026',
        cover: '',
        sourceKey: 'source',
        videoId: 'id',
        currentEpisode: 1,
        totalEpisodes: 2,
        hasNewEpisode: true,
        hasContinueWatching: false,
        newEpisodes: 1,
      },
    ],
    ...overrides,
  };
}

function mockFetchWith(payload: WatchingUpdate) {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => payload,
    ok: true,
    status: 200,
  });
}

describe('watching updates cache helpers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // 重置模块级内存缓存
    forceClearWatchingUpdatesCache();
    mockFetchWith(createUpdate());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    forceClearWatchingUpdatesCache();
  });

  it('reads fresh cached watching updates', async () => {
    const update = createUpdate();
    mockFetchWith(update);
    await checkWatchingUpdates(true);

    expect(getCachedWatchingUpdates()).toBe(true);
    expect(getDetailedWatchingUpdates()).toEqual(update);
  });

  it('ignores expired cached watching updates', async () => {
    await checkWatchingUpdates(true);

    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 4 * 60 * 60 * 1000);
    try {
      expect(getCachedWatchingUpdates()).toBe(false);
      expect(getDetailedWatchingUpdates()).toBeNull();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('marks cached updates as viewed without deleting continue-watching data', async () => {
    mockFetchWith(createUpdate({ continueWatchingCount: 2 }));
    await checkWatchingUpdates(true);

    markUpdatesAsViewed();

    expect(getDetailedWatchingUpdates()).toEqual(
      expect.objectContaining({
        continueWatchingCount: 2,
        hasUpdates: false,
        updatedCount: 0,
        updatedSeries: [
          expect.objectContaining({
            hasNewEpisode: false,
            hasContinueWatching: false,
          }),
        ],
      }),
    );
  });

  it('force clears cached updates', async () => {
    await checkWatchingUpdates(true);

    const eventListener = jest.fn();
    window.addEventListener('watchingUpdatesChanged', eventListener, {
      once: true,
    });

    forceClearWatchingUpdatesCache();

    expect(getDetailedWatchingUpdates()).toBeNull();
    expect(eventListener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          hasUpdates: false,
          invalidated: true,
          updatedCount: 0,
        },
      }),
    );
  });

  it('publishes a normal empty result after an invalidated empty record set is checked', async () => {
    const eventListener = jest.fn();
    window.addEventListener('watchingUpdatesChanged', eventListener);

    mockFetchWith(
      createUpdate({
        hasUpdates: false,
        timestamp: Date.now(),
        updatedCount: 0,
        continueWatchingCount: 0,
        updatedSeries: [],
      }),
    );

    forceClearWatchingUpdatesCache();
    await checkWatchingUpdates(true);

    expect(eventListener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: {
          hasUpdates: false,
          invalidated: false,
          updatedCount: 0,
        },
      }),
    );
    expect(getDetailedWatchingUpdates()).toEqual(
      expect.objectContaining({
        hasUpdates: false,
        updatedSeries: [],
      }),
    );

    window.removeEventListener('watchingUpdatesChanged', eventListener);
  });

  it('reuses the in-flight non-forced check', async () => {
    let resolveFetch!: (value: {
      json: () => Promise<WatchingUpdate>;
      ok: boolean;
      status: number;
    }) => void;
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const eventListener = jest.fn();
    window.addEventListener('watchingUpdatesChanged', eventListener);

    const firstCheck = checkWatchingUpdates();
    const secondCheck = checkWatchingUpdates();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch({
      json: async () => createUpdate(),
      ok: true,
      status: 200,
    });
    await Promise.all([firstCheck, secondCheck]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('watchingUpdatesChanged', eventListener);
  });
});
