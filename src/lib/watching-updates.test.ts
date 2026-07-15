import {
  type WatchingUpdatesCache,
  checkWatchingUpdates,
  forceClearWatchingUpdatesCache,
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  markUpdatesAsViewed,
} from './watching-updates';

const WATCHING_UPDATES_CACHE_KEY = 'moontv_watching_updates';
const LAST_CHECK_TIME_KEY = 'moontv_last_update_check';

function createCache(
  overrides: Partial<WatchingUpdatesCache> = {},
): WatchingUpdatesCache {
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

function writeCache(cache: WatchingUpdatesCache) {
  localStorage.setItem(WATCHING_UPDATES_CACHE_KEY, JSON.stringify(cache));
}

describe('watching updates cache helpers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => [],
      ok: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
  });

  it('reads fresh cached watching updates', () => {
    const cache = createCache();
    writeCache(cache);

    expect(getCachedWatchingUpdates()).toBe(true);
    expect(getDetailedWatchingUpdates()).toEqual(cache);
  });

  it('ignores expired cached watching updates', () => {
    writeCache(
      createCache({
        timestamp: Date.now() - 31 * 60 * 1000,
      }),
    );

    expect(getCachedWatchingUpdates()).toBe(false);
    expect(getDetailedWatchingUpdates()).toBeNull();
  });

  it('marks cached updates as viewed without deleting continue-watching data', () => {
    writeCache(
      createCache({
        continueWatchingCount: 2,
      }),
    );

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

  it('force clears cached updates and last check time', () => {
    writeCache(createCache());
    localStorage.setItem(LAST_CHECK_TIME_KEY, String(Date.now()));
    const eventListener = jest.fn();
    window.addEventListener('watchingUpdatesChanged', eventListener, {
      once: true,
    });

    forceClearWatchingUpdatesCache();

    expect(localStorage.getItem(WATCHING_UPDATES_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LAST_CHECK_TIME_KEY)).toBeNull();
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
});
