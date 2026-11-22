import type { PlayRecord } from './types';

const mockDeleteCache = jest.fn();
const mockFetchVideoDetail = jest.fn();
const mockGetAllPlayRecords = jest.fn();
const mockGetCache = jest.fn();
const mockSavePlayRecord = jest.fn();
const mockSetCache = jest.fn();

jest.mock('./db', () => ({
  db: {
    deleteCache: mockDeleteCache,
    getAllPlayRecords: mockGetAllPlayRecords,
    getCache: mockGetCache,
    savePlayRecord: mockSavePlayRecord,
    setCache: mockSetCache,
  },
}));

jest.mock('./fetchVideoDetail', () => ({
  fetchVideoDetail: (...args: unknown[]) => mockFetchVideoDetail(...args),
}));

let invalidateWatchingUpdatesForUser: typeof import('./watching-updates-cache').invalidateWatchingUpdatesForUser;
let isCompletedRemarks: typeof import('./watching-updates-cache').isCompletedRemarks;
let rebuildWatchingUpdatesForUser: typeof import('./watching-updates-cache').rebuildWatchingUpdatesForUser;
let releaseWatchingUpdatesRefreshSlot: typeof import('./watching-updates-cache').releaseWatchingUpdatesRefreshSlot;
let tryAcquireWatchingUpdatesRefreshSlot: typeof import('./watching-updates-cache').tryAcquireWatchingUpdatesRefreshSlot;

function createRecord(title: string, index = 1): PlayRecord {
  return {
    cover: '',
    index,
    original_episodes: 1,
    play_time: 10,
    save_time: 100,
    search_title: title,
    source_name: '测试源',
    title,
    total_episodes: 2,
    total_time: 100,
    year: '2026',
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('watching updates cache lifecycle', () => {
  beforeAll(async () => {
    ({
      invalidateWatchingUpdatesForUser,
      isCompletedRemarks,
      rebuildWatchingUpdatesForUser,
      releaseWatchingUpdatesRefreshSlot,
      tryAcquireWatchingUpdatesRefreshSlot,
    } = await import('./watching-updates-cache'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteCache.mockResolvedValue(undefined);
    mockFetchVideoDetail.mockResolvedValue(null);
    mockGetCache.mockResolvedValue(null);
    mockSavePlayRecord.mockResolvedValue(undefined);
    mockSetCache.mockResolvedValue(undefined);
  });

  it('deletes the user watching-updates cache when invalidated', async () => {
    await invalidateWatchingUpdatesForUser('tester');

    expect(mockDeleteCache).toHaveBeenCalledWith('watching-updates:tester');
  });

  it('does not let a rebuild started before invalidation write stale data', async () => {
    const staleRecords = createDeferred<Record<string, PlayRecord>>();
    mockGetAllPlayRecords
      .mockReturnValueOnce(staleRecords.promise)
      .mockResolvedValueOnce({
        'source+fresh': createRecord('新记录', 2),
      });

    const rebuildPromise = rebuildWatchingUpdatesForUser('race-user');
    await Promise.resolve();

    await invalidateWatchingUpdatesForUser('race-user');
    staleRecords.resolve({
      'source+stale': createRecord('旧记录'),
    });

    const updates = await rebuildPromise;

    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
    expect(mockSetCache).toHaveBeenCalledTimes(1);
    expect(updates.updatedSeries).toEqual([
      expect.objectContaining({ title: '新记录' }),
    ]);
  });

  it('restarts a rebuild when invalidation happens during detail resolution', async () => {
    const staleDetail = createDeferred<null>();
    const detailResolver = jest
      .fn()
      .mockReturnValueOnce(staleDetail.promise)
      .mockResolvedValueOnce(null);
    mockGetAllPlayRecords
      .mockResolvedValueOnce({
        'source+stale': createRecord('旧记录'),
      })
      .mockResolvedValueOnce({
        'source+fresh': createRecord('新记录', 2),
      });

    const rebuildPromise = rebuildWatchingUpdatesForUser(
      'cron-race-user',
      detailResolver,
    );
    await Promise.resolve();

    await invalidateWatchingUpdatesForUser('cron-race-user');
    staleDetail.resolve(null);

    const updates = await rebuildPromise;

    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
    expect(mockSetCache).toHaveBeenCalledTimes(1);
    expect(updates.updatedSeries).toEqual([
      expect.objectContaining({ title: '新记录' }),
    ]);
  });

  describe('completed remarks detection', () => {
    it('matches completed remarks and rejects ongoing ones', () => {
      expect(isCompletedRemarks('已完结')).toBe(true);
      expect(isCompletedRemarks('全40集')).toBe(true);
      expect(isCompletedRemarks('40集全')).toBe(true);
      expect(isCompletedRemarks('共12集')).toBe(true);
      expect(isCompletedRemarks('更新至第12集')).toBe(false);
      expect(isCompletedRemarks('更新至12集')).toBe(false);
      expect(isCompletedRemarks('HD高清')).toBe(false);
      expect(isCompletedRemarks('未完结')).toBe(false);
      expect(isCompletedRemarks(undefined)).toBe(false);
      expect(isCompletedRemarks(null)).toBe(false);
      expect(isCompletedRemarks('')).toBe(false);
    });
  });

  it('skips detail fetch for records whose remarks indicate completion', async () => {
    mockGetAllPlayRecords.mockResolvedValue({
      'source+done': { ...createRecord('完结剧'), remarks: '已完结' },
    });

    const updates = await rebuildWatchingUpdatesForUser('done-user');

    expect(mockFetchVideoDetail).not.toHaveBeenCalled();
    expect(mockSavePlayRecord).not.toHaveBeenCalled();
    expect(updates.updatedSeries).toEqual([
      expect.objectContaining({
        title: '完结剧',
        totalEpisodes: 2,
        remarks: '已完结',
      }),
    ]);
  });

  it('carries fresh remarks from details into the cache and writes records back', async () => {
    mockGetAllPlayRecords.mockResolvedValue({
      'source+live': { ...createRecord('连载剧', 2), remarks: '更新至2集' },
    });
    mockFetchVideoDetail.mockResolvedValue({
      episodes: ['e1', 'e2', 'e3'],
      remarks: '更新至3集',
      title: '连载剧',
    });

    const updates = await rebuildWatchingUpdatesForUser('sync-user');

    expect(updates.updatedSeries).toEqual([
      expect.objectContaining({ totalEpisodes: 3, remarks: '更新至3集' }),
    ]);
    expect(mockSavePlayRecord).toHaveBeenCalledTimes(1);
    const [, source, id, savedRecord] = mockSavePlayRecord.mock.calls[0];
    expect([source, id]).toEqual(['source', 'live']);
    expect(savedRecord).toEqual(
      expect.objectContaining({
        total_episodes: 3,
        remarks: '更新至3集',
        index: 2,
        save_time: 100,
      }),
    );
    // 衍生数据回写不应触发追更缓存失效
    expect(mockDeleteCache).not.toHaveBeenCalledWith(
      'watching-updates:sync-user',
    );
  });

  it('skips write-back when the record changed since the snapshot', async () => {
    const staleRecord = {
      'source+live': { ...createRecord('连载剧', 2), remarks: '更新至2集' },
    };
    mockGetAllPlayRecords
      .mockResolvedValueOnce(staleRecord)
      .mockResolvedValueOnce({
        'source+live': { ...staleRecord['source+live'], save_time: 200 },
      });
    mockFetchVideoDetail.mockResolvedValue({
      episodes: ['e1', 'e2', 'e3'],
      remarks: '更新至3集',
    });

    await rebuildWatchingUpdatesForUser('race-sync-user');

    expect(mockSavePlayRecord).not.toHaveBeenCalled();
  });

  describe('refresh throttle slot', () => {
    it('grants the slot and stores a 30-minute throttle key when none exists', async () => {
      const granted = await tryAcquireWatchingUpdatesRefreshSlot('tester');

      expect(granted).toBe(true);
      expect(mockSetCache).toHaveBeenCalledWith(
        'watching-updates:refresh:tester',
        expect.any(Number),
        30 * 60,
      );
    });

    it('denies the slot while the throttle key is alive', async () => {
      mockGetCache.mockResolvedValueOnce(1764000000000);

      const granted = await tryAcquireWatchingUpdatesRefreshSlot('tester');

      expect(granted).toBe(false);
      expect(mockSetCache).not.toHaveBeenCalled();
    });

    it('releases the slot by deleting the throttle key', async () => {
      await releaseWatchingUpdatesRefreshSlot('tester');

      expect(mockDeleteCache).toHaveBeenCalledWith(
        'watching-updates:refresh:tester',
      );
    });
  });
});
