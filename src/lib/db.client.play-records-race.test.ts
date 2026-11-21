import type { PlayRecord } from './types';

jest.mock('./watching-updates', () => ({
  forceClearWatchingUpdatesCache: jest.fn(),
}));

export {};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    cover: '',
    index: 1,
    play_time: 10,
    save_time: 100,
    search_title: '测试剧集',
    source_name: '测试源',
    title: '测试剧集',
    total_episodes: 12,
    total_time: 100,
    year: '2026',
    ...overrides,
  };
}

describe('play record cache races', () => {
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

  it('does not let a stale background read restore a deleted record', async () => {
    const staleRead = createDeferred<Response>();
    const record = createRecord();
    const initialRecords = { 'source+id': record };
    let getRequestCount = 0;
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: true, status: 200 } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 1) {
          return {
            json: async () => initialRecords,
            ok: true,
            status: 200,
          } as Response;
        }
        if (getRequestCount === 2) {
          return staleRead.promise;
        }

        return {
          json: async () => ({}),
          ok: true,
          status: 200,
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

    const { deletePlayRecord, getAllPlayRecords } = await import('./db.client');
    await expect(getAllPlayRecords()).resolves.toEqual(initialRecords);
    await expect(getAllPlayRecords()).resolves.toEqual(initialRecords);

    await deletePlayRecord('source', 'id');
    staleRead.resolve({
      json: async () => ({ 'source+id': createRecord() }),
      ok: true,
      status: 200,
    } as Response);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(getAllPlayRecords()).resolves.toEqual({});
  });

  it('does not promote a cold-cache delete into a valid empty full cache', async () => {
    const remainingRecord = createRecord({ title: '保留记录' });
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: true, status: 200 } as Response;
        }

        return {
          json: async () => ({ 'source+remaining': remainingRecord }),
          ok: true,
          status: 200,
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

    const { deletePlayRecord, getAllPlayRecords } = await import('./db.client');
    await deletePlayRecord('source', 'deleted');
    expect(
      fetchMock.mock.calls.filter(([, init]) => !init?.method),
    ).toHaveLength(0);

    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+remaining': remainingRecord,
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => !init?.method),
    ).toHaveLength(1);
  });

  it('does not promote partial caller records into a full cache after save', async () => {
    const existingRecord = createRecord({
      original_episodes: 12,
      save_time: 90,
    });
    const savedRecord = createRecord({
      index: 2,
      original_episodes: 12,
      save_time: 100,
    });
    const otherRecord = createRecord({ title: '其它记录' });
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return {
            json: async () => ({ success: true }),
            ok: true,
            status: 200,
          } as Response;
        }

        return {
          json: async () => ({
            'source+id': savedRecord,
            'source+other': otherRecord,
          }),
          ok: true,
          status: 200,
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

    const { getAllPlayRecords, savePlayRecord } = await import('./db.client');
    await savePlayRecord('source', 'id', savedRecord, {
      'source+id': existingRecord,
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => !init?.method),
    ).toHaveLength(0);

    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+id': savedRecord,
      'source+other': otherRecord,
    });
  });

  it('does not commit a refresh started by the optimistic event before delete finishes', async () => {
    const deleteRequest = createDeferred<Response>();
    const initialRecords = { 'source+id': createRecord() };
    let getRequestCount = 0;
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return deleteRequest.promise;
        }

        getRequestCount += 1;
        return {
          json: async () =>
            getRequestCount === 1
              ? initialRecords
              : { 'source+id': createRecord() },
          ok: true,
          status: 200,
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

    const { deletePlayRecord, getAllPlayRecords } = await import('./db.client');
    await getAllPlayRecords();
    const reloads: Array<Promise<Record<string, PlayRecord>>> = [];
    const handleUpdate = () => {
      reloads.push(getAllPlayRecords());
    };
    window.addEventListener('playRecordsUpdated', handleUpdate);

    const deletePromise = deletePlayRecord('source', 'id');
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(reloads[0]).resolves.toEqual({});
    await expect(getAllPlayRecords()).resolves.toEqual({});

    deleteRequest.resolve({ ok: true, status: 200 } as Response);
    await deletePromise;
    window.removeEventListener('playRecordsUpdated', handleUpdate);
  });

  it('keeps an optimistic save while its event-triggered refresh races the write', async () => {
    const saveRequest = createDeferred<Response>();
    let getRequestCount = 0;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') return saveRequest.promise;
        getRequestCount += 1;
        return {
          json: async () => ({}),
          ok: true,
          status: 200,
        } as Response;
      },
    );
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    const { getAllPlayRecords, savePlayRecord } = await import('./db.client');
    await getAllPlayRecords();
    const reloads: Array<Promise<Record<string, PlayRecord>>> = [];
    const handleUpdate = () => reloads.push(getAllPlayRecords());
    window.addEventListener('playRecordsUpdated', handleUpdate);

    const record = createRecord();
    const savePromise = savePlayRecord('source', 'id', record, {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(reloads[0]).resolves.toEqual({ 'source+id': record });
    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+id': record,
    });

    saveRequest.resolve({
      json: async () => ({ success: true }),
      ok: true,
      status: 200,
    } as Response);
    await savePromise;
    window.removeEventListener('playRecordsUpdated', handleUpdate);
    // 新预算：pending 写期间不再触发后台刷新 GET，事件监听器的读取命中乐观完整缓存
    expect(getRequestCount).toBe(1);
  });

  it('keeps an optimistic clear while its event-triggered refresh races the write', async () => {
    const clearRequest = createDeferred<Response>();
    const initialRecords = { 'source+id': createRecord() };
    let getRequestCount = 0;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') return clearRequest.promise;
        getRequestCount += 1;
        return {
          json: async () => initialRecords,
          ok: true,
          status: 200,
        } as Response;
      },
    );
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    const { clearAllPlayRecords, getAllPlayRecords } =
      await import('./db.client');
    await getAllPlayRecords();
    const reloads: Array<Promise<Record<string, PlayRecord>>> = [];
    const handleUpdate = () => reloads.push(getAllPlayRecords());
    window.addEventListener('playRecordsUpdated', handleUpdate);

    const clearPromise = clearAllPlayRecords();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(reloads[0]).resolves.toEqual({});
    await expect(getAllPlayRecords()).resolves.toEqual({});

    clearRequest.resolve({ ok: true, status: 200 } as Response);
    await clearPromise;
    window.removeEventListener('playRecordsUpdated', handleUpdate);
    // 新预算：pending 写期间不再触发后台刷新 GET，事件监听器的读取命中乐观完整缓存
    expect(getRequestCount).toBe(1);
  });

  it('keeps pending reads and caches isolated when the signed-in user changes', async () => {
    const aliceRequest = createDeferred<Response>();
    const bobRequest = createDeferred<Response>();
    let requestCount = 0;
    global.fetch = jest.fn(() => {
      requestCount += 1;
      return requestCount === 1 ? aliceRequest.promise : bobRequest.promise;
    });
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'alice' }),
    )}; path=/`;
    const { getAllPlayRecords } = await import('./db.client');

    const aliceRecordsPromise = getAllPlayRecords();
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'bob' }),
    )}; path=/`;
    const bobRecordsPromise = getAllPlayRecords();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    bobRequest.resolve({
      json: async () => ({ 'source+bob': createRecord() }),
      ok: true,
      status: 200,
    } as Response);
    aliceRequest.resolve({
      json: async () => ({ 'source+alice': createRecord() }),
      ok: true,
      status: 200,
    } as Response);

    await expect(bobRecordsPromise).resolves.toEqual({
      'source+bob': createRecord(),
    });
    await expect(aliceRecordsPromise).resolves.toEqual({
      'source+alice': createRecord(),
    });
    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+bob': createRecord(),
    });
  });

  it('keeps save ordering while its preflight read is pending', async () => {
    const preflightRead = createDeferred<Response>();
    const requestOrder: string[] = [];
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          requestOrder.push('POST');
          return {
            json: async () => ({ success: true }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (init?.method === 'DELETE') {
          requestOrder.push('DELETE');
          return { ok: true, status: 200 } as Response;
        }

        requestOrder.push('GET');
        return preflightRead.promise;
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
    const { clearAllPlayRecords, savePlayRecord } = await import('./db.client');

    const savePromise = savePlayRecord('source', 'id', createRecord());
    const clearPromise = clearAllPlayRecords();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestOrder).toEqual(['GET']);

    preflightRead.resolve({
      json: async () => ({}),
      ok: true,
      status: 200,
    } as Response);
    await Promise.all([savePromise, clearPromise]);
    expect(requestOrder).toEqual(['GET', 'POST', 'DELETE']);
  });

  it('cancels a queued save if the user changes during its preflight read', async () => {
    const aliceRead = createDeferred<Response>();
    const bobRecord = createRecord({ title: 'Bob 记录' });
    let getRequestCount = 0;
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return {
            json: async () => ({ success: true }),
            ok: true,
            status: 200,
          } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 1) return aliceRead.promise;
        return {
          json: async () => ({ 'source+bob': bobRecord }),
          ok: true,
          status: 200,
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
      JSON.stringify({ username: 'alice' }),
    )}; path=/`;
    const { getAllPlayRecords, savePlayRecord } = await import('./db.client');

    const savePromise = savePlayRecord('source', 'alice', createRecord());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getRequestCount).toBe(1);
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'bob' }),
    )}; path=/`;
    aliceRead.resolve({
      json: async () => ({ 'source+alice': createRecord() }),
      ok: true,
      status: 200,
    } as Response);

    await expect(savePromise).rejects.toThrow('用户已切换');
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+bob': bobRecord,
    });
  });

  it('reconciles an ignored save before running the next queued mutation', async () => {
    const reconciliationRead = createDeferred<Response>();
    const cachedRecord = createRecord({ save_time: 100, title: '缓存记录' });
    const incomingRecord = createRecord({ save_time: 150, title: '旧保存' });
    const canonicalRecord = createRecord({
      save_time: 200,
      title: '服务端新记录',
    });
    const otherRecord = createRecord({ title: '待删除记录' });
    let getRequestCount = 0;
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return {
            json: async () => ({ ignored: true, success: true }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (init?.method === 'DELETE') {
          return { ok: true, status: 200 } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 1) {
          return {
            json: async () => ({
              'source+id': cachedRecord,
              'source+other': otherRecord,
            }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (getRequestCount === 2) return reconciliationRead.promise;
        return {
          json: async () => ({ 'source+id': canonicalRecord }),
          ok: true,
          status: 200,
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
    const { deletePlayRecord, getAllPlayRecords, savePlayRecord } =
      await import('./db.client');
    await getAllPlayRecords();

    const savePromise = savePlayRecord('source', 'id', incomingRecord, {
      'source+id': cachedRecord,
      'source+other': otherRecord,
    });
    const deletePromise = deletePlayRecord('source', 'other');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getRequestCount).toBe(2);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
    ).toHaveLength(0);

    reconciliationRead.resolve({
      json: async () => ({
        'source+id': canonicalRecord,
        'source+other': otherRecord,
      }),
      ok: true,
      status: 200,
    } as Response);
    await Promise.all([savePromise, deletePromise]);
    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+id': canonicalRecord,
    });
  });

  it('invalidates an ignored optimistic save when reconciliation fails', async () => {
    const cachedRecord = createRecord({ save_time: 100, title: '缓存记录' });
    const incomingRecord = createRecord({ save_time: 150, title: '旧保存' });
    const canonicalRecord = createRecord({
      save_time: 200,
      title: '服务端新记录',
    });
    let getRequestCount = 0;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return {
            json: async () => ({ ignored: true, success: true }),
            ok: true,
            status: 200,
          } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 1) {
          return {
            json: async () => ({ 'source+id': cachedRecord }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (getRequestCount === 2) {
          throw new Error('reconciliation failed');
        }
        return {
          json: async () => ({ 'source+id': canonicalRecord }),
          ok: true,
          status: 200,
        } as Response;
      },
    );
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getAllPlayRecords, savePlayRecord } = await import('./db.client');
    await getAllPlayRecords();

    await savePlayRecord('source', 'id', incomingRecord, {
      'source+id': cachedRecord,
    });
    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+id': canonicalRecord,
    });
  });

  it('reconciles a failed delete before applying the next queued save', async () => {
    const reconciliationRequest = createDeferred<Response>();
    const initialRecord = createRecord();
    // 保存下一条不同标题的记录：同名会触发跨源同名合并，与本用例的补偿语义无关
    const nextRecord = createRecord({
      title: '另一部剧',
      search_title: '另一部剧',
    });
    let getRequestCount = 0;
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: false, status: 500 } as Response;
        }
        if (init?.method === 'POST') {
          return {
            json: async () => ({ success: true }),
            ok: true,
            status: 200,
          } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 1) {
          return {
            json: async () => ({ 'source+id': initialRecord }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (getRequestCount === 2) {
          return reconciliationRequest.promise;
        }
        return {
          json: async () => ({
            'source+id': initialRecord,
            'source+next': nextRecord,
          }),
          ok: true,
          status: 200,
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
    const { deletePlayRecord, getAllPlayRecords, savePlayRecord } =
      await import('./db.client');
    await getAllPlayRecords();

    const deletePromise = deletePlayRecord('source', 'id').catch(
      () => undefined,
    );
    const savePromise = savePlayRecord('source', 'next', nextRecord, {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);

    reconciliationRequest.resolve({
      json: async () => ({ 'source+id': initialRecord }),
      ok: true,
      status: 200,
    } as Response);
    await Promise.all([deletePromise, savePromise]);

    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+id': initialRecord,
      'source+next': nextRecord,
    });
  });

  it('D7: clear 失败的权威补偿建立真实快照；补偿失败则缓存失效', async () => {
    const initialRecord = createRecord();
    const otherRecord = createRecord({ title: '幸存记录' });
    let getRequestCount = 0;
    let clearShouldFail = true;
    let failNextGet = false;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          if (clearShouldFail) {
            return { ok: false, status: 500 } as Response;
          }
          return { ok: true, status: 200 } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 1) {
          return {
            json: async () => ({ 'src+init': initialRecord }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (failNextGet) {
          failNextGet = false;
          throw new Error('reconcile failed');
        }
        return {
          json: async () => ({ 'src+other': otherRecord }),
          ok: true,
          status: 200,
        } as Response;
      },
    );
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { clearAllPlayRecords, getAllPlayRecords } =
      await import('./db.client');
    await getAllPlayRecords();

    // 失败 + 补偿成功：快照变为权威数据（区别于乐观 {}）
    await expect(clearAllPlayRecords()).rejects.toThrow();
    await expect(getAllPlayRecords()).resolves.toEqual({
      'src+other': otherRecord,
    });

    // 再次失败 + 补偿也失败：缓存失效，重新全量读取
    clearShouldFail = true;
    failNextGet = true;
    await expect(clearAllPlayRecords()).rejects.toThrow();
    await expect(getAllPlayRecords()).resolves.toEqual({
      'src+other': otherRecord,
    });
  });

  it('D10: forceRefresh 使快照过期并触发下一次全量读取', async () => {
    let getRequestCount = 0;
    global.fetch = jest.fn(async () => {
      getRequestCount += 1;
      return {
        json: async () => ({
          'src+fresh': createRecord({ title: `第${getRequestCount}次` }),
        }),
        ok: true,
        status: 200,
      } as Response;
    });
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    const { forceRefreshPlayRecordsCache, getAllPlayRecords } =
      await import('./db.client');
    await getAllPlayRecords();

    // 快照有效：命中缓存，仅触发一次去重的后台同步
    await getAllPlayRecords();
    expect(getRequestCount).toBe(2);

    forceRefreshPlayRecordsCache();
    // 过期快照等价 cold：发起新全量读取；在飞旧后台同步被 revision 门禁丢弃
    await expect(getAllPlayRecords()).resolves.toEqual({
      'src+fresh': createRecord({ title: '第3次' }),
    });
    expect(getRequestCount).toBe(3);
  });

  it('D10: refreshAllCache 经新 store 提交门禁刷新播放记录', async () => {
    let getRequestCount = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = input as string;
      if (url.includes('/api/playrecords')) {
        getRequestCount += 1;
        return {
          json: async () => ({
            'src+refreshed': createRecord({ title: '刷新后' }),
          }),
          ok: true,
          status: 200,
        } as Response;
      }
      return { json: async () => ({}), ok: true, status: 200 } as Response;
    });
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    const { getAllPlayRecords, refreshAllCache } = await import('./db.client');

    await refreshAllCache();
    // 快照已由 refreshAll 建立：命中缓存，仅触发一次后台同步
    await expect(getAllPlayRecords()).resolves.toEqual({
      'src+refreshed': createRecord({ title: '刷新后' }),
    });
    expect(getRequestCount).toBe(2);
  });

  it('D10: clearUserCache 丢弃播放记录快照并使 getCacheStatus 失效', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = input as string;
      if (url.includes('/api/playrecords')) {
        return {
          json: async () => ({ 'src+cached': createRecord() }),
          ok: true,
          status: 200,
        } as Response;
      }
      return { json: async () => ({}), ok: true, status: 200 } as Response;
    });
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    const { clearUserCache, getAllPlayRecords, getCacheStatus } =
      await import('./db.client');
    await getAllPlayRecords();
    expect(getCacheStatus().hasPlayRecords).toBe(true);

    clearUserCache();
    expect(getCacheStatus().hasPlayRecords).toBe(false);
    // 快照被丢弃：下一次读取发起新的全量 GET
    await expect(getAllPlayRecords()).resolves.toEqual({
      'src+cached': createRecord(),
    });
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([input]) =>
        (input as string).includes('/api/playrecords'),
      ),
    ).toHaveLength(2);
  });

  it('D11: localStorage 模式并发写经队列串行不丢记录', async () => {
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    localStorage.setItem(
      'moontv_play_records',
      JSON.stringify({
        'src+a': createRecord({ title: 'A' }),
        'src+b': createRecord({ title: 'B' }),
      }),
    );
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const { deletePlayRecord, getAllPlayRecords, savePlayRecord } =
      await import('./db.client');

    await Promise.all([
      deletePlayRecord('src', 'a'),
      savePlayRecord('src', 'c', createRecord({ title: 'C' })),
    ]);

    await expect(getAllPlayRecords()).resolves.toEqual({
      'src+b': createRecord({ title: 'B' }),
      'src+c': createRecord({ title: 'C', original_episodes: 12 }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('D11: localStorage 读取失败返回空且不发服务端请求', async () => {
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    localStorage.setItem('moontv_play_records', '{corrupt');
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const globalErrorListener = jest.fn();
    window.addEventListener('globalError', globalErrorListener, { once: true });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getAllPlayRecords } = await import('./db.client');

    await expect(getAllPlayRecords()).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(globalErrorListener).toHaveBeenCalledTimes(1);
  });

  it('D13: 冷读取等待已排队写完成后再发全量 GET', async () => {
    const deleteRequest = createDeferred<Response>();
    const requestOrder: string[] = [];
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          requestOrder.push('DELETE');
          return deleteRequest.promise;
        }
        requestOrder.push('GET');
        return {
          json: async () => ({ 'src+b': createRecord({ title: '写入后' }) }),
          ok: true,
          status: 200,
        } as Response;
      },
    );
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    const { deletePlayRecord, getAllPlayRecords } = await import('./db.client');

    const deletePromise = deletePlayRecord('src', 'a');
    const readPromise = getAllPlayRecords();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestOrder).toEqual(['DELETE']); // 冷读取等待队列，未提前发 GET

    deleteRequest.resolve({ ok: true, status: 200 } as Response);
    await Promise.all([deletePromise, readPromise]);
    expect(requestOrder).toEqual(['DELETE', 'GET']);
    await expect(getAllPlayRecords()).resolves.toEqual({
      'src+b': createRecord({ title: '写入后' }),
    });
  });

  it('D13: 内部预读失败释放队列，后续写照常执行', async () => {
    let requestCount = 0;
    const requestOrder: string[] = [];
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          requestOrder.push('DELETE');
          return { ok: true, status: 200 } as Response;
        }

        requestCount += 1;
        requestOrder.push('GET');
        if (requestCount === 1) {
          throw new Error('preflight failed');
        }
        return {
          json: async () => ({ 'src+b': createRecord() }),
          ok: true,
          status: 200,
        } as Response;
      },
    );
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { clearAllPlayRecords, savePlayRecord } = await import('./db.client');

    const savePromise = savePlayRecord('src', 'a', createRecord());
    const clearPromise = clearAllPlayRecords();
    await expect(savePromise).rejects.toThrow('preflight failed');
    await clearPromise; // 队列未被预读失败卡死

    expect(requestOrder).toEqual(['GET', 'GET', 'DELETE']);
  });

  it('keeps the cache invalid when reconciliation and the next optimistic write lack a full snapshot', async () => {
    const initialRecord = createRecord({ title: '原记录' });
    const nextRecord = createRecord({ title: '新记录' });
    let getRequestCount = 0;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: false, status: 500 } as Response;
        }
        if (init?.method === 'POST') {
          return {
            json: async () => ({ success: true }),
            ok: true,
            status: 200,
          } as Response;
        }

        getRequestCount += 1;
        if (getRequestCount === 1) {
          return {
            json: async () => ({ 'source+id': initialRecord }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (getRequestCount === 2) {
          throw new Error('reconciliation failed');
        }
        return {
          json: async () => ({
            'source+id': initialRecord,
            'source+next': nextRecord,
          }),
          ok: true,
          status: 200,
        } as Response;
      },
    );
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deletePlayRecord, getAllPlayRecords, savePlayRecord } =
      await import('./db.client');
    await getAllPlayRecords();

    const deletePromise = deletePlayRecord('source', 'id').catch(
      () => undefined,
    );
    const savePromise = savePlayRecord('source', 'next', nextRecord, {});
    await Promise.all([deletePromise, savePromise]);

    await expect(getAllPlayRecords()).resolves.toEqual({
      'source+id': initialRecord,
      'source+next': nextRecord,
    });
  });
});
