import type { PlayRecord } from './types';

const mockDeleteCache = jest.fn();
const mockFetchVideoDetail = jest.fn();
const mockGetAllPlayRecords = jest.fn();
const mockGetCache = jest.fn();
const mockSetCache = jest.fn();

jest.mock('./db', () => ({
  db: {
    deleteCache: mockDeleteCache,
    getAllPlayRecords: mockGetAllPlayRecords,
    getCache: mockGetCache,
    setCache: mockSetCache,
  },
}));

jest.mock('./fetchVideoDetail', () => ({
  fetchVideoDetail: (...args: unknown[]) => mockFetchVideoDetail(...args),
}));

let invalidateWatchingUpdatesForUser: typeof import('./watching-updates-cache').invalidateWatchingUpdatesForUser;
let rebuildWatchingUpdatesForUser: typeof import('./watching-updates-cache').rebuildWatchingUpdatesForUser;

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
    ({ invalidateWatchingUpdatesForUser, rebuildWatchingUpdatesForUser } =
      await import('./watching-updates-cache'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteCache.mockResolvedValue(undefined);
    mockFetchVideoDetail.mockResolvedValue(null);
    mockGetCache.mockResolvedValue(null);
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
});
