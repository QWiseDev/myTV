import type { EpisodeSkipConfig } from './types';

export {};

const skipConfig: EpisodeSkipConfig = {
  source: 'src',
  id: 'id1',
  title: '测试剧',
  segments: [{ start: 0, end: 30, type: 'opening' }],
  updated_time: 1,
};

const STORAGE_KEY = 'moontv_skip_configs';

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

describe('db.client skip-configs（localStorage 模式）', () => {
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

  it('保存、读取、删除配置并派发全量更新事件', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    const updates = listen('skipConfigsUpdated');
    const {
      saveSkipConfig,
      getSkipConfig,
      deleteSkipConfig,
      getAllSkipConfigs,
    } = await import('./db.client');

    await saveSkipConfig('src', 'id1', skipConfig);
    expect(updates).toEqual([{ 'src+id1': skipConfig }]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '')).toEqual({
      'src+id1': skipConfig,
    });

    await expect(getSkipConfig('src', 'id1')).resolves.toEqual(skipConfig);
    await expect(getSkipConfig('src', 'missing')).resolves.toBeNull();
    await expect(getAllSkipConfigs()).resolves.toEqual({
      'src+id1': skipConfig,
    });

    await deleteSkipConfig('src', 'id1');
    expect(updates.at(-1)).toEqual({});
    await expect(getAllSkipConfigs()).resolves.toEqual({});
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{}');
  });

  it('删除不存在的原始数据时不派发事件', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    const updates = listen('skipConfigsUpdated');
    const { deleteSkipConfig } = await import('./db.client');

    await deleteSkipConfig('src', 'id1');
    expect(updates).toEqual([]);
  });

  it('脏 localStorage 数据返回兜底并触发全局错误', async () => {
    (window as RuntimeWindow).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    localStorage.setItem(STORAGE_KEY, '{broken json');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const globalErrors = listen('globalError');
    const { getSkipConfig, getAllSkipConfigs } = await import('./db.client');

    await expect(getSkipConfig('src', 'id1')).resolves.toBeNull();
    await expect(getAllSkipConfigs()).resolves.toEqual({});
    // 只有 getAllSkipConfigs 的兜底会触发全局错误，getSkipConfig 静默返回 null
    expect(globalErrors).toEqual([{ message: '读取跳过片头片尾配置失败' }]);
  });
});

describe('db.client skip-configs（redis 模式，裸 fetch 客户端语义）', () => {
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
    fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        // GET /api/skipconfigs（fetchFromApi）直接返回配置字典，
        // POST action:get 的响应体才是 { config }
        if (method === 'GET') {
          return jsonResponse({ 'src+id1': skipConfig });
        }
        return jsonResponse({ config: skipConfig });
      },
    ) as unknown as jest.Mock;
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

  it('未登录时不发起请求直接返回 null（裸 fetch 前置检查）', async () => {
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    const { getSkipConfig } = await import('./db.client');

    await expect(getSkipConfig('src', 'id1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('缓存未命中时 POST action:get 拉取并写入缓存，命中后不再请求', async () => {
    const { getSkipConfig } = await import('./db.client');

    await expect(getSkipConfig('src', 'id1')).resolves.toEqual(skipConfig);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const postCall = fetchMock.mock.calls[0];
    expect(String(postCall[0])).toBe('/api/skipconfigs');
    expect(JSON.parse(String(postCall[1]?.body))).toEqual({
      action: 'get',
      key: 'src+id1',
      username: 'test-user',
    });

    await expect(getSkipConfig('src', 'id1')).resolves.toEqual(skipConfig);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('POST 失败时返回 null 兜底', async () => {
    fetchMock.mockImplementation(
      async () => ({ ok: false, status: 500 }) as Response,
    );
    const { getSkipConfig } = await import('./db.client');

    await expect(getSkipConfig('src', 'id1')).resolves.toBeNull();
  });

  it('saveSkipConfig 乐观派发事件后 POST action:set', async () => {
    const updates = listen('skipConfigsUpdated');
    const { saveSkipConfig } = await import('./db.client');

    await saveSkipConfig('src', 'id1', skipConfig);
    expect(updates).toEqual([{ 'src+id1': skipConfig }]);

    const postCall = fetchMock.mock.calls[0];
    expect(JSON.parse(String(postCall[1]?.body))).toEqual({
      action: 'set',
      key: 'src+id1',
      config: skipConfig,
      username: 'test-user',
    });
  });

  it('saveSkipConfig 未登录时抛出未登录错误且不请求', async () => {
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { saveSkipConfig } = await import('./db.client');

    await expect(saveSkipConfig('src', 'id1', skipConfig)).rejects.toThrow(
      '未登录',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saveSkipConfig 服务端失败时抛错并触发全局错误', async () => {
    fetchMock.mockImplementation(
      async () => ({ ok: false, status: 500 }) as Response,
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const globalErrors = listen('globalError');
    const { saveSkipConfig } = await import('./db.client');

    await expect(saveSkipConfig('src', 'id1', skipConfig)).rejects.toThrow(
      '保存跳过配置失败',
    );
    expect(globalErrors).toEqual([{ message: '保存跳过配置失败' }]);
  });

  it('deleteSkipConfig 乐观移除后 POST action:delete', async () => {
    const updates = listen('skipConfigsUpdated');
    const { saveSkipConfig, deleteSkipConfig } = await import('./db.client');
    await saveSkipConfig('src', 'id1', skipConfig);

    await deleteSkipConfig('src', 'id1');
    expect(updates.at(-1)).toEqual({});

    const deleteCall = fetchMock.mock.calls.at(-1);
    expect(JSON.parse(String(deleteCall?.[1]?.body))).toEqual({
      action: 'delete',
      key: 'src+id1',
      username: 'test-user',
    });
  });

  it('getAllSkipConfigs 首次 GET 建立缓存，此后后台同步', async () => {
    const updates = listen('skipConfigsUpdated');
    const { getAllSkipConfigs } = await import('./db.client');

    await expect(getAllSkipConfigs()).resolves.toEqual({
      'src+id1': skipConfig,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getAllSkipConfigs()).resolves.toEqual({
      'src+id1': skipConfig,
    });
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([]);
  });
});
