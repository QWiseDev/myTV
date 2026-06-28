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
    expect(markPlayRecordDeleted).not.toHaveBeenCalled();
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
});
