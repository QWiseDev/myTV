import { act, renderHook } from '@testing-library/react';

import { usePlaybackRecords } from './usePlaybackRecords';
import type { PlayRecord } from '@/lib/types';

jest.mock('@/lib/db.client', () => ({
  getRecentPlayRecords: jest.fn(),
}));

const { getRecentPlayRecords } = jest.requireMock('@/lib/db.client') as {
  getRecentPlayRecords: jest.Mock;
};

function createRecord(): PlayRecord {
  return {
    cover: '',
    index: 1,
    play_time: 10,
    save_time: 100,
    search_title: '测试影片',
    source_name: '测试源',
    title: '测试影片',
    total_episodes: 1,
    total_time: 100,
    year: '2026',
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('usePlaybackRecords', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getRecentPlayRecords.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads recent play records after the idle delay', async () => {
    const records = {
      'source+id': createRecord(),
    };
    getRecentPlayRecords.mockResolvedValue(records);

    const { result } = renderHook(() => usePlaybackRecords(jest.fn()));

    expect(result.current.loadingPlayRecords).toBe(true);
    expect(getRecentPlayRecords).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    expect(getRecentPlayRecords).toHaveBeenCalledWith(60);
    expect(result.current.playRecords).toBe(records);
    expect(result.current.loadingPlayRecords).toBe(false);
  });

  it('debounces manual refresh and refreshes watching updates afterwards', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    getRecentPlayRecords.mockResolvedValue({
      'source+id': createRecord(),
    });

    const { result } = renderHook(() =>
      usePlaybackRecords(refreshWatchingUpdates),
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });
    getRecentPlayRecords.mockClear();

    await act(async () => {
      result.current.refreshPlayRecords();
      result.current.refreshPlayRecords();
      jest.advanceTimersByTime(500);
      await flushAsyncWork();
    });

    expect(getRecentPlayRecords).toHaveBeenCalledTimes(1);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('cancels scheduled initial loading after unmount', async () => {
    getRecentPlayRecords.mockResolvedValue({});

    const { unmount } = renderHook(() => usePlaybackRecords(jest.fn()));
    unmount();

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    expect(getRecentPlayRecords).not.toHaveBeenCalled();
  });
});
