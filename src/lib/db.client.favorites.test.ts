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

type RuntimeWindow = typeof window & {
  RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
};

function listen(name: string) {
  const events: unknown[] = [];
  const handler = (event: Event) => events.push((event as CustomEvent).detail);
  window.addEventListener(name, handler as EventListener);
  return events;
}

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  } as unknown as Response;
}

describe('db.client favorites 缓存优先读（redis 模式）', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (window as RuntimeWindow).RUNTIME_CONFIG;

  const flushAsync = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    global.fetch = originalFetch;
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    localStorage.clear();
    (window as RuntimeWindow).RUNTIME_CONFIG = originalRuntimeConfig;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('首次从 API 拉取建缓存，命中后后台同步更新并派发事件', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    let callCount = 0;
    const fetchMock = jest.fn(async (): Promise<Response> => {
      callCount += 1;
      return jsonResponse(
        callCount === 1
          ? { 'src+1': { title: '初始', source_name: '源', year: '2026', cover: '', total_episodes: 1, save_time: 1 } }
          : { 'src+1': { title: '初始', source_name: '源', year: '2026', cover: '', total_episodes: 1, save_time: 1 }, 'src+2': { title: '新增', source_name: '源', year: '2026', cover: '', total_episodes: 1, save_time: 2 } },
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const updates = listen('favoritesUpdated');
    const { getAllFavorites } = await import('./db.client');

    await expect(getAllFavorites()).resolves.toMatchObject({ 'src+1': {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getAllFavorites()).resolves.toMatchObject({ 'src+1': {} });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ 'src+2': {} });

    // 缓存已被后台同步替换
    await expect(getAllFavorites()).resolves.toMatchObject({
      'src+1': {},
      'src+2': {},
    });
  });

  it('初始拉取失败时抛出请求错误并触发全局错误', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    global.fetch = jest.fn(
      async () => ({ ok: false, status: 500 }) as Response,
    ) as unknown as typeof fetch;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const globalErrors = listen('globalError');
    const { getAllFavorites } = await import('./db.client');

    await expect(getAllFavorites()).rejects.toThrow(
      '请求 /api/favorites 失败: 500',
    );
    expect(globalErrors).toEqual([{ message: '获取收藏失败' }]);
  });

  it('isFavorited 基于缓存返回布尔投影', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    global.fetch = jest.fn(async () =>
      jsonResponse({
        'src+1': {
          title: '收藏剧集',
          source_name: '源',
          year: '2026',
          cover: '',
          total_episodes: 12,
          save_time: 1,
        },
      }),
    ) as unknown as typeof fetch;
    const { isFavorited } = await import('./db.client');

    await expect(isFavorited('src', '1')).resolves.toBe(true);
    await expect(isFavorited('src', '2')).resolves.toBe(false);
  });
});
