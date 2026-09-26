export {};

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

function requestUrl(call: unknown[]): string {
  return String(call[0]);
}

describe('db.client search-history（localStorage 模式）', () => {
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

  it('增删改查往返：去重置顶、单删与清空', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    const updates = listen('searchHistoryUpdated');
    const { addSearchHistory, getSearchHistory, deleteSearchHistory } =
      await import('./db.client');

    await addSearchHistory('第一季');
    await addSearchHistory('第二季');
    await addSearchHistory('第一季');
    await expect(getSearchHistory()).resolves.toEqual(['第一季', '第二季']);
    expect(updates).toEqual([
      ['第一季'],
      ['第二季', '第一季'],
      ['第一季', '第二季'],
    ]);
    expect(
      JSON.parse(localStorage.getItem('moontv_search_history') || ''),
    ).toEqual(['第一季', '第二季']);

    await deleteSearchHistory('第二季');
    await expect(getSearchHistory()).resolves.toEqual(['第一季']);
  });

  it('空关键字不产生任何写入', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    const updates = listen('searchHistoryUpdated');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { addSearchHistory, clearSearchHistory, getSearchHistory } =
      await import('./db.client');

    await addSearchHistory('   ');
    await expect(getSearchHistory()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toEqual([]);

    await clearSearchHistory();
    expect(updates).toEqual([[]]);
    expect(localStorage.getItem('moontv_search_history')).toBeNull();
  });

  it('历史超过 20 条时保留最新的 20 条', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    const { addSearchHistory, getSearchHistory } = await import('./db.client');

    for (let i = 1; i <= 25; i += 1) {
      await addSearchHistory(`关键字${i}`);
    }

    const history = await getSearchHistory();
    expect(history).toHaveLength(20);
    expect(history[0]).toBe('关键字25');
    expect(history).not.toContain('关键字5');
  });

  it('脏 localStorage 数据返回空数组并触发全局错误', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    localStorage.setItem('moontv_search_history', '{broken json');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const globalErrors = listen('globalError');
    const { getSearchHistory } = await import('./db.client');

    await expect(getSearchHistory()).resolves.toEqual([]);
    expect(globalErrors).toEqual([{ message: '读取搜索历史失败' }]);
  });

  it('非数组 JSON 视为空历史', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    localStorage.setItem('moontv_search_history', '{"oops":1}');
    const { getSearchHistory } = await import('./db.client');

    await expect(getSearchHistory()).resolves.toEqual([]);
  });
});

describe('db.client search-history（redis 模式）', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (window as RuntimeWindow).RUNTIME_CONFIG;

  const flushAsync = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  let fetchMock: jest.Mock;

  beforeEach(() => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl([input]);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/searchhistory')) {
        if (method === 'GET') {
          return jsonResponse(serverHistory.shift() ?? ['kw1']);
        }
        return jsonResponse({ ok: true });
      }
      return { ok: false } as Response;
    });
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

  let serverHistory: string[][];

  beforeEach(() => {
    serverHistory = [['kw1']];
  });

  it('缓存未命中时从 API 获取并写入缓存；命中后后台同步且数据一致不再派发事件', async () => {
    const updates = listen('searchHistoryUpdated');
    const { getSearchHistory } = await import('./db.client');

    await expect(getSearchHistory()).resolves.toEqual(['kw1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    serverHistory = [['kw1']];
    await expect(getSearchHistory()).resolves.toEqual(['kw1']);
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([]);
  });

  it('后台同步发现数据变化时更新缓存并派发事件', async () => {
    const updates = listen('searchHistoryUpdated');
    const { getSearchHistory } = await import('./db.client');

    await expect(getSearchHistory()).resolves.toEqual(['kw1']);
    serverHistory = [['kw0', 'kw1']];
    await expect(getSearchHistory()).resolves.toEqual(['kw1']);
    await flushAsync();
    expect(updates).toEqual([['kw0', 'kw1']]);

    // 缓存已被后台同步更新，下一次直接命中新数据
    serverHistory = [];
    await expect(getSearchHistory()).resolves.toEqual(['kw0', 'kw1']);
  });

  it('addSearchHistory 乐观更新缓存并携带关键字 POST', async () => {
    const updates = listen('searchHistoryUpdated');
    const { addSearchHistory } = await import('./db.client');

    await addSearchHistory('  新关键字  ');
    expect(updates).toEqual([['新关键字']]);

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? '').toUpperCase() === 'POST',
    );
    expect(requestUrl(postCall ?? [])).toBe('/api/searchhistory');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      keyword: '新关键字',
    });
  });

  it('addSearchHistory 同步失败时补偿拉取服务器数据并派发事件', async () => {
    serverHistory = [['服务器数据']];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl([input]);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.startsWith('/api/searchhistory')) {
          if (method === 'POST') {
            return { ok: false, status: 500 } as Response;
          }
          return jsonResponse(serverHistory[0]);
        }
        return { ok: false } as Response;
      },
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const updates = listen('searchHistoryUpdated');
    const globalErrors = listen('globalError');
    const { addSearchHistory } = await import('./db.client');

    await addSearchHistory('kw2');
    // 先乐观派发本地数据，POST 失败后补偿拉取并派发服务器数据
    expect(updates).toEqual([['kw2'], ['服务器数据']]);
    expect(globalErrors).toEqual([{ message: '数据库操作失败' }]);
  });

  it('deleteSearchHistory 携带编码关键字删除', async () => {
    const { addSearchHistory, deleteSearchHistory } = await import(
      './db.client'
    );
    await addSearchHistory('要删除的');

    await deleteSearchHistory('要删除的');
    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? '').toUpperCase() === 'DELETE',
    );
    expect(requestUrl(deleteCall ?? [])).toBe(
      `/api/searchhistory?keyword=${encodeURIComponent('要删除的')}`,
    );
  });
});
