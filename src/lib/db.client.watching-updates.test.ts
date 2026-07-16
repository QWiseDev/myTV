import type { PlayRecord } from './types';

const mockForceClearWatchingUpdatesCache = jest.fn();

jest.mock('./watching-updates', () => ({
  forceClearWatchingUpdatesCache: mockForceClearWatchingUpdatesCache,
}));

export {};

function createRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    cover: '',
    index: 1,
    original_episodes: 12,
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

describe('play record watching-updates invalidation', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (
    window as typeof window & {
      RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
    }
  ).RUNTIME_CONFIG;

  beforeEach(() => {
    mockForceClearWatchingUpdatesCache.mockReset();
  });

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

  it('clears the client snapshot after a relevant remote save succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true }),
      ok: true,
      status: 200,
    });
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    const currentRecord = createRecord({ index: 1 });
    const { savePlayRecord } = await import('./db.client');

    await savePlayRecord('source', 'id', createRecord({ index: 2 }), {
      'source+id': currentRecord,
    });

    expect(mockForceClearWatchingUpdatesCache).toHaveBeenCalledTimes(1);
  });

  it('keeps the client snapshot for play-time-only remote saves', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true }),
      ok: true,
      status: 200,
    });
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    const currentRecord = createRecord({ play_time: 10 });
    const { savePlayRecord } = await import('./db.client');

    await savePlayRecord('source', 'id', createRecord({ play_time: 20 }), {
      'source+id': currentRecord,
    });

    expect(mockForceClearWatchingUpdatesCache).not.toHaveBeenCalled();
  });

  it('clears the client snapshot when a play-time-only save is ignored', async () => {
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return {
            json: async () => ({ ignored: true, success: true }),
            ok: true,
            status: 200,
          } as Response;
        }

        return {
          json: async () => ({
            'source+id': createRecord({ index: 2, save_time: 200 }),
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
    const currentRecord = createRecord({ play_time: 10 });
    const { savePlayRecord } = await import('./db.client');

    await savePlayRecord('source', 'id', createRecord({ play_time: 20 }), {
      'source+id': currentRecord,
    });

    expect(mockForceClearWatchingUpdatesCache).toHaveBeenCalledTimes(1);
  });

  it('clears the client snapshot after deleting a local record', async () => {
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    localStorage.setItem(
      'moontv_play_records',
      JSON.stringify({ 'source+id': createRecord() }),
    );
    const { deletePlayRecord } = await import('./db.client');

    await deletePlayRecord('source', 'id');

    expect(mockForceClearWatchingUpdatesCache).toHaveBeenCalledTimes(1);
  });

  it('clears the client snapshot after clearing remote records succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    const { clearAllPlayRecords } = await import('./db.client');

    await clearAllPlayRecords();

    expect(mockForceClearWatchingUpdatesCache).toHaveBeenCalledTimes(1);
  });
});
