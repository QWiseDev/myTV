export {};

describe('clearAllFavorites', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (
    window as typeof window & {
      RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
    }
  ).RUNTIME_CONFIG;

  afterEach(() => {
    global.fetch = originalFetch;
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    localStorage.clear();
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = originalRuntimeConfig;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('keeps cached favorites when deletion and the compensating refresh both fail', async () => {
    const favorites = {
      'source-a+1': {
        title: '测试剧集',
        source_name: '测试源',
        year: '2026',
        cover: 'https://example.com/poster.jpg',
        total_episodes: 12,
        save_time: 1,
      },
    };
    const favoriteUpdates: Array<Record<string, unknown>> = [];
    let getRequestCount = 0;
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: false, status: 500 } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 2) {
          return { ok: false, status: 503 } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => favorites,
        } as Response;
      },
    );
    global.fetch = fetchMock;
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { clearAllFavorites, getAllFavorites } = await import('./db.client');
    await expect(getAllFavorites()).resolves.toEqual(favorites);
    window.addEventListener(
      'favoritesUpdated',
      ((event: CustomEvent) => {
        favoriteUpdates.push(event.detail);
      }) as EventListener,
    );

    await expect(clearAllFavorites()).rejects.toThrow(
      '请求 /api/favorites 失败: 500',
    );

    await expect(getAllFavorites()).resolves.toEqual(favorites);
    expect(favoriteUpdates).toEqual([]);
  });
});
