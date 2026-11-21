import { generateStorageKey } from './storage-key';
import type { PlayRecord } from './types';

const mockDeleteCache = jest.fn();
const mockGetPlayRecord = jest.fn();
const mockSavePlayRecord = jest.fn();
const mockGetAllPlayRecords = jest.fn();
const mockDeletePlayRecord = jest.fn();

jest.mock('./db', () => ({
  db: {
    getPlayRecord: mockGetPlayRecord,
    savePlayRecord: mockSavePlayRecord,
    getAllPlayRecords: mockGetAllPlayRecords,
    deletePlayRecord: mockDeletePlayRecord,
  },
}));

jest.mock('./watching-updates-cache', () => ({
  invalidateWatchingUpdatesForUser: mockDeleteCache,
}));

let savePlayRecordMutation: typeof import('./play-record-mutations').savePlayRecordMutation;
let serializePlayRecordMutation: typeof import('./play-record-mutations').serializePlayRecordMutation;

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

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('play record mutations', () => {
  beforeAll(async () => {
    ({ savePlayRecordMutation, serializePlayRecordMutation } =
      await import('./play-record-mutations'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteCache.mockResolvedValue(undefined);
    mockSavePlayRecord.mockResolvedValue(undefined);
    mockGetAllPlayRecords.mockResolvedValue({});
    mockDeletePlayRecord.mockResolvedValue(undefined);
  });

  it('does not recreate a record deleted before a cron refresh acquires the queue', async () => {
    const deleteGate = createDeferred();
    let storedRecord: PlayRecord | null = createRecord();
    mockGetPlayRecord.mockImplementation(async () => storedRecord);
    const deletePromise = serializePlayRecordMutation(
      'delete-race-user',
      async () => {
        await deleteGate.promise;
        storedRecord = null;
      },
    );
    const cronSavePromise = savePlayRecordMutation(
      'delete-race-user',
      'source',
      'id',
      createRecord({ total_episodes: 13 }),
      { expectedSaveTime: 100, requireExisting: true },
    );

    deleteGate.resolve();
    await Promise.all([deletePromise, cronSavePromise]);

    expect(mockSavePlayRecord).not.toHaveBeenCalled();
  });

  it('does not overwrite a record changed after cron captured its detail input', async () => {
    mockGetPlayRecord.mockResolvedValue(createRecord({ save_time: 200 }));

    const result = await savePlayRecordMutation(
      'update-race-user',
      'source',
      'id',
      createRecord({ save_time: 100, total_episodes: 13 }),
      { expectedSaveTime: 100, requireExisting: true },
    );

    expect(result).toEqual({ ignored: true });
    expect(mockSavePlayRecord).not.toHaveBeenCalled();
  });

  describe('cross-source same-title merge', () => {
    const otherKey = generateStorageKey('dyttky', 'id-old');

    it('deletes older same-title records from other sources and keeps the incoming one', async () => {
      mockGetPlayRecord.mockResolvedValue(null);
      mockGetAllPlayRecords.mockResolvedValue({
        [otherKey]: createRecord({ save_time: 50, source_name: '另一源' }),
      });

      const result = await savePlayRecordMutation(
        'merge-user',
        'bfzy',
        'id-new',
        createRecord({ save_time: 100 }),
      );

      expect(result).toEqual({ ignored: false });
      expect(mockDeletePlayRecord).toHaveBeenCalledWith(
        'merge-user',
        'dyttky',
        'id-old',
      );
      expect(mockSavePlayRecord).toHaveBeenCalledTimes(1);
      // 合并删除了旧源记录，追更缓存需要失效
      expect(mockDeleteCache).toHaveBeenCalledWith('merge-user');
    });

    it('ignores the incoming save when a newer same-title record exists', async () => {
      mockGetPlayRecord.mockResolvedValue(null);
      mockGetAllPlayRecords.mockResolvedValue({
        [otherKey]: createRecord({ save_time: 200 }),
      });

      const result = await savePlayRecordMutation(
        'merge-stale-user',
        'bfzy',
        'id-new',
        createRecord({ save_time: 100 }),
      );

      expect(result).toEqual({ ignored: true });
      expect(mockDeletePlayRecord).not.toHaveBeenCalled();
      expect(mockSavePlayRecord).not.toHaveBeenCalled();
    });

    it('keeps records of a different year even when titles match', async () => {
      mockGetPlayRecord.mockResolvedValue(null);
      mockGetAllPlayRecords.mockResolvedValue({
        [otherKey]: createRecord({ year: '2010', save_time: 50 }),
      });

      const result = await savePlayRecordMutation(
        'merge-year-user',
        'bfzy',
        'id-new',
        createRecord({ save_time: 100 }),
      );

      expect(result).toEqual({ ignored: false });
      expect(mockDeletePlayRecord).not.toHaveBeenCalled();
      expect(mockSavePlayRecord).toHaveBeenCalledTimes(1);
    });
  });
});
