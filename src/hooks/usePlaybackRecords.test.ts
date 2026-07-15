import { act, renderHook } from '@testing-library/react';

import type { PlayRecord } from '@/lib/types';

import { usePlaybackRecords } from './usePlaybackRecords';

jest.mock('@/lib/db.client', () => ({
  getPlayRecordsPage: jest.fn(),
}));

const { getPlayRecordsPage } = jest.requireMock('@/lib/db.client') as {
  getPlayRecordsPage: jest.Mock;
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

function createPage(
  records: Record<string, PlayRecord>,
  hasMore = false,
  nextCursor: string | null = null,
) {
  return {
    records,
    pageSize: 12,
    hasMore,
    nextCursor,
    total: Object.keys(records).length,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe('usePlaybackRecords', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getPlayRecordsPage.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads recent play records after the idle delay', async () => {
    const records = {
      'source+id': createRecord(),
    };
    getPlayRecordsPage.mockResolvedValue(createPage(records));

    const { result } = renderHook(() => usePlaybackRecords(jest.fn()));

    expect(result.current.loadingPlayRecords).toBe(true);
    expect(getPlayRecordsPage).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    expect(getPlayRecordsPage).toHaveBeenCalledWith({
      cursor: null,
      includeKeys: [],
      pageSize: 12,
    });
    expect(result.current.playRecords).toBe(records);
    expect(result.current.loadingPlayRecords).toBe(false);
  });

  it('includes priority play record keys on the first page request', async () => {
    getPlayRecordsPage.mockResolvedValue(createPage({}));

    renderHook(() =>
      usePlaybackRecords(jest.fn(), ['source+old-update', 'source+new-update']),
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    expect(getPlayRecordsPage).toHaveBeenCalledWith({
      cursor: null,
      includeKeys: ['source+old-update', 'source+new-update'],
      pageSize: 12,
    });
  });

  it('debounces manual refresh and refreshes watching updates afterwards', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    getPlayRecordsPage.mockResolvedValue(
      createPage({
        'source+id': createRecord(),
      }),
    );

    const { result } = renderHook(() =>
      usePlaybackRecords(refreshWatchingUpdates),
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });
    getPlayRecordsPage.mockClear();

    await act(async () => {
      result.current.refreshPlayRecords();
      result.current.refreshPlayRecords();
      jest.advanceTimersByTime(500);
      await flushAsyncWork();
    });

    expect(getPlayRecordsPage).toHaveBeenCalledTimes(1);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('loads more play records by cursor and appends the next page', async () => {
    getPlayRecordsPage
      .mockResolvedValueOnce(
        createPage(
          {
            'source+first': createRecord(),
          },
          true,
          '100:source%2Bfirst',
        ),
      )
      .mockResolvedValueOnce(
        createPage({
          'source+second': {
            ...createRecord(),
            title: '第二页',
          },
        }),
      );

    const { result } = renderHook(() => usePlaybackRecords(jest.fn()));

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    expect(result.current.hasMorePlayRecords).toBe(true);

    await act(async () => {
      await result.current.loadMorePlayRecords();
      await flushAsyncWork();
    });

    expect(getPlayRecordsPage).toHaveBeenLastCalledWith({
      cursor: '100:source%2Bfirst',
      includeKeys: [],
      pageSize: 12,
    });
    expect(Object.keys(result.current.playRecords || {})).toEqual([
      'source+first',
      'source+second',
    ]);
  });

  it('clears loading more after a priority refresh supersedes the append request', async () => {
    const appendPage = createDeferred<ReturnType<typeof createPage>>();
    const refreshedPage = createDeferred<ReturnType<typeof createPage>>();
    const firstRecord = createRecord();

    getPlayRecordsPage
      .mockResolvedValueOnce(
        createPage({ 'source+first': firstRecord }, true, '100:source%2Bfirst'),
      )
      .mockImplementationOnce(() => appendPage.promise)
      .mockImplementationOnce(() => refreshedPage.promise);

    const { result, rerender } = renderHook(
      ({ includeKeys }: { includeKeys: string[] }) =>
        usePlaybackRecords(jest.fn(), includeKeys),
      { initialProps: { includeKeys: ['source+initial'] } },
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    let loadMorePromise!: Promise<void>;
    act(() => {
      loadMorePromise = result.current.loadMorePlayRecords();
    });
    await act(async () => {
      await flushAsyncWork();
    });
    expect(result.current.loadingMorePlayRecords).toBe(true);

    rerender({ includeKeys: ['source+priority'] });
    await act(async () => {
      await flushAsyncWork();
      refreshedPage.resolve(createPage({ 'source+first': firstRecord }));
      await flushAsyncWork();
    });

    expect(result.current.loadingMorePlayRecords).toBe(false);

    await act(async () => {
      appendPage.resolve(
        createPage({
          'source+second': {
            ...createRecord(),
            title: '第二页',
          },
        }),
      );
      await loadMorePromise;
      await flushAsyncWork();
    });

    expect(result.current.loadingMorePlayRecords).toBe(false);
    expect(result.current.playRecords).toEqual({
      'source+first': firstRecord,
    });
  });

  it('does not start loading more while a silent first-page refresh is active', async () => {
    const refreshedPage = createDeferred<ReturnType<typeof createPage>>();
    const firstRecord = createRecord();
    const refreshedRecord = {
      ...createRecord(),
      title: '刷新后的首屏记录',
    };

    getPlayRecordsPage
      .mockResolvedValueOnce(
        createPage({ 'source+first': firstRecord }, true, '100:source%2Bfirst'),
      )
      .mockImplementationOnce(() => refreshedPage.promise);

    const { result, rerender } = renderHook(
      ({ includeKeys }: { includeKeys: string[] }) =>
        usePlaybackRecords(jest.fn(), includeKeys),
      { initialProps: { includeKeys: ['source+initial'] } },
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    rerender({ includeKeys: ['source+priority'] });
    await act(async () => {
      await flushAsyncWork();
    });
    expect(getPlayRecordsPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.loadMorePlayRecords();
      await flushAsyncWork();
    });

    expect(getPlayRecordsPage).toHaveBeenCalledTimes(2);
    expect(result.current.loadingMorePlayRecords).toBe(false);

    await act(async () => {
      refreshedPage.resolve(
        createPage({ 'source+refreshed': refreshedRecord }, true, 'next'),
      );
      await flushAsyncWork();
    });

    expect(result.current.playRecords).toEqual({
      'source+refreshed': refreshedRecord,
    });
  });

  it('ignores an older first-page failure after a newer refresh succeeds', async () => {
    const firstPage = createDeferred<ReturnType<typeof createPage>>();
    const refreshedPage = createDeferred<ReturnType<typeof createPage>>();
    const refreshedRecord = {
      ...createRecord(),
      title: '最新首屏',
    };
    getPlayRecordsPage
      .mockImplementationOnce(() => firstPage.promise)
      .mockImplementationOnce(() => refreshedPage.promise);

    const { result, rerender } = renderHook(
      ({ includeKeys }: { includeKeys: string[] }) =>
        usePlaybackRecords(jest.fn(), includeKeys),
      { initialProps: { includeKeys: ['source+initial'] } },
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });
    rerender({ includeKeys: ['source+priority'] });
    await act(async () => {
      await flushAsyncWork();
      refreshedPage.resolve(createPage({ 'source+latest': refreshedRecord }));
      firstPage.reject(new Error('stale request failed'));
      await flushAsyncWork();
    });

    expect(result.current.playRecords).toEqual({
      'source+latest': refreshedRecord,
    });
    expect(result.current.loadingPlayRecords).toBe(false);
  });

  it('keeps records empty when clear-all invalidates an in-flight first page', async () => {
    const firstPage = createDeferred<ReturnType<typeof createPage>>();
    getPlayRecordsPage.mockImplementationOnce(() => firstPage.promise);

    const { result } = renderHook(() => usePlaybackRecords(jest.fn()));
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    act(() => {
      result.current.markAllPlayRecordsDeleted();
    });
    await act(async () => {
      firstPage.resolve(
        createPage({ 'source+stale': createRecord() }, true, 'stale-cursor'),
      );
      await flushAsyncWork();
    });

    expect(result.current.playRecords).toEqual({});
    expect(result.current.hasMorePlayRecords).toBe(false);
    expect(result.current.loadingPlayRecords).toBe(false);
  });

  it('keeps records empty when clear-all invalidates an in-flight append', async () => {
    const appendPage = createDeferred<ReturnType<typeof createPage>>();
    getPlayRecordsPage
      .mockResolvedValueOnce(
        createPage(
          { 'source+first': createRecord() },
          true,
          '100:source%2Bfirst',
        ),
      )
      .mockImplementationOnce(() => appendPage.promise);

    const { result } = renderHook(() => usePlaybackRecords(jest.fn()));
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    let appendPromise!: Promise<void>;
    act(() => {
      appendPromise = result.current.loadMorePlayRecords();
    });
    await act(async () => {
      await flushAsyncWork();
    });
    expect(result.current.loadingMorePlayRecords).toBe(true);

    act(() => {
      result.current.markAllPlayRecordsDeleted();
    });
    await act(async () => {
      appendPage.resolve(
        createPage({
          'source+stale': {
            ...createRecord(),
            title: '旧追加结果',
          },
        }),
      );
      await appendPromise;
      await flushAsyncWork();
    });

    expect(result.current.playRecords).toEqual({});
    expect(result.current.hasMorePlayRecords).toBe(false);
    expect(result.current.loadingMorePlayRecords).toBe(false);
  });

  it('keeps locally deleted records out of later page loads', async () => {
    getPlayRecordsPage
      .mockResolvedValueOnce(
        createPage(
          {
            'source+deleted': createRecord(),
          },
          true,
          '100:source%2Bdeleted',
        ),
      )
      .mockResolvedValueOnce(
        createPage({
          'source+deleted': createRecord(),
          'source+next': {
            ...createRecord(),
            title: '下一条',
          },
        }),
      );

    const { result } = renderHook(() => usePlaybackRecords(jest.fn()));

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    act(() => {
      result.current.markPlayRecordDeleted('source+deleted');
    });

    await act(async () => {
      await result.current.loadMorePlayRecords();
      await flushAsyncWork();
    });

    expect(Object.keys(result.current.playRecords || {})).toEqual([
      'source+next',
    ]);
  });

  it('cancels scheduled initial loading after unmount', async () => {
    getPlayRecordsPage.mockResolvedValue(createPage({}));

    const { unmount } = renderHook(() => usePlaybackRecords(jest.fn()));
    unmount();

    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    expect(getPlayRecordsPage).not.toHaveBeenCalled();
  });
});
