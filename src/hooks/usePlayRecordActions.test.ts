import { act, renderHook } from '@testing-library/react';

import type { PlayRecord } from '@/lib/types';

const mockClearAllPlayRecords = jest.fn();
const mockDeletePlayRecord = jest.fn();

jest.mock('@/lib/db.client', () => ({
  clearAllPlayRecords: mockClearAllPlayRecords,
  deletePlayRecord: mockDeletePlayRecord,
}));

let usePlayRecordActions: typeof import('./usePlayRecordActions').usePlayRecordActions;

type PlayRecordsState = Record<string, PlayRecord> | null;
type SetPlayRecords = (
  updater: (currentRecords: PlayRecordsState) => PlayRecordsState,
) => void;

const recordKey = 'source-a+video-a';

function createRecord(): PlayRecord {
  return {
    cover: 'https://cdn.example/poster.jpg',
    index: 2,
    play_time: 30,
    save_time: 1000,
    search_title: '测试影片',
    source_name: '测试源',
    title: '测试影片',
    total_episodes: 12,
    total_time: 100,
    year: '2026',
  };
}

function createStateHarness(initialRecords: PlayRecordsState) {
  let records = initialRecords;
  const setPlayRecords: SetPlayRecords = jest.fn((updater) => {
    records = updater(records);
  });

  return {
    get records() {
      return records;
    },
    setPlayRecords,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('usePlayRecordActions', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(async () => {
    usePlayRecordActions = (await import('./usePlayRecordActions'))
      .usePlayRecordActions;
  });

  beforeEach(() => {
    mockClearAllPlayRecords.mockReset();
    mockDeletePlayRecord.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('optimistically removes one play record and marks it deleted after db delete succeeds', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const markPlayRecordDeleted = jest.fn();
    mockDeletePlayRecord.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      usePlayRecordActions({
        markPlayRecordDeleted,
        setPlayRecords: state.setPlayRecords,
      }),
    );

    await act(async () => {
      await result.current.deletePlayRecord(recordKey);
    });

    expect(state.records).toEqual({});
    expect(mockDeletePlayRecord).toHaveBeenCalledWith('source-a', 'video-a');
    expect(markPlayRecordDeleted).toHaveBeenCalledWith(recordKey);
  });

  it('restores the deleted record when db delete fails', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const markPlayRecordDeleted = jest.fn();
    mockDeletePlayRecord.mockRejectedValue(new Error('db failed'));

    const { result } = renderHook(() =>
      usePlayRecordActions({
        markPlayRecordDeleted,
        setPlayRecords: state.setPlayRecords,
      }),
    );

    await act(async () => {
      await result.current.deletePlayRecord(recordKey);
    });

    expect(state.records).toEqual({ [recordKey]: record });
    expect(markPlayRecordDeleted).toHaveBeenCalledWith(recordKey);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '删除播放记录失败:',
      expect.any(Error),
    );
  });

  it('restores the deleted record when the storage key is invalid', async () => {
    const record = createRecord();
    const invalidKey = 'invalid-key';
    const state = createStateHarness({ [invalidKey]: record });

    const { result } = renderHook(() =>
      usePlayRecordActions({
        setPlayRecords: state.setPlayRecords,
      }),
    );

    await act(async () => {
      await result.current.deletePlayRecord(invalidKey);
    });

    expect(state.records).toEqual({ [invalidKey]: record });
    expect(mockDeletePlayRecord).not.toHaveBeenCalled();
  });

  it('clears all play records locally and marks the list deleted after db succeeds', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const markAllPlayRecordsDeleted = jest.fn();
    mockClearAllPlayRecords.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      usePlayRecordActions({
        markAllPlayRecordsDeleted,
        setPlayRecords: state.setPlayRecords,
      }),
    );

    await act(async () => {
      await result.current.clearAllPlayRecords();
    });

    expect(state.records).toEqual({});
    expect(mockClearAllPlayRecords).toHaveBeenCalledTimes(1);
    expect(markAllPlayRecordsDeleted).toHaveBeenCalledTimes(1);
  });

  it('restores play records when clearing all fails', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    mockClearAllPlayRecords.mockRejectedValue(new Error('db failed'));

    const { result } = renderHook(() =>
      usePlayRecordActions({
        setPlayRecords: state.setPlayRecords,
      }),
    );

    await act(async () => {
      await result.current.clearAllPlayRecords();
    });

    expect(state.records).toEqual({ [recordKey]: record });
  });

  it('does not restore a failed deletion after a newer clear succeeds', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const deleteRequest = createDeferred<void>();
    mockDeletePlayRecord.mockReturnValue(deleteRequest.promise);
    mockClearAllPlayRecords.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePlayRecordActions({
        markAllPlayRecordsDeleted: jest.fn(),
        markPlayRecordDeleted: jest.fn(),
        setPlayRecords: state.setPlayRecords,
      }),
    );

    let deletePromise!: Promise<void>;
    act(() => {
      deletePromise = result.current.deletePlayRecord(recordKey);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.clearAllPlayRecords();
    });
    await act(async () => {
      deleteRequest.reject(new Error('late delete failure'));
      await deletePromise;
    });

    expect(state.records).toEqual({});
  });

  it('restores the deletion when a newer clear also fails', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const deleteRequest = createDeferred<void>();
    const clearRequest = createDeferred<void>();
    mockDeletePlayRecord.mockReturnValue(deleteRequest.promise);
    mockClearAllPlayRecords.mockReturnValue(clearRequest.promise);
    const { result } = renderHook(() =>
      usePlayRecordActions({ setPlayRecords: state.setPlayRecords }),
    );

    const deletePromise = result.current.deletePlayRecord(recordKey);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const clearPromise = result.current.clearAllPlayRecords();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    deleteRequest.reject(new Error('delete failed'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    clearRequest.reject(new Error('clear failed'));
    await act(async () => {
      await Promise.all([deletePromise, clearPromise]);
    });

    expect(state.records).toEqual({ [recordKey]: record });
  });

  it('waits for a failed clear before deleting one restored record', async () => {
    const record = createRecord();
    const otherKey = 'source-b+video-b';
    const otherRecord = { ...createRecord(), title: '另一条记录' };
    const state = createStateHarness({
      [recordKey]: record,
      [otherKey]: otherRecord,
    });
    const clearRequest = createDeferred<void>();
    const deleteRequest = createDeferred<void>();
    mockClearAllPlayRecords.mockReturnValue(clearRequest.promise);
    mockDeletePlayRecord.mockReturnValue(deleteRequest.promise);
    const { result } = renderHook(() =>
      usePlayRecordActions({ setPlayRecords: state.setPlayRecords }),
    );

    const clearPromise = result.current.clearAllPlayRecords();
    const firstDelete = result.current.deletePlayRecord(recordKey);
    const duplicateDelete = result.current.deletePlayRecord(recordKey);
    expect(duplicateDelete).toBe(firstDelete);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockDeletePlayRecord).not.toHaveBeenCalled();

    clearRequest.reject(new Error('clear failed'));
    await act(async () => {
      await clearPromise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockDeletePlayRecord).toHaveBeenCalledTimes(1);
    expect(state.records).toEqual({ [otherKey]: otherRecord });

    deleteRequest.resolve();
    await act(async () => {
      await firstDelete;
    });
    expect(state.records).toEqual({ [otherKey]: otherRecord });
  });

  it('restores all records when a queued delete also fails after clear rollback', async () => {
    const record = createRecord();
    const otherKey = 'source-b+video-b';
    const otherRecord = { ...createRecord(), title: '另一条记录' };
    const state = createStateHarness({
      [recordKey]: record,
      [otherKey]: otherRecord,
    });
    const clearRequest = createDeferred<void>();
    const deleteRequest = createDeferred<void>();
    mockClearAllPlayRecords.mockReturnValue(clearRequest.promise);
    mockDeletePlayRecord.mockReturnValue(deleteRequest.promise);
    const { result } = renderHook(() =>
      usePlayRecordActions({ setPlayRecords: state.setPlayRecords }),
    );

    const clearPromise = result.current.clearAllPlayRecords();
    const deletePromise = result.current.deletePlayRecord(recordKey);
    clearRequest.reject(new Error('clear failed'));
    await act(async () => {
      await clearPromise;
      await Promise.resolve();
      await Promise.resolve();
    });

    deleteRequest.reject(new Error('delete failed'));
    await act(async () => {
      await deletePromise;
    });
    expect(state.records).toEqual({
      [recordKey]: record,
      [otherKey]: otherRecord,
    });
  });

  it('skips a queued delete after clear succeeds', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const clearRequest = createDeferred<void>();
    const markPlayRecordDeleted = jest.fn();
    mockClearAllPlayRecords.mockReturnValue(clearRequest.promise);
    const { result } = renderHook(() =>
      usePlayRecordActions({
        markPlayRecordDeleted,
        setPlayRecords: state.setPlayRecords,
      }),
    );

    const clearPromise = result.current.clearAllPlayRecords();
    const deletePromise = result.current.deletePlayRecord(recordKey);
    clearRequest.resolve();
    await act(async () => {
      await Promise.all([clearPromise, deletePromise]);
    });

    expect(mockDeletePlayRecord).not.toHaveBeenCalled();
    expect(markPlayRecordDeleted).not.toHaveBeenCalled();
    expect(state.records).toEqual({});
  });

  it('coalesces duplicate delete and clear operations', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const deleteRequest = createDeferred<void>();
    const clearRequest = createDeferred<void>();
    mockDeletePlayRecord.mockReturnValue(deleteRequest.promise);
    mockClearAllPlayRecords.mockReturnValue(clearRequest.promise);
    const { result } = renderHook(() =>
      usePlayRecordActions({ setPlayRecords: state.setPlayRecords }),
    );

    const firstDelete = result.current.deletePlayRecord(recordKey);
    const duplicateDelete = result.current.deletePlayRecord(recordKey);
    expect(duplicateDelete).toBe(firstDelete);
    deleteRequest.reject(new Error('delete failed'));
    await act(async () => {
      await firstDelete;
    });
    expect(mockDeletePlayRecord).toHaveBeenCalledTimes(1);
    expect(state.records).toEqual({ [recordKey]: record });

    const firstClear = result.current.clearAllPlayRecords();
    const duplicateClear = result.current.clearAllPlayRecords();
    expect(duplicateClear).toBe(firstClear);
    clearRequest.reject(new Error('clear failed'));
    await act(async () => {
      await firstClear;
    });
    expect(mockClearAllPlayRecords).toHaveBeenCalledTimes(1);
    expect(state.records).toEqual({ [recordKey]: record });
  });

  it('invalidates home play record requests before clear persistence finishes', async () => {
    const record = createRecord();
    const state = createStateHarness({ [recordKey]: record });
    const clearRequest = createDeferred<void>();
    const markAllPlayRecordsDeleted = jest.fn();
    mockClearAllPlayRecords.mockReturnValue(clearRequest.promise);
    const { result } = renderHook(() =>
      usePlayRecordActions({
        markAllPlayRecordsDeleted,
        setPlayRecords: state.setPlayRecords,
      }),
    );

    let clearPromise!: Promise<void>;
    act(() => {
      clearPromise = result.current.clearAllPlayRecords();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(markAllPlayRecordsDeleted).toHaveBeenCalledTimes(1);

    await act(async () => {
      clearRequest.resolve();
      await clearPromise;
    });
  });
});
