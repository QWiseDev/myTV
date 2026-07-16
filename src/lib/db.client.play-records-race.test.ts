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
    expect(getRequestCount).toBeGreaterThanOrEqual(2);
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
    expect(getRequestCount).toBeGreaterThanOrEqual(2);
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
            'source+next': createRecord(),
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
    const nextRecord = createRecord();
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
