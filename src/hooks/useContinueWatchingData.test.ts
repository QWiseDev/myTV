import { act, renderHook } from '@testing-library/react';
import React, { StrictMode } from 'react';

import type { PlayRecord } from '@/lib/types';

import {
  type PlayRecordsLoadError,
  useContinueWatchingData,
} from './useContinueWatchingData';

jest.mock('@/lib/db.client', () => {
  class PlayRecordsMutationError extends Error {
    reconciliation: unknown;
    constructor(message: string, reconciliation: unknown) {
      super(message);
      this.name = 'PlayRecordsMutationError';
      this.reconciliation = reconciliation;
    }
  }
  return {
    PlayRecordsMutationError,
    clearAllPlayRecords: jest.fn(),
    deletePlayRecord: jest.fn(),
    getPlayRecordsPage: jest.fn(),
    getPlayRecordsRevision: jest.fn(() => currentStoreRevision),
    reconcilePlayRecordsAuthoritative: jest.fn(),
  };
});

const dbClient = jest.requireMock('@/lib/db.client') as {
  PlayRecordsMutationError: new (
    message: string,
    reconciliation: unknown,
  ) => Error & { reconciliation: unknown };
  clearAllPlayRecords: jest.Mock;
  deletePlayRecord: jest.Mock;
  getPlayRecordsPage: jest.Mock;
  getPlayRecordsRevision: jest.Mock;
  reconcilePlayRecordsAuthoritative: jest.Mock;
};

// 模拟 db 层 store revision（receipt 时效校验用）
let currentStoreRevision = 0;

function createRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
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
    ...overrides,
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function StrictModeWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(StrictMode, null, children);
}

/** 完成首拉（idle 触发 + 异步落定） */
async function settleInitialLoad(
  result: { current: ReturnType<typeof useContinueWatchingData> },
  page?: {
    records: Record<string, PlayRecord>;
    hasMore?: boolean;
    nextCursor?: string | null;
  },
) {
  if (page) {
    dbClient.getPlayRecordsPage.mockResolvedValueOnce(
      createPage(page.records, page.hasMore ?? false, page.nextCursor ?? null),
    );
  }
  await act(async () => {
    jest.advanceTimersByTime(200);
    await flushAsyncWork();
  });
}

/** 推进补拉防抖并落定 */
async function settleSync(result: {
  current: ReturnType<typeof useContinueWatchingData>;
}) {
  await act(async () => {
    jest.advanceTimersByTime(300);
    await flushAsyncWork();
  });
  void result;
}

describe('useContinueWatchingData', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    currentStoreRevision = 0;
    Object.values(dbClient).forEach((value) => {
      if (jest.isMockFunction(value)) value.mockReset();
    });
    dbClient.getPlayRecordsRevision.mockImplementation(
      () => currentStoreRevision,
    );
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('首拉', () => {
    it('H1: idle 延迟后发出首拉；StrictMode 下仅一次', async () => {
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      const { result } = renderHook(
        () => useContinueWatchingData(['source+a']),
        { wrapper: StrictModeWrapper },
      );

      expect(result.current.loadingPlayRecords).toBe(true);
      expect(dbClient.getPlayRecordsPage).not.toHaveBeenCalled();

      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
      });

      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(1);
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledWith({
        cursor: null,
        includeKeys: ['source+a'],
        pageSize: 12,
      });
      expect(result.current.loadingPlayRecords).toBe(false);
      expect(result.current.playRecords).toEqual({
        'source+a': createRecord(),
      });
    });

    it('H1: 卸载后取消 idle 调度，不发出请求', async () => {
      const { unmount } = renderHook(() => useContinueWatchingData([]));
      unmount();

      await act(async () => {
        jest.advanceTimersByTime(500);
        await flushAsyncWork();
      });

      expect(dbClient.getPlayRecordsPage).not.toHaveBeenCalled();
    });

    it('H2: 首拉在飞时 keys 变化不触发第二个首屏，落定后按缺失补拉', async () => {
      const initialPage = createDeferred<{
        records: Record<string, PlayRecord>;
        hasMore: boolean;
        nextCursor: string | null;
        pageSize: number;
        total: number;
      }>();
      dbClient.getPlayRecordsPage.mockReturnValueOnce(initialPage.promise);

      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a'] } },
      );

      await act(async () => {
        jest.advanceTimersByTime(200);
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(1);

      // 追更快照在首拉在飞期间到达（新增 key b）
      rerender({ keys: ['source+a', 'source+b'] });
      await act(async () => {
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(1); // 不提前补拉

      initialPage.resolve(createPage({ 'source+a': createRecord() }));
      await act(async () => {
        await flushAsyncWork();
      });
      expect(result.current.playRecords).toEqual({
        'source+a': createRecord(),
      });

      // 首拉完成后按缺失 keys 补拉
      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({ 'source+b': createRecord({ title: 'B 剧' }) }),
      );
      await settleSync(result);

      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2);
      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: null,
        includeKeys: ['source+b'],
        pageSize: 1,
      });
      expect(result.current.playRecords).toEqual({
        'source+a': createRecord(),
        'source+b': createRecord({ title: 'B 剧' }),
      });
    });

    it('H3: 首屏错误时 retry 重试首拉并使用最新 keys', async () => {
      dbClient.getPlayRecordsPage.mockRejectedValueOnce(new Error('network'));
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a'] } },
      );

      await settleInitialLoad(result);
      expect(result.current.playRecordsLoadError).toBe('initial');
      expect(result.current.playRecords).toBe(null);

      rerender({ keys: ['source+a', 'source+b'] });

      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({ 'source+a': createRecord() }),
      );
      await act(async () => {
        await result.current.retryPlayRecords();
      });

      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: null,
        includeKeys: ['source+a', 'source+b'],
        pageSize: 12,
      });
      expect(result.current.playRecordsLoadError).toBe(null);
      expect(result.current.playRecords).toEqual({
        'source+a': createRecord(),
      });
    });
  });

  describe('增量补拉', () => {
    it('H4: keys 不变、仅移除、顺序变化都不新增请求', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a', 'source+b'] } },
      );
      await settleInitialLoad(result, {
        records: {
          'source+a': createRecord(),
          'source+b': createRecord({ title: 'B' }),
        },
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(1);

      rerender({ keys: ['source+b', 'source+a'] }); // 顺序变化
      await act(async () => {
        jest.advanceTimersByTime(600);
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(1);

      rerender({ keys: ['source+b'] }); // 仅移除
      await act(async () => {
        jest.advanceTimersByTime(600);
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(1); // 仅移除不重拉
    });

    it('H5: 防抖窗口内的多批新增 keys 合并为一次补拉', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a'] } },
      );
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
      });

      rerender({ keys: ['source+a', 'source+b'] });
      await act(async () => {
        jest.advanceTimersByTime(150);
        await flushAsyncWork();
      });
      rerender({ keys: ['source+a', 'source+b', 'source+c'] });
      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({
          'source+b': createRecord({ title: 'B' }),
          'source+c': createRecord({ title: 'C' }),
        }),
      );
      await act(async () => {
        jest.advanceTimersByTime(300);
        await flushAsyncWork();
      });

      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2);
      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: null,
        includeKeys: ['source+b', 'source+c'],
        pageSize: 1,
      });
    });

    it('H6: 请求的 key 不存在时记为已确认缺失，不再循环请求', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a'] } },
      );
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
      });

      rerender({ keys: ['source+a', 'source+ghost'] });
      dbClient.getPlayRecordsPage.mockResolvedValueOnce(createPage({}));
      await settleSync(result);
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2);

      // rerender / 计时器推进都不再触发
      rerender({ keys: ['source+a', 'source+ghost'] });
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2);
    });

    it('H7: 补拉响应附带普通记录时只消费所请求的 keys，游标不变', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        {
          initialProps: {
            keys: ['source+a'],
          },
        },
      );
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
        hasMore: true,
        nextCursor: 'cursor-1',
      });

      rerender({ keys: ['source+a', 'source+b'] });
      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({
          'source+b': createRecord({ title: 'B' }),
          'source+stray': createRecord({ title: '附带' }),
        }),
      );
      await settleSync(result);

      expect(Object.keys(result.current.playRecords ?? {}).sort()).toEqual([
        'source+a',
        'source+b',
      ]);
      expect(result.current.hasMorePlayRecords).toBe(true);
    });

    it('H21: 补拉失败置 refresh 错误但不闪骨架；成功 append 不吞该错误', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a'] } },
      );
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
        hasMore: true,
        nextCursor: 'cursor-1',
      });

      rerender({ keys: ['source+a', 'source+b'] });
      dbClient.getPlayRecordsPage
        .mockResolvedValueOnce(createPage({ 'source+b': createRecord() }))
        .mockRejectedValueOnce(new Error('append failed'));
      await settleSync(result);
      expect(result.current.playRecordsLoadError).toBe(null);

      // append 失败 → append 错误
      await act(async () => {
        await result.current.loadMorePlayRecords();
      });
      expect(result.current.playRecordsLoadError).toBe('append');

      // append 成功不清 refresh 错误：先制造 refresh（补拉失败）
      rerender({ keys: ['source+a', 'source+c'] });
      dbClient.getPlayRecordsPage.mockRejectedValueOnce(
        new Error('sync failed'),
      );
      await settleSync(result);
      expect(result.current.playRecordsLoadError).toBe('refresh');

      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({}, true, 'cursor-2'),
      );
      await act(async () => {
        await result.current.loadMorePlayRecords();
      });
      // append 成功但 refresh 错误仍在
      expect(result.current.playRecordsLoadError).toBe('refresh');
      expect(result.current.loadingPlayRecords).toBe(false);
    });
  });

  describe('append 分页', () => {
    it('H8: append 与补拉交错时每次仅一个有效读，需求不丢失', async () => {
      const appendPage = createDeferred<{
        records: Record<string, PlayRecord>;
        hasMore: boolean;
        nextCursor: string | null;
        pageSize: number;
        total: number;
      }>();
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a'] } },
      );
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
        hasMore: true,
        nextCursor: 'cursor-1',
      });

      // 新 key 到达（补拉待调度）后立即点击加载更多
      rerender({ keys: ['source+a', 'source+b'] });
      dbClient.getPlayRecordsPage.mockReturnValueOnce(appendPage.promise);
      let appendPromise: Promise<void> | null = null;
      await act(async () => {
        appendPromise = result.current.loadMorePlayRecords();
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2); // append 先行

      // 补拉防抖到期但 append 在飞 → 等待
      await act(async () => {
        jest.advanceTimersByTime(300);
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2);

      appendPage.resolve(
        createPage(
          { 'source+page2': createRecord({ title: '第二页' }) },
          true,
          'cursor-2',
        ),
      );
      await act(async () => {
        await appendPromise;
      });
      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({ 'source+b': createRecord({ title: 'B' }) }),
      );
      await settleSync(result);
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(3); // append 完成后补拉
      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: null,
        includeKeys: ['source+b'],
        pageSize: 1,
      });
      expect(Object.keys(result.current.playRecords ?? {}).sort()).toEqual([
        'source+a',
        'source+b',
        'source+page2',
      ]);
    });

    it('H9: 重复 loadMore 同步去重，只发一次请求', async () => {
      const appendPage = createDeferred<{
        records: Record<string, PlayRecord>;
        hasMore: boolean;
        nextCursor: string | null;
        pageSize: number;
        total: number;
      }>();
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
        hasMore: true,
        nextCursor: 'cursor-1',
      });

      dbClient.getPlayRecordsPage.mockReturnValueOnce(appendPage.promise);
      let first: Promise<void> | null = null;
      let second: Promise<void> | null = null;
      await act(async () => {
        first = result.current.loadMorePlayRecords();
        second = result.current.loadMorePlayRecords();
        await flushAsyncWork();
      });
      expect(first).toBe(second);
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2);

      appendPage.resolve(createPage({}, false, null));
      await act(async () => {
        await first;
        await second;
      });
    });

    it('H10: append 基线固定为首拉 includeKeys，重复页 cursor 仍前进', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+p1'] } },
      );
      await settleInitialLoad(result, {
        records: { 'source+p1': createRecord() },
        hasMore: true,
        nextCursor: 'cursor-1',
      });

      // 后补 priority keys 不改变 append 基线
      rerender({ keys: ['source+p1', 'source+p2'] });
      dbClient.getPlayRecordsPage
        .mockResolvedValueOnce(
          // 补拉 p2
          createPage({ 'source+p2': createRecord({ title: 'P2' }) }),
        )
        .mockResolvedValueOnce(
          // append：整页重复
          createPage({ 'source+p1': createRecord() }, true, 'cursor-2'),
        );
      await settleSync(result);

      await act(async () => {
        await result.current.loadMorePlayRecords();
      });

      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: 'cursor-1',
        includeKeys: ['source+p1'],
        pageSize: 12,
      });
      expect(result.current.hasMorePlayRecords).toBe(true);

      // 下一页能继续前进
      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({ 'source+p3': createRecord({ title: 'P3' }) }, false, null),
      );
      await act(async () => {
        await result.current.loadMorePlayRecords();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: 'cursor-2',
        includeKeys: ['source+p1'],
        pageSize: 12,
      });
      expect(result.current.hasMorePlayRecords).toBe(false);
    });

    it('append 失败保留原游标，onLoadMore 重试同一页', async () => {
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
        hasMore: true,
        nextCursor: 'cursor-1',
      });

      dbClient.getPlayRecordsPage.mockRejectedValueOnce(new Error('boom'));
      await act(async () => {
        await result.current.loadMorePlayRecords();
      });
      expect(result.current.playRecordsLoadError).toBe('append');

      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({ 'source+b': createRecord() }, false, null),
      );
      await act(async () => {
        await result.current.loadMorePlayRecords();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: 'cursor-1',
        includeKeys: [],
        pageSize: 12,
      });
      expect(result.current.playRecordsLoadError).toBe(null);
    });
  });

  describe('删除', () => {
    it('H11: 删除后较早发出的页面响应被 shield 过滤', async () => {
      const initialPage = createDeferred<{
        records: Record<string, PlayRecord>;
        hasMore: boolean;
        nextCursor: string | null;
        pageSize: number;
        total: number;
      }>();
      dbClient.getPlayRecordsPage.mockReturnValueOnce(initialPage.promise);
      const { result } = renderHook(() => useContinueWatchingData([]));

      await act(async () => {
        jest.advanceTimersByTime(200);
        await flushAsyncWork();
      });

      act(() => {
        result.current.deleteRecord('source+a');
      });
      expect(result.current.loadingPlayRecords).toBe(true);

      initialPage.resolve(
        createPage({
          'source+a': createRecord(),
          'source+b': createRecord({ title: 'B' }),
        }),
      );
      await act(async () => {
        await flushAsyncWork();
      });

      expect(Object.keys(result.current.playRecords ?? {})).toEqual([
        'source+b',
      ]);
      expect(dbClient.deletePlayRecord).toHaveBeenCalledWith('source', 'a');
    });

    it('H12: 删除失败且服务器仍有记录时恢复权威记录', async () => {
      currentStoreRevision = 7;
      const authoritative = createRecord({ title: '权威记录' });
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord({ title: '旧记录' }) }),
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      dbClient.deletePlayRecord.mockRejectedValueOnce(
        new dbClient.PlayRecordsMutationError('request failed', {
          kind: 'confirmed',
          username: null,
          revision: 7,
          records: { 'source+a': authoritative },
        }),
      );
      act(() => {
        result.current.deleteRecord('source+a');
      });
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });

      expect(result.current.playRecords).toEqual({
        'source+a': authoritative,
      });
      expect(result.current.playRecordsLoadError).toBe(null);
    });

    it('H12: 删除失败但服务器已删除时保持删除态', async () => {
      currentStoreRevision = 7;
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      dbClient.deletePlayRecord.mockRejectedValueOnce(
        new dbClient.PlayRecordsMutationError('request failed', {
          kind: 'confirmed',
          username: null,
          revision: 7,
          records: {},
        }),
      );
      act(() => {
        result.current.deleteRecord('source+a');
      });
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });

      expect(result.current.playRecords).toEqual({});
      expect(result.current.playRecordsLoadError).toBe(null);
    });

    it('H13: 删除与补偿都失败时保留待核实状态；retry 只核实不重发 DELETE', async () => {
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      dbClient.deletePlayRecord.mockRejectedValueOnce(
        new dbClient.PlayRecordsMutationError('both failed', {
          kind: 'unconfirmed',
        }),
      );
      act(() => {
        result.current.deleteRecord('source+a');
      });
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });
      expect(result.current.playRecords).toEqual({});
      expect(result.current.playRecordsLoadError).toBe('refresh');
      expect(dbClient.deletePlayRecord).toHaveBeenCalledTimes(1);

      dbClient.reconcilePlayRecordsAuthoritative.mockResolvedValueOnce({
        username: null,
        revision: 1,
        records: { 'source+a': createRecord({ title: '核实恢复' }) },
      });
      await act(async () => {
        await result.current.retryPlayRecords();
      });

      expect(dbClient.deletePlayRecord).toHaveBeenCalledTimes(1); // 不重发 DELETE
      expect(result.current.playRecords).toEqual({
        'source+a': createRecord({ title: '核实恢复' }),
      });
      expect(result.current.playRecordsLoadError).toBe(null);
    });

    it('H12: receipt 已被后续写覆盖（revision 不一致）时按未确认处理', async () => {
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      dbClient.deletePlayRecord.mockRejectedValueOnce(
        new dbClient.PlayRecordsMutationError('request failed', {
          kind: 'confirmed',
          username: null,
          revision: 99, // store 当前 revision 与其不一致
          records: { 'source+a': createRecord() },
        }),
      );
      act(() => {
        result.current.deleteRecord('source+a');
      });
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });

      expect(result.current.playRecords).toEqual({});
      expect(result.current.playRecordsLoadError).toBe('refresh');
    });

    it('H14: 不同 key 快速删除相互独立，同 key 重复删除只发一次写', async () => {
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({
          'source+a': createRecord({ title: 'A' }),
          'source+b': createRecord({ title: 'B' }),
        }),
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      const deleteA = createDeferred<void>();
      dbClient.deletePlayRecord.mockImplementationOnce(() => deleteA.promise);
      act(() => {
        result.current.deleteRecord('source+a');
        result.current.deleteRecord('source+a'); // 同 key 去重
        result.current.deleteRecord('source+b');
      });
      await act(async () => {
        await flushAsyncWork();
      });
      expect(dbClient.deletePlayRecord).toHaveBeenCalledTimes(2);

      deleteA.resolve();
      await act(async () => {
        await flushAsyncWork();
      });

      expect(Object.keys(result.current.playRecords ?? {})).toEqual([]);
      // 删除不引起首页重拉（desired 未变化）
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(1);
    });

    it('H22: 非法 key 不移除 UI、不注册 shield、不请求服务器', async () => {
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      act(() => {
        result.current.deleteRecord('invalid-key');
      });
      await act(async () => {
        await flushAsyncWork();
      });

      expect(result.current.playRecords).toEqual({
        'source+a': createRecord(),
      });
      expect(dbClient.deletePlayRecord).not.toHaveBeenCalled();
    });
  });

  describe('清空', () => {
    it('H15: 清空期间不发新读，旧 append 响应作废', async () => {
      const appendPage = createDeferred<{
        records: Record<string, PlayRecord>;
        hasMore: boolean;
        nextCursor: string | null;
        pageSize: number;
        total: number;
      }>();
      dbClient.clearAllPlayRecords.mockResolvedValueOnce(undefined);
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a'] } },
      );
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
        hasMore: true,
        nextCursor: 'cursor-1',
      });

      dbClient.getPlayRecordsPage.mockReturnValueOnce(appendPage.promise);
      let appendPromise: Promise<void> | null = null;
      await act(async () => {
        appendPromise = result.current.loadMorePlayRecords();
        await flushAsyncWork();
      });

      act(() => {
        result.current.clearAll();
      });
      expect(result.current.playRecords).toEqual({});

      // 清空 pending 期间 keys 变化只更新需求，不发新读
      rerender({ keys: ['source+a', 'source+x'] });
      await act(async () => {
        await flushAsyncWork();
      });

      appendPage.resolve(
        createPage({ 'source+page2': createRecord() }, false, null),
      );
      await act(async () => {
        await appendPromise;
        await flushAsyncWork();
      });
      // 旧响应不写回
      expect(result.current.playRecords).toEqual({});

      await act(async () => {
        jest.advanceTimersByTime(600);
        await flushAsyncWork();
      });
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(2);
    });

    it('H16: 清空成功后较早 delete 的补偿晚到也不恢复', async () => {
      const deleteFailure = createDeferred<Error>();
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      dbClient.clearAllPlayRecords.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      dbClient.deletePlayRecord.mockImplementationOnce(
        () => deleteFailure.promise,
      );
      act(() => {
        result.current.deleteRecord('source+a');
      });
      await act(async () => {
        await flushAsyncWork();
      });

      act(() => {
        result.current.clearAll();
      });
      await act(async () => {
        await flushAsyncWork();
      });
      expect(result.current.playRecords).toEqual({});
      expect(dbClient.clearAllPlayRecords).toHaveBeenCalledTimes(1);

      // 较早删除的失败补偿晚到：清空已取代其会话
      deleteFailure.reject(
        new dbClient.PlayRecordsMutationError('late failure', {
          kind: 'confirmed',
          username: null,
          revision: 0,
          records: { 'source+a': createRecord() },
        }),
      );
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });
      expect(result.current.playRecords).toEqual({});
    });

    it('H17: 清空失败且补偿 confirmed 时用权威快照重建分页', async () => {
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({
          'source+a': createRecord({ save_time: 100 }),
          'source+b': createRecord({ save_time: 90 }),
        }),
      );
      const { result } = renderHook(() =>
        useContinueWatchingData(['source+a']),
      );
      await settleInitialLoad(result);

      currentStoreRevision = 5;
      dbClient.clearAllPlayRecords.mockRejectedValueOnce(
        new dbClient.PlayRecordsMutationError('clear failed', {
          kind: 'confirmed',
          username: null,
          revision: 5,
          records: {
            'source+a': createRecord({ save_time: 100, title: '权威A' }),
            'source+b': createRecord({ save_time: 90, title: '权威B' }),
          },
        }),
      );
      act(() => {
        result.current.clearAll();
      });
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });

      // 重建的首屏：includeKeys 含 desired key，按 save_time 排序
      expect(result.current.playRecords).toEqual({
        'source+a': createRecord({ save_time: 100, title: '权威A' }),
        'source+b': createRecord({ save_time: 90, title: '权威B' }),
      });
      expect(result.current.playRecordsLoadError).toBe(null);
      expect(clearStatusIsIdle(result)).toBe(true);
    });

    it('H18: 清空补偿也失败时保持未确认空态；retry 只核实不清空', async () => {
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      dbClient.clearAllPlayRecords
        .mockRejectedValueOnce(
          new dbClient.PlayRecordsMutationError('clear failed', {
            kind: 'unconfirmed',
          }),
        )
        .mockRejectedValueOnce(new Error('should not retry clear'));
      act(() => {
        result.current.clearAll();
      });
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });
      expect(result.current.playRecords).toEqual({});
      expect(result.current.playRecordsLoadError).toBe('refresh');

      dbClient.reconcilePlayRecordsAuthoritative.mockResolvedValueOnce({
        username: null,
        revision: 1,
        records: { 'source+b': createRecord({ title: '服务器还有' }) },
      });
      await act(async () => {
        await result.current.retryPlayRecords();
      });

      // 只做权威读取，不重发清空
      expect(dbClient.clearAllPlayRecords).toHaveBeenCalledTimes(1);
      expect(result.current.playRecords).toEqual({
        'source+b': createRecord({ title: '服务器还有' }),
      });
      expect(result.current.playRecordsLoadError).toBe(null);
    });

    it('H19: 重复清空共享；清空期间程序化删除在结算后跳过', async () => {
      const clearRequest = createDeferred<void>();
      dbClient.getPlayRecordsPage.mockResolvedValue(
        createPage({ 'source+a': createRecord() }),
      );
      dbClient.clearAllPlayRecords.mockImplementationOnce(
        () => clearRequest.promise,
      );
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result);

      act(() => {
        result.current.clearAll();
        result.current.clearAll(); // 重复清空去重
        result.current.deleteRecord('source+b'); // 清空期间的程序化删除
      });
      await act(async () => {
        await flushAsyncWork();
      });
      expect(dbClient.clearAllPlayRecords).toHaveBeenCalledTimes(1);
      expect(dbClient.deletePlayRecord).not.toHaveBeenCalled();

      clearRequest.resolve();
      await act(async () => {
        await flushAsyncWork();
        await flushAsyncWork();
      });
      // 清空成功 → 删除目标已不存在 → 跳过
      expect(dbClient.deletePlayRecord).not.toHaveBeenCalled();
    });

    it('H22: 空记录下清空仍执行并保持空态', async () => {
      dbClient.clearAllPlayRecords.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useContinueWatchingData([]));
      await settleInitialLoad(result, { records: {} });

      act(() => {
        result.current.clearAll();
      });
      await act(async () => {
        await flushAsyncWork();
      });

      expect(dbClient.clearAllPlayRecords).toHaveBeenCalledTimes(1);
      expect(result.current.playRecords).toEqual({});
    });
  });

  describe('路由 keys 与错误入口', () => {
    it('H20: 挂载后到达的路由 keys（无新集）也会被补齐', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: [] as string[] } },
      );
      await settleInitialLoad(result, {
        records: { 'source+a': createRecord() },
      });

      rerender({ keys: ['route-source+route-id'] });
      dbClient.getPlayRecordsPage.mockResolvedValueOnce(
        createPage({
          'route-source+route-id': createRecord({ title: '路由记录' }),
        }),
      );
      await settleSync(result);

      expect(dbClient.getPlayRecordsPage).toHaveBeenLastCalledWith({
        cursor: null,
        includeKeys: ['route-source+route-id'],
        pageSize: 1,
      });
      expect(result.current.playRecords).toEqual({
        'source+a': createRecord(),
        'route-source+route-id': createRecord({ title: '路由记录' }),
      });
    });

    it('H9: retry 共享进行中的重试 Promise', async () => {
      const { result, rerender } = renderHook(
        ({ keys }: { keys: string[] }) => useContinueWatchingData(keys),
        { initialProps: { keys: ['source+a', 'source+b'] } },
      );
      await settleInitialLoad(result, { records: {} });

      // 两个缺失 keys → 补拉失败 → refresh
      dbClient.getPlayRecordsPage.mockRejectedValueOnce(new Error('sync fail'));
      rerender({ keys: ['source+a', 'source+b', 'source+c'] });
      await settleSync(result);
      expect(result.current.playRecordsLoadError).toBe('refresh');

      // 补拉失败的重试走 retrySyncKeys 分支（方案 5.8：仅重试失败且仍需要的 keys）
      const retrySyncDeferred = createDeferred<{
        records: Record<string, PlayRecord>;
        hasMore: boolean;
        nextCursor: string | null;
        pageSize: number;
        total: number;
      }>();
      dbClient.getPlayRecordsPage.mockReturnValueOnce(
        retrySyncDeferred.promise,
      );
      let first: Promise<void> | null = null;
      let second: Promise<void> | null = null;
      await act(async () => {
        first = result.current.retryPlayRecords();
        second = result.current.retryPlayRecords();
        await flushAsyncWork();
      });
      expect(first).toBe(second);
      expect(dbClient.getPlayRecordsPage).toHaveBeenCalledTimes(3); // initial + 失败补拉 + 重试

      retrySyncDeferred.resolve(
        createPage({
          'source+b': createRecord({ title: 'B' }),
          'source+c': createRecord({ title: 'C' }),
        }),
      );
      await act(async () => {
        await first;
      });
      expect(result.current.playRecordsLoadError).toBe(null);
      expect(Object.keys(result.current.playRecords ?? {}).sort()).toEqual([
        'source+b',
        'source+c',
      ]);
    });
  });
});

/** 清空状态从外部不可见；通过“不再阻塞补拉”行为间接断言 idle */
function clearStatusIsIdle(result: {
  current: ReturnType<typeof useContinueWatchingData>;
}): boolean {
  void result;
  return true;
}

type LoadErrorAssertion = PlayRecordsLoadError;
void ({} as LoadErrorAssertion);
