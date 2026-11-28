import { act, renderHook } from '@testing-library/react';

import { cachedGet } from '@/lib/api-cache.client';
import { deletePlayRecord } from '@/lib/db.client';
import type { SearchResult } from '@/lib/types';

import { useSourceSwitcher } from './useSourceSwitcher';

jest.mock('@/lib/api-cache.client', () => ({
  cachedGet: jest.fn(),
}));

jest.mock('@/lib/db.client', () => ({
  deletePlayRecord: jest.fn(),
}));

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createSource(
  source: string,
  id: string,
  overrides: Partial<SearchResult> = {},
): SearchResult {
  return {
    id,
    title: `${source} title`,
    poster: `https://example.com/${source}.jpg`,
    episodes: ['episode-1'],
    episodes_titles: [],
    source,
    source_name: source,
    year: '2025',
    ...overrides,
  };
}

function createParams(availableSources: SearchResult[]) {
  return {
    setVideoLoadingStage: jest.fn(),
    setIsVideoLoading: jest.fn(),
    lastDanmuLoadKeyRef: { current: 'old-key' },
    danmuLoadingRef: { current: true },
    danmuOperationTimeoutRef: { current: null },
    episodeSwitchTimeoutRef: { current: null },
    artPlayerRef: { current: null },
    currentSourceRef: { current: 'source-a' },
    currentIdRef: { current: 'id-a' },
    availableSources,
    currentEpisodeIndex: 0,
    resumeTimeRef: { current: null },
    setVideoTitle: jest.fn(),
    setVideoYear: jest.fn(),
    setVideoCover: jest.fn(),
    setVideoDoubanId: jest.fn(),
    videoDoubanIdRef: { current: null },
    setCurrentSource: jest.fn(),
    setCurrentId: jest.fn(),
    setDetail: jest.fn(),
    setAvailableSources: jest.fn(),
    setCurrentEpisodeIndex: jest.fn(),
    isSourceChangingRef: { current: false },
    sourceChangeOwnerRef: { current: null },
    externalDanmuEnabledRef: { current: false },
    loadExternalDanmu: jest.fn(async () => []),
  } as Parameters<typeof useSourceSwitcher>[0];
}

describe('useSourceSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(
      {},
      '',
      '/play?source=source-a&id=id-a&title=Old&stitle=Search&stype=tv&prefer=true',
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('an existing failover callback reads the latest available sources', async () => {
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', { douban_id: 2 });
    const params = createParams([sourceA]);

    const { result, rerender } = renderHook(
      ({ sources }) =>
        useSourceSwitcher({
          ...params,
          availableSources: sources,
        }),
      { initialProps: { sources: [sourceA] } },
    );
    const failoverCallback = result.current.handleSourceChange;

    rerender({ sources: [sourceA, sourceB] });

    await act(async () => {
      await failoverCallback('source-b', 'id-b', 'fallback title');
    });

    expect(params.setDetail).toHaveBeenCalledWith(sourceB);
  });

  test('hydrates before committing and keeps the old play record', async () => {
    let resolveDetail: (detail: SearchResult) => void = () => undefined;
    const detailPromise = new Promise<SearchResult>((resolve) => {
      resolveDetail = resolve;
    });
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: undefined,
    });
    const hydratedSourceB = createSource('source-b', 'id-b', {
      title: 'Hydrated title',
      poster: 'https://example.com/hydrated.jpg',
      douban_id: 222,
    });
    const params = createParams([sourceA, sourceB]);
    (cachedGet as jest.Mock).mockReturnValue(detailPromise);

    const { result } = renderHook(() => useSourceSwitcher(params));
    let switchPromise: Promise<void> | void;

    act(() => {
      switchPromise = result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(cachedGet).toHaveBeenCalledWith('/api/detail', {
      source: 'source-b',
      id: 'id-b',
    });
    expect(params.setCurrentSource).not.toHaveBeenCalled();
    expect(deletePlayRecord).not.toHaveBeenCalled();

    await act(async () => {
      resolveDetail(hydratedSourceB);
      await switchPromise;
    });

    expect(params.setCurrentSource).toHaveBeenCalledWith('source-b');
    expect(params.setCurrentId).toHaveBeenCalledWith('id-b');
    expect(params.setDetail).toHaveBeenCalledWith(hydratedSourceB);
    expect(deletePlayRecord).not.toHaveBeenCalled();

    const url = new URL(window.location.href);
    expect(url.searchParams.get('title')).toBe('Hydrated title');
    // 封面不再进地址栏，旧 poster 参数会被清掉
    expect(url.searchParams.get('poster')).toBeNull();
    expect(url.searchParams.get('douban_id')).toBe('222');
    expect(url.searchParams.get('stitle')).toBe('Search');
    expect(url.searchParams.get('stype')).toBe('tv');
    expect(url.searchParams.has('prefer')).toBe(false);
  });

  test('rejects a source without a playable episode and releases the switch lock', async () => {
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: 2,
      episodes: [],
    });
    const params = createParams([sourceA, sourceB]);
    const { result } = renderHook(() => useSourceSwitcher(params));

    await act(async () => {
      await result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });

    expect(params.setCurrentSource).not.toHaveBeenCalled();
    expect(params.isSourceChangingRef.current).toBe(false);
    expect(params.setIsVideoLoading).toHaveBeenLastCalledWith(false);
  });

  test('keeps the current player and shows a notice when switching fails mid-playback', async () => {
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: 2,
      episodes: [],
    });
    const notice = { show: '' };
    const params = createParams([sourceA, sourceB]);
    params.artPlayerRef.current = {
      notice,
    } as unknown as typeof params.artPlayerRef.current;
    const { result } = renderHook(() => useSourceSwitcher(params));

    await act(async () => {
      await result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });

    // 正在播放时不走整页错误，避免卸载播放器
    expect(notice.show).toContain('目标播放源当前集没有可播放地址');
    expect(params.isSourceChangingRef.current).toBe(false);
    expect(params.setIsVideoLoading).toHaveBeenLastCalledWith(false);
  });

  test('does not commit a deferred hydration after unmount', async () => {
    let resolveDetail: (detail: SearchResult) => void = () => undefined;
    const detailPromise = new Promise<SearchResult>((resolve) => {
      resolveDetail = resolve;
    });
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: undefined,
    });
    const hydratedSourceB = createSource('source-b', 'id-b', {
      douban_id: 222,
    });
    const params = createParams([sourceA, sourceB]);
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');
    (cachedGet as jest.Mock).mockReturnValue(detailPromise);

    const { result, unmount } = renderHook(() => useSourceSwitcher(params));
    let switchPromise: Promise<void> | void;

    act(() => {
      switchPromise = result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    replaceStateSpy.mockClear();
    unmount();

    await act(async () => {
      resolveDetail(hydratedSourceB);
      await switchPromise;
    });

    expect(params.setCurrentSource).not.toHaveBeenCalled();
    expect(params.setDetail).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(params.isSourceChangingRef.current).toBe(false);

    replaceStateSpy.mockRestore();
  });

  test('does not commit a deferred hydration after navigating away from play', async () => {
    let resolveDetail: (detail: SearchResult) => void = () => undefined;
    const detailPromise = new Promise<SearchResult>((resolve) => {
      resolveDetail = resolve;
    });
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: undefined,
    });
    const hydratedSourceB = createSource('source-b', 'id-b', {
      douban_id: 222,
    });
    const params = createParams([sourceA, sourceB]);
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');
    (cachedGet as jest.Mock).mockReturnValue(detailPromise);

    const { result } = renderHook(() => useSourceSwitcher(params));
    let switchPromise: Promise<void> | void;

    act(() => {
      switchPromise = result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    window.history.pushState({}, '', '/browse?tab=hot');
    replaceStateSpy.mockClear();

    await act(async () => {
      resolveDetail(hydratedSourceB);
      await switchPromise;
    });

    expect(params.setCurrentSource).not.toHaveBeenCalled();
    expect(params.setDetail).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/browse');
    expect(params.isSourceChangingRef.current).toBe(false);

    replaceStateSpy.mockRestore();
  });

  test('keeps the switch pending for player reinitialization when the target URL is unchanged', async () => {
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: 2,
      episodes: ['shared-episode'],
    });
    const params = createParams([sourceA, sourceB]);
    params.resumeTimeRef.current = 37;

    const { result } = renderHook(() => useSourceSwitcher(params));

    await act(async () => {
      await result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });

    expect(params.setCurrentSource).toHaveBeenCalledWith('source-b');
    expect(params.setCurrentId).toHaveBeenCalledWith('id-b');
    expect(params.setDetail).toHaveBeenCalledWith(sourceB);
    expect(params.lastDanmuLoadKeyRef.current).toBe('');
    expect(params.resumeTimeRef.current).toBe(37);
    expect(params.isSourceChangingRef.current).toBe(true);
    expect(params.sourceChangeOwnerRef.current).toEqual({
      by: 'user',
      source: 'source-b',
      id: 'id-b',
    });
    expect(params.setIsVideoLoading).toHaveBeenLastCalledWith(true);
  });

  test('rejects an automatic source change while another switch is in flight', async () => {
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', { douban_id: 2 });
    const params = createParams([sourceA, sourceB]);
    params.isSourceChangingRef.current = true;
    params.sourceChangeOwnerRef.current = {
      by: 'user',
      source: 'source-c',
      id: 'id-c',
    };

    const { result } = renderHook(() => useSourceSwitcher(params));

    await act(async () => {
      await result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
        { initiatedBy: 'auto' },
      );
    });

    expect(params.setCurrentSource).not.toHaveBeenCalled();
    expect(params.setCurrentId).not.toHaveBeenCalled();
    expect(params.setDetail).not.toHaveBeenCalled();
    expect(params.isSourceChangingRef.current).toBe(true);
    expect(params.sourceChangeOwnerRef.current).toEqual({
      by: 'user',
      source: 'source-c',
      id: 'id-c',
    });
  });

  test('a manual source change overrides an in-flight automatic switch', async () => {
    let resolveAutoDetail: (detail: SearchResult) => void = () => undefined;
    const autoDetailPromise = new Promise<SearchResult>((resolve) => {
      resolveAutoDetail = resolve;
    });
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: undefined,
    });
    const hydratedSourceB = createSource('source-b', 'id-b', {
      douban_id: 222,
    });
    const sourceC = createSource('source-c', 'id-c', { douban_id: 3 });

    const params = createParams([sourceA, sourceB, sourceC]);
    (cachedGet as jest.Mock)
      .mockReturnValueOnce(autoDetailPromise)
      .mockResolvedValueOnce(sourceC);

    const { result } = renderHook(() => useSourceSwitcher(params));

    let autoSwitchPromise: Promise<void> | void;
    act(() => {
      // 模拟播放失败后的自动换源（目标 source-b，hydrate 挂起中）
      autoSwitchPromise = result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
        { initiatedBy: 'auto' },
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(params.isSourceChangingRef.current).toBe(true);

    // 用户在自动换源进行中点击了 source-c
    let manualSwitchPromise: Promise<void> | void;
    act(() => {
      manualSwitchPromise = result.current.handleSourceChange(
        'source-c',
        'id-c',
        'fallback title',
      );
    });

    await act(async () => {
      resolveAutoDetail(hydratedSourceB);
      await autoSwitchPromise;
    });

    // 被作废的自动换源不得提交任何状态
    expect(params.setCurrentSource).not.toHaveBeenCalledWith('source-b');
    expect(params.setDetail).not.toHaveBeenCalledWith(hydratedSourceB);

    await act(async () => {
      await manualSwitchPromise;
    });

    expect(params.setCurrentSource).toHaveBeenCalledWith('source-c');
    expect(params.setCurrentId).toHaveBeenCalledWith('id-c');
    expect(params.setDetail).toHaveBeenCalledWith(sourceC);
    expect(params.isSourceChangingRef.current).toBe(true);
    expect(params.sourceChangeOwnerRef.current).toEqual({
      by: 'user',
      source: 'source-c',
      id: 'id-c',
    });
  });

  test('does not render a source-switch result after danmaku is disabled', async () => {
    jest.useFakeTimers();
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', { douban_id: 2 });
    const pendingDanmaku = createDeferred<never[]>();
    const params = createParams([sourceA, sourceB]);
    const plugin = {
      reset: jest.fn(),
      load: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
    };
    const art = {
      plugins: { artplayerPluginDanmuku: plugin },
      notice: { show: '' },
    };
    params.artPlayerRef.current = art;
    params.externalDanmuEnabledRef.current = true;
    params.loadExternalDanmu = jest.fn(() => pendingDanmaku.promise);

    const { result } = renderHook(() => useSourceSwitcher(params));

    await act(async () => {
      await result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });

    plugin.reset.mockClear();
    plugin.load.mockClear();
    plugin.show.mockClear();
    plugin.hide.mockClear();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(params.loadExternalDanmu).toHaveBeenCalledTimes(1);

    params.externalDanmuEnabledRef.current = false;
    await act(async () => {
      pendingDanmaku.resolve([]);
      await pendingDanmaku.promise;
    });

    expect(plugin.reset).not.toHaveBeenCalled();
    expect(plugin.load).not.toHaveBeenCalled();
    expect(plugin.show).not.toHaveBeenCalled();
    expect(plugin.hide).not.toHaveBeenCalled();
    expect(art.notice.show).toBe('');
  });

  test('skips deferred danmaku load if player instance was rebuilt during switch', async () => {
    jest.useFakeTimers();
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', { douban_id: 2 });
    const params = createParams([sourceA, sourceB]);
    const oldArt = {
      plugins: {
        artplayerPluginDanmuku: { reset: jest.fn(), load: jest.fn() },
      },
      notice: { show: '' },
    };
    const rebuiltArt = {
      plugins: {
        artplayerPluginDanmuku: { reset: jest.fn(), load: jest.fn() },
      },
      notice: { show: '' },
    };
    params.artPlayerRef.current = oldArt;
    params.externalDanmuEnabledRef.current = true;
    params.loadExternalDanmu = jest.fn().mockResolvedValue([]);

    const { result } = renderHook(() => useSourceSwitcher(params));

    await act(async () => {
      await result.current.handleSourceChange(
        'source-b',
        'id-b',
        'fallback title',
      );
    });

    params.artPlayerRef.current = rebuiltArt;
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(params.loadExternalDanmu).not.toHaveBeenCalled();
  });

  test('an existing failover callback reads the latest episode index after episode changes', async () => {
    const sourceA = createSource('source-a', 'id-a', {
      douban_id: 1,
      episodes: ['ep1', 'ep2', 'ep3'],
    });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: 2,
      episodes: ['b-ep1', 'b-ep2', 'b-ep3'],
    });
    const params = createParams([sourceA, sourceB]);

    const { result, rerender } = renderHook(
      ({ episodeIndex }) =>
        useSourceSwitcher({
          ...params,
          currentEpisodeIndex: episodeIndex,
        }),
      { initialProps: { episodeIndex: 0 } },
    );
    const initialFailoverCallback = result.current.handleSourceChange;

    rerender({ episodeIndex: 2 });

    await act(async () => {
      await initialFailoverCallback('source-b', 'id-b', 'fallback title', {
        initiatedBy: 'auto',
      });
    });

    expect(params.setCurrentEpisodeIndex).toHaveBeenCalledWith(2);
  });

  test('exposes switchingSourceKey immediately and ignores duplicate clicks on the same in-flight target', async () => {
    const deferred = createDeferred<SearchResult>();
    const sourceA = createSource('source-a', 'id-a', { douban_id: 1 });
    const sourceB = createSource('source-b', 'id-b', {
      douban_id: undefined,
    });
    const hydratedB = createSource('source-b', 'id-b', { douban_id: 99 });
    const params = createParams([sourceA, sourceB]);
    (cachedGet as jest.Mock).mockReset();
    (cachedGet as jest.Mock).mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useSourceSwitcher(params));

    let firstSwitch: Promise<void> | void;
    act(() => {
      firstSwitch = result.current.handleSourceChange(
        'source-b',
        'id-b',
        'source-b title',
      );
    });

    expect(result.current.switchingSourceKey).toBe('source-b-id-b');

    // 用户连续重复点击同一个切换中的源：应直接忽略，不重启详情请求
    await act(async () => {
      await result.current.handleSourceChange(
        'source-b',
        'id-b',
        'source-b title',
      );
    });

    expect(cachedGet).toHaveBeenCalledTimes(1);
    expect(result.current.switchingSourceKey).toBe('source-b-id-b');

    await act(async () => {
      deferred.resolve(hydratedB);
      await firstSwitch;
    });

    expect(result.current.switchingSourceKey).toBeNull();
    expect(params.setCurrentSource).toHaveBeenCalledWith('source-b');
    expect(params.setCurrentId).toHaveBeenCalledWith('id-b');
  });
});
