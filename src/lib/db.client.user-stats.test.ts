import type { PlayRecord } from './types';

export {};

type RuntimeWindow = typeof window & {
  RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
};

const record: PlayRecord = {
  title: '剧',
  source_name: '源',
  cover: '',
  year: '2024',
  index: 1,
  total_episodes: 12,
  play_time: 50,
  total_time: 1000,
  save_time: 1000,
  search_title: '',
};

const LAST_PROGRESS_KEY = 'last_progress_源+剧-2024+1';
const LAST_UPDATE_TIME_KEY = 'last_update_time_源+剧-2024+1';
const USER_STATS_KEY = 'moontv_user_stats';

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

describe('calculateRegistrationDays', () => {
  const originalRuntimeConfig = (window as RuntimeWindow).RUNTIME_CONFIG;

  afterEach(() => {
    (window as RuntimeWindow).RUNTIME_CONFIG = originalRuntimeConfig;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('按自然日计算注册天数', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    const { calculateRegistrationDays } = await import('./db.client');

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    expect(calculateRegistrationDays(0)).toBe(0);
    expect(calculateRegistrationDays(-1)).toBe(0);
    expect(calculateRegistrationDays(startOfToday)).toBe(1);
    expect(calculateRegistrationDays(startOfToday - 40 * 86400000)).toBe(41);
  });
});

describe('db.client user-stats（redis 模式）', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (window as RuntimeWindow).RUNTIME_CONFIG;

  const flushAsync = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  const serverStats = {
    username: 'test-user',
    totalWatchTime: 100,
    totalPlays: 2,
    lastPlayTime: 2000,
    recentRecords: [],
    avgWatchTime: 50,
    mostWatchedSource: '源',
    totalMovies: 2,
    firstWatchDate: 500,
    lastUpdateTime: 2000,
  };

  const localPlayRecord: PlayRecord = {
    ...record,
    play_time: 100,
    search_title: '',
  };

  let fetchMock: jest.Mock;
  let postUserStats: Record<string, unknown> | null;
  let playRecords: Record<string, PlayRecord>;

  beforeEach(() => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    postUserStats = null;
    playRecords = {};
    fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.startsWith('/api/user/my-stats')) {
          if (method === 'POST') {
            return jsonResponse({ userStats: postUserStats });
          }
          return jsonResponse(serverStats);
        }
        if (url.startsWith('/api/playrecords')) {
          return jsonResponse(playRecords);
        }
        return { ok: false } as Response;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    localStorage.clear();
    (window as RuntimeWindow).RUNTIME_CONFIG = originalRuntimeConfig;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('getUserStats 首次从 API 获取并缓存，命中后返回缓存且后台同步不派发事件', async () => {
    const updates = listen('userStatsUpdated');
    const { getUserStats } = await import('./db.client');

    await expect(getUserStats()).resolves.toEqual(serverStats);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getUserStats()).resolves.toEqual(serverStats);
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([]);
  });

  it('getUserStats 强制刷新时绕过缓存重新拉取', async () => {
    const { getUserStats } = await import('./db.client');

    await getUserStats();
    const freshStats = { ...serverStats, totalWatchTime: 999 };
    fetchMock.mockImplementationOnce(
      async () => jsonResponse(freshStats) as Response,
    );

    await expect(getUserStats(true)).resolves.toEqual(freshStats);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('服务器失败时基于本地播放记录计算统计并兜底 search_title', async () => {
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/user/my-stats')) {
          return { ok: false, status: 500 } as Response;
        }
        if (url.startsWith('/api/playrecords')) {
          return jsonResponse({ 'src+1': localPlayRecord });
        }
        return { ok: false } as Response;
      },
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getUserStats } = await import('./db.client');

    const stats = await getUserStats();
    expect(stats).toMatchObject({
      username: 'test-user',
      totalWatchTime: 100,
      totalPlays: 1,
      lastPlayTime: 1000,
      firstWatchDate: 1000,
      avgWatchTime: 100,
      mostWatchedSource: '源',
      totalMovies: 1,
    });
    expect(stats.recentRecords[0].search_title).toBe('剧');
  });

  it('updateUserStats 在 10 秒内且进度无变化时不发起请求', async () => {
    localStorage.setItem(LAST_PROGRESS_KEY, '50');
    localStorage.setItem(LAST_UPDATE_TIME_KEY, String(Date.now()));
    const { updateUserStats } = await import('./db.client');

    await updateUserStats(record);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updateUserStats 计算观看增量后 POST 统计并写入本地进度', async () => {
    postUserStats = { ...serverStats, totalWatchTime: 150 };
    const updates = listen('userStatsUpdated');
    const { updateUserStats } = await import('./db.client');

    await updateUserStats(record);

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? '').toUpperCase() === 'POST',
    );
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body).toMatchObject({
      watchTime: 50,
      movieKey: '剧_源_2024',
    });
    expect(typeof body.timestamp).toBe('number');

    expect(localStorage.getItem(LAST_PROGRESS_KEY)).toBe('50');
    expect(updates).toEqual([postUserStats]);
  });

  it('updateUserStats 服务端失败时仅更新本地进度记录', async () => {
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.startsWith('/api/user/my-stats') && method === 'POST') {
          return { ok: false, status: 500 } as Response;
        }
        return { ok: false } as Response;
      },
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { updateUserStats } = await import('./db.client');

    await updateUserStats(record);
    expect(localStorage.getItem(LAST_PROGRESS_KEY)).toBe('50');
    expect(localStorage.getItem(LAST_UPDATE_TIME_KEY)).toBeTruthy();
  });

  it('clearUserStats 调用 DELETE 并派发清零事件', async () => {
    const updates = listen('userStatsUpdated');
    const { clearUserStats } = await import('./db.client');

    await clearUserStats();

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? '').toUpperCase() === 'DELETE',
    );
    expect(String(deleteCall?.[0])).toBe('/api/user/my-stats');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      username: 'test-user',
      totalWatchTime: 0,
      totalPlays: 0,
      totalMovies: 0,
    });
  });
});

describe('db.client user-stats（localStorage 模式）', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (window as RuntimeWindow).RUNTIME_CONFIG;

  afterEach(() => {
    global.fetch = originalFetch;
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    localStorage.clear();
    (window as RuntimeWindow).RUNTIME_CONFIG = originalRuntimeConfig;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('updateUserStats 本地累计观看时间并写入统计与进度', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const updates = listen('userStatsUpdated');
    const { updateUserStats } = await import('./db.client');

    await updateUserStats(record);

    expect(fetchMock).not.toHaveBeenCalled();
    const stored = JSON.parse(
      localStorage.getItem(USER_STATS_KEY) || '{}',
    ) as { totalWatchTime: number; totalMovies: number };
    expect(stored.totalWatchTime).toBe(50);
    expect(stored.totalMovies).toBe(0);
    expect(localStorage.getItem(LAST_PROGRESS_KEY)).toBe('50');
    expect(updates).toHaveLength(1);
  });

  it('updateUserStats 10 秒内无进度变化时跳过更新', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    localStorage.setItem(LAST_PROGRESS_KEY, '50');
    localStorage.setItem(LAST_UPDATE_TIME_KEY, String(Date.now()));
    const { updateUserStats } = await import('./db.client');

    await updateUserStats(record);
    expect(localStorage.getItem(USER_STATS_KEY)).toBeNull();
  });
});
