import { act, render } from '@testing-library/react';
import React, { useEffect, useRef } from 'react';

import type { PlayRecord } from '@/lib/types';
import type { WatchingUpdate } from '@/lib/watching-updates';

import { PlaybackDataProvider, usePlaybackData } from './PlayPageContext';

/**
 * Provider / 新 hook / db.client 真实链路集成测试（方案 7.3）。
 * 仅 mock 网络层（global.fetch）与追更快照数据源，存储层走真实实现。
 */

// STORAGE_TYPE 固定为 redis 模式，避免依赖 RUNTIME_CONFIG 的模块加载时序
jest.mock('@/lib/db.client/core', () => ({
  ...jest.requireActual('@/lib/db.client/core'),
  STORAGE_TYPE: 'redis',
}));

// 追更快照数据源可控（真实 snapshot/refresh hooks 继续参与渲染链路）
let currentWatchingUpdates: WatchingUpdate | null = null;

jest.mock('@/lib/watching-updates', () => ({
  getDetailedWatchingUpdates: () => currentWatchingUpdates,
  checkWatchingUpdates: jest.fn(async () => undefined),
  forceClearWatchingUpdatesCache: jest.fn(() => {
    currentWatchingUpdates = null;
  }),
  subscribeToWatchingUpdatesEvent: jest.fn(() => () => undefined),
  dispatchWatchingUpdatesEvent: jest.fn(),
  markUpdatesAsViewed: jest.fn(),
  getCachedWatchingUpdates: jest.fn(() => false),
}));

jest.mock('@/lib/browser-scheduler', () => ({
  ...jest.requireActual('@/lib/browser-scheduler'),
  scheduleIdleTask: (
    callback: () => void,
    options: { delayMs?: number } = {},
  ) => {
    const timer = setTimeout(callback, options.delayMs ?? 0);
    return () => clearTimeout(timer);
  },
}));

function makeUpdates(
  series: Array<{
    sourceKey: string;
    videoId: string;
    hasNewEpisode?: boolean;
  }>,
): WatchingUpdate {
  return {
    hasUpdates: series.some((item) => item.hasNewEpisode),
    timestamp: Date.now(),
    updatedCount: series.filter((item) => item.hasNewEpisode).length,
    continueWatchingCount: 0,
    updatedSeries: series.map((item) => ({
      title: `剧集-${item.videoId}`,
      source_name: item.sourceKey,
      year: '2026',
      cover: '',
      sourceKey: item.sourceKey,
      videoId: item.videoId,
      currentEpisode: 1,
      totalEpisodes: 12,
      hasNewEpisode: item.hasNewEpisode ?? false,
      hasContinueWatching: true,
      newEpisodes: item.hasNewEpisode ? 2 : 0,
    })),
  };
}

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

type CapturedData = ReturnType<typeof usePlaybackData>;

function DataProbe({ capture }: { capture: (data: CapturedData) => void }) {
  const data = usePlaybackData();
  const ref = useRef(capture);
  ref.current = capture;
  useEffect(() => {
    ref.current(data);
  });
  return null;
}

function renderProvider(props: { includeKeys?: string[] } = {}) {
  const captured: { current: CapturedData | null } = { current: null };
  const element = (
    <PlaybackDataProvider includePlayRecordKeys={props.includeKeys ?? []}>
      <DataProbe capture={(data) => (captured.current = data)} />
    </PlaybackDataProvider>
  );
  const view = render(element);
  const rerender = (nextProps: { includeKeys?: string[] }) => {
    view.rerender(
      <PlaybackDataProvider includePlayRecordKeys={nextProps.includeKeys ?? []}>
        <DataProbe capture={(data) => (captured.current = data)} />
      </PlaybackDataProvider>,
    );
  };
  return { captured, rerender, view };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PlaybackDataProvider 集成链路', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    currentWatchingUpdates = null;
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'test-user' }),
    )}; path=/`;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    localStorage.clear();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('场景1: 冷追更缓存首拉后，追更快照到达触发缺失 keys 补拉', async () => {
    currentWatchingUpdates = null;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = input as string;
      if (url.includes('/api/watching-updates')) {
        return {
          json: async () => ({
            hasUpdates: false,
            timestamp: 0,
            updatedCount: 0,
            continueWatchingCount: 0,
            updatedSeries: [],
          }),
          ok: true,
          status: 200,
        } as Response;
      }
      if (url.includes('pageSize=12')) {
        return {
          json: async () => createPage({ 'src+old': createRecord() }),
          ok: true,
          status: 200,
        } as Response;
      }
      return {
        json: async () =>
          createPage({ 'src+new': createRecord({ title: '新剧集' }) }),
        ok: true,
        status: 200,
      } as Response;
    }) as unknown as typeof global.fetch;

    const { captured } = renderProvider();
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    // 首拉：pageSize=12，无追更 keys
    expect(captured.current?.playRecords).toEqual({
      'src+old': createRecord(),
    });
    const firstCallUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('pageSize=12');
    expect(firstCallUrl).not.toContain('includeKey');

    // 追更快照到达（ Provider 的 refreshWatchingUpdates 重读数据源）
    currentWatchingUpdates = makeUpdates([
      { sourceKey: 'src', videoId: 'new', hasNewEpisode: true },
    ]);
    await act(async () => {
      await captured.current?.refreshWatchingUpdates();
      await flushAsyncWork();
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await flushAsyncWork();
    });

    // 缺失 key 补拉：pageSize=1 + includeKey
    const urls = (global.fetch as jest.Mock).mock.calls.map(
      (call) => call[0] as string,
    );
    const syncCall = urls.find((url) => url.endsWith('pageSize=1'));
    expect(syncCall).toBeDefined();
    expect(syncCall).toContain(`includeKey=${encodeURIComponent('src+new')}`);
    expect(captured.current?.playRecords).toEqual({
      'src+old': createRecord(),
      'src+new': createRecord({ title: '新剧集' }),
    });
  });

  it('场景2: 多次删除成功且追更 keys 只减少时，不触发新的首页读取', async () => {
    currentWatchingUpdates = makeUpdates([
      { sourceKey: 'src', videoId: 'a', hasNewEpisode: true },
      { sourceKey: 'src', videoId: 'b', hasNewEpisode: true },
    ]);
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: true, status: 200 } as Response;
        }
        return {
          json: async () =>
            createPage({
              'src+a': createRecord({ title: 'A' }),
              'src+b': createRecord({ title: 'B' }),
            }),
          ok: true,
          status: 200,
        } as Response;
      },
    ) as unknown as typeof global.fetch;

    const { captured } = renderProvider();
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });
    const initialCallCount = (global.fetch as jest.Mock).mock.calls.length;
    expect(initialCallCount).toBe(1); // 一次首拉覆盖全部追更 keys

    // 连续删除两条成功记录
    act(() => {
      captured.current?.deleteRecord('src+a');
      captured.current?.deleteRecord('src+b');
    });
    await act(async () => {
      await flushAsyncWork();
      await flushAsyncWork();
    });
    expect(captured.current?.playRecords).toEqual({});

    // 追更快照仅移除被删 keys（删除触发追更失效）
    currentWatchingUpdates = makeUpdates([]);
    await act(async () => {
      await captured.current?.refreshWatchingUpdates();
      await flushAsyncWork();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await flushAsyncWork();
    });

    // 没有新增分页读取（DELETE 不算）
    const pageCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (call) =>
        (call[0] as string).includes('/api/playrecords?') &&
        (call[0] as string).includes('pageSize='),
    );
    expect(pageCalls).toHaveLength(1);
  });

  it('场景3: DELETE 失败 → db 权威补偿 → 服务器仍有记录时恢复（仅一次补偿 GET）', async () => {
    currentWatchingUpdates = null;
    let requestCount = 0;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: false, status: 500 } as Response;
        }
        requestCount += 1;
        if (requestCount === 1) {
          return {
            json: async () =>
              createPage({ 'src+a': createRecord({ title: '旧记录' }) }),
            ok: true,
            status: 200,
          } as Response;
        }
        // 权威补偿读取：服务器仍有该记录
        return {
          json: async () => ({ 'src+a': createRecord({ title: '权威记录' }) }),
          ok: true,
          status: 200,
        } as Response;
      },
    ) as unknown as typeof global.fetch;

    const { captured } = renderProvider();
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    act(() => {
      captured.current?.deleteRecord('src+a');
    });
    await act(async () => {
      await flushAsyncWork();
      await flushAsyncWork();
    });

    // 恢复的是权威记录，而非删除前的本地旧值
    expect(captured.current?.playRecords).toEqual({
      'src+a': createRecord({ title: '权威记录' }),
    });
    // 首拉走分页读取；全量读取仅删除失败后的自动补偿 1 次，hook 不再补发
    const fullReads = (global.fetch as jest.Mock).mock.calls.filter(
      (call) =>
        (call[0] as string).startsWith('/api/playrecords') &&
        !(call[0] as string).includes('?'),
    );
    expect(fullReads).toHaveLength(1);
  });

  it('场景4: 删除补偿也失败时暴露 refresh 重试入口，核实成功后恢复', async () => {
    currentWatchingUpdates = null;
    let requestCount = 0;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: false, status: 500 } as Response;
        }
        requestCount += 1;
        if (requestCount === 1) {
          return {
            json: async () => createPage({ 'src+a': createRecord() }),
            ok: true,
            status: 200,
          } as Response;
        }
        if (requestCount === 2) {
          // 删除后的自动补偿读取也失败
          throw new Error('reconcile failed');
        }
        // 手工 retry 的核实读取成功
        return {
          json: async () => ({ 'src+a': createRecord({ title: '核实恢复' }) }),
          ok: true,
          status: 200,
        } as Response;
      },
    ) as unknown as typeof global.fetch;

    const { captured } = renderProvider();
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    act(() => {
      captured.current?.deleteRecord('src+a');
    });
    await act(async () => {
      await flushAsyncWork();
      await flushAsyncWork();
    });
    expect(captured.current?.playRecords).toEqual({});
    expect(captured.current?.playRecordsLoadError).toBe('refresh');

    await act(async () => {
      await captured.current?.retryPlayRecords();
    });
    expect(captured.current?.playRecords).toEqual({
      'src+a': createRecord({ title: '核实恢复' }),
    });
    expect(captured.current?.playRecordsLoadError).toBe(null);
    // 自动补偿 1 次 + 手工核实 1 次
    expect(requestCount).toBe(3);
  });

  it('场景5: Hero 最新记录删除后切到下一条（数据层）', async () => {
    currentWatchingUpdates = null;
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return { ok: true, status: 200 } as Response;
        }
        return {
          json: async () =>
            createPage({
              'src+newest': createRecord({ title: '最新', save_time: 300 }),
              'src+older': createRecord({ title: '较旧', save_time: 200 }),
            }),
          ok: true,
          status: 200,
        } as Response;
      },
    ) as unknown as typeof global.fetch;

    const { captured } = renderProvider();
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    const latestBefore = Object.values(
      captured.current?.playRecords ?? {},
    ).sort((a, b) => b.save_time - a.save_time)[0];
    expect(latestBefore?.title).toBe('最新');

    act(() => {
      captured.current?.deleteRecord('src+newest');
    });
    await act(async () => {
      await flushAsyncWork();
      await flushAsyncWork();
    });

    const latestAfter = Object.values(captured.current?.playRecords ?? {}).sort(
      (a, b) => b.save_time - a.save_time,
    )[0];
    expect(latestAfter?.title).toBe('较旧');
    // loadingPlayRecords 全程未回 true（补拉/删除不闪骨架）
    expect(captured.current?.loadingPlayRecords).toBe(false);
  });

  it('场景6: 播放页路由 keys 挂载后变化，目标记录被补齐', async () => {
    currentWatchingUpdates = null;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = input as string;
      if (url.includes('includeKey=')) {
        return {
          json: async () =>
            createPage({
              'play-src+play-id': createRecord({ title: '播放目标' }),
            }),
          ok: true,
          status: 200,
        } as Response;
      }
      return {
        json: async () => createPage({ 'src+other': createRecord() }),
        ok: true,
        status: 200,
      } as Response;
    }) as unknown as typeof global.fetch;

    const { captured, rerender } = renderProvider();
    await act(async () => {
      jest.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    rerender({ includeKeys: ['play-src+play-id'] });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await flushAsyncWork();
    });

    expect(captured.current?.playRecords).toEqual({
      'src+other': createRecord(),
      'play-src+play-id': createRecord({ title: '播放目标' }),
    });
  });
});
