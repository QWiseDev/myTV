/**
 * @jest-environment node
 */

import type { PlayRecord } from '@/lib/types';

const mockGetAuthInfoFromCookie = jest.fn();
const mockEnsureUserAccessOrResponse = jest.fn();
const mockClearAllPlayRecords = jest.fn();
const mockDeletePlayRecord = jest.fn();
const mockGetPlayRecord = jest.fn();
const mockInvalidateWatchingUpdatesForUser = jest.fn();
const mockSavePlayRecord = jest.fn();

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: mockGetAuthInfoFromCookie,
}));

jest.mock('@/lib/db', () => ({
  db: {
    clearAllPlayRecords: mockClearAllPlayRecords,
    deletePlayRecord: mockDeletePlayRecord,
    getPlayRecord: mockGetPlayRecord,
    savePlayRecord: mockSavePlayRecord,
  },
}));

jest.mock('@/lib/user-access', () => ({
  ensureUserAccessOrResponse: mockEnsureUserAccessOrResponse,
}));

jest.mock('@/lib/watching-updates-cache', () => ({
  invalidateWatchingUpdatesForUser: mockInvalidateWatchingUpdatesForUser,
}));

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

function createRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    title: '测试影片',
    source_name: '测试源',
    cover: '',
    year: '2025',
    index: 1,
    total_episodes: 10,
    play_time: 100,
    total_time: 1000,
    save_time: 1000,
    search_title: '测试影片',
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushAsyncWork() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('POST /api/playrecords', () => {
  let DELETE: typeof import('./route').DELETE;
  let NextRequest: typeof import('next/server').NextRequest;
  let POST: typeof import('./route').POST;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    ({ NextRequest } = await import('next/server'));
    ({ DELETE, POST } = await import('./route'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthInfoFromCookie.mockReturnValue({ username: 'tester' });
    mockEnsureUserAccessOrResponse.mockResolvedValue({});
    mockClearAllPlayRecords.mockResolvedValue(undefined);
    mockDeletePlayRecord.mockResolvedValue(undefined);
    mockInvalidateWatchingUpdatesForUser.mockResolvedValue(undefined);
  });

  function createRequest(record: PlayRecord) {
    return new NextRequest('http://localhost/api/playrecords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'source-a+id-a', record }),
    });
  }

  function createDeleteRequest(key = 'source-a+id-a') {
    return new NextRequest(
      `http://localhost/api/playrecords?key=${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
  }

  test('ignores a stale write that arrives after a newer record', async () => {
    mockGetPlayRecord.mockResolvedValue(createRecord({ save_time: 2000 }));

    const response = await POST(
      createRequest(createRecord({ play_time: 50, save_time: 1000 })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      ignored: true,
    });
    expect(mockSavePlayRecord).not.toHaveBeenCalled();
  });

  test('saves a record newer than the stored value', async () => {
    mockGetPlayRecord.mockResolvedValue(
      createRecord({ original_episodes: 10, save_time: 1000 }),
    );
    const incomingRecord = createRecord({
      play_time: 250,
      save_time: 2000,
    });

    const response = await POST(createRequest(incomingRecord));

    expect(response.status).toBe(200);
    expect(mockSavePlayRecord).toHaveBeenCalledWith(
      'tester',
      'source-a',
      'id-a',
      expect.objectContaining({
        play_time: 250,
        save_time: 2000,
      }),
    );
    expect(mockInvalidateWatchingUpdatesForUser).not.toHaveBeenCalled();
  });

  test('invalidates watching updates when episode progress changes', async () => {
    mockGetPlayRecord.mockResolvedValue(createRecord({ index: 1 }));

    const response = await POST(
      createRequest(createRecord({ index: 2, save_time: 2000 })),
    );

    expect(response.status).toBe(200);
    expect(mockInvalidateWatchingUpdatesForUser).toHaveBeenCalledWith('tester');
  });

  test('serializes concurrent writes for the same user and record key', async () => {
    const newerSaveGate = createDeferred<void>();
    let storedRecord = createRecord({ save_time: 500 });
    mockGetPlayRecord.mockImplementation(async () => storedRecord);
    mockSavePlayRecord.mockImplementation(
      async (
        _username: string,
        _source: string,
        _id: string,
        record: PlayRecord,
      ) => {
        if (record.save_time === 2000) {
          await newerSaveGate.promise;
        }
        storedRecord = record;
      },
    );

    const newerResponsePromise = POST(
      createRequest(createRecord({ play_time: 250, save_time: 2000 })),
    );
    await flushAsyncWork();
    expect(mockGetPlayRecord).toHaveBeenCalledTimes(1);
    expect(mockSavePlayRecord).toHaveBeenCalledTimes(1);

    const olderResponsePromise = POST(
      createRequest(createRecord({ play_time: 50, save_time: 1000 })),
    );
    await flushAsyncWork();

    // 较旧请求必须等较新请求完成保存后，才能重新读取并比较。
    expect(mockGetPlayRecord).toHaveBeenCalledTimes(1);

    newerSaveGate.resolve();
    const [newerResponse, olderResponse] = await Promise.all([
      newerResponsePromise,
      olderResponsePromise,
    ]);

    expect(newerResponse.status).toBe(200);
    expect(olderResponse.status).toBe(200);
    await expect(olderResponse.json()).resolves.toEqual({
      success: true,
      ignored: true,
    });
    expect(mockGetPlayRecord).toHaveBeenCalledTimes(2);
    expect(mockSavePlayRecord).toHaveBeenCalledTimes(1);
    expect(storedRecord.save_time).toBe(2000);
  });

  test('orders delete after an in-flight save', async () => {
    const saveGate = createDeferred<void>();
    let storedRecord: PlayRecord | null = createRecord({ save_time: 500 });
    mockGetPlayRecord.mockImplementation(async () => storedRecord);
    mockSavePlayRecord.mockImplementation(
      async (
        _username: string,
        _source: string,
        _id: string,
        record: PlayRecord,
      ) => {
        await saveGate.promise;
        storedRecord = record;
      },
    );
    mockDeletePlayRecord.mockImplementation(async () => {
      storedRecord = null;
    });

    const saveResponsePromise = POST(
      createRequest(
        createRecord({ play_time: 250, save_time: Date.now() + 1000 }),
      ),
    );
    await flushAsyncWork();
    expect(mockSavePlayRecord).toHaveBeenCalledTimes(1);

    const deleteResponsePromise = DELETE(createDeleteRequest());
    await flushAsyncWork();
    expect(mockDeletePlayRecord).not.toHaveBeenCalled();

    saveGate.resolve();
    const [saveResponse, deleteResponse] = await Promise.all([
      saveResponsePromise,
      deleteResponsePromise,
    ]);
    expect(saveResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(mockDeletePlayRecord).toHaveBeenCalledTimes(1);
    expect(mockInvalidateWatchingUpdatesForUser).toHaveBeenCalledWith('tester');
    expect(storedRecord).toBeNull();
  });

  test('invalidates watching updates after clearing all records', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/playrecords', {
        method: 'DELETE',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockClearAllPlayRecords).toHaveBeenCalledWith('tester');
    expect(mockInvalidateWatchingUpdatesForUser).toHaveBeenCalledWith('tester');
  });
});

export {};
