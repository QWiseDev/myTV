import type { PlayRecord } from './types';

const mockDeleteCache = jest.fn();
const mockGetPlayRecord = jest.fn();
const mockSavePlayRecord = jest.fn();

jest.mock('./db', () => ({
  db: {
    getPlayRecord: mockGetPlayRecord,
    savePlayRecord: mockSavePlayRecord,
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
    ({ savePlayRecordMutation, serializePlayRecordMutation } = await import(
      './play-record-mutations'
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteCache.mockResolvedValue(undefined);
    mockSavePlayRecord.mockResolvedValue(undefined);
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
});
