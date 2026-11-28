import { act, renderHook, waitFor } from '@testing-library/react';

import { ClientCache } from '@/lib/client-cache';

import { useDanmuController } from './useDanmuController';
import { getDanmuCacheItem, setDanmuCacheItem } from '../utils/danmuCache';

jest.mock('../utils/danmuCache', () => ({
  DANMU_CACHE_DURATION_SECONDS: 1800,
  getDanmuCacheItem: jest.fn(),
  setDanmuCacheItem: jest.fn(),
}));

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useDanmuController', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    ClientCache.clearMemory();
    (getDanmuCacheItem as jest.Mock).mockResolvedValue(null);
    (setDanmuCacheItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('propagates cancellation and keeps the newer request loading state', async () => {
    const pendingResponses: Array<{
      resolve: (response: Response) => void;
      signal?: AbortSignal;
    }> = [];
    global.fetch = jest.fn((url: RequestInfo | URL, options?: RequestInit) => {
      // 共享弹幕选择的读取请求立即返回空，测试只跟踪弹幕本体请求
      if (String(url).includes('/api/cache')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: null }),
        } as Response);
      }
      return new Promise<Response>((resolve) => {
        pendingResponses.push({
          resolve,
          signal: options?.signal as AbortSignal | undefined,
        });
      });
    }) as typeof fetch;

    const currentEpisodeIndexRef = { current: 0 };
    const danmuLoadingRef = { current: false };
    const { result } = renderHook(() =>
      useDanmuController({
        artPlayerRef: { current: null },
        danmuOperationTimeoutRef: { current: null },
        externalDanmuEnabledRef: { current: true },
        setExternalDanmuEnabled: jest.fn(),
        videoTitleRef: { current: '测试剧' },
        videoYearRef: { current: '2026' },
        videoDoubanIdRef: { current: 123 },
        videoUrlRef: { current: 'https://example.com/episode.m3u8' },
        currentEpisodeIndexRef,
        danmuLoadingRef,
        lastDanmuLoadKeyRef: { current: '' },
        currentSourceRef: { current: 'source-a' },
        danmuEpisodeOffsetRef: { current: 0 },
        episodeTitleRef: { current: '' },
        variantEpisodeRef: { current: 0 },
      }),
    );

    let firstResult!: Promise<unknown>;
    act(() => {
      firstResult = result.current.loadExternalDanmu().catch((error) => error);
    });
    await waitFor(() => expect(pendingResponses).toHaveLength(1));

    currentEpisodeIndexRef.current = 1;
    let secondResult!: Promise<unknown>;
    act(() => {
      secondResult = result.current.loadExternalDanmu();
    });
    await waitFor(() => expect(pendingResponses).toHaveLength(2));

    expect(pendingResponses[0].signal?.aborted).toBe(true);
    pendingResponses[0].resolve({
      ok: true,
      json: async () => ({ danmu: [{ text: '旧弹幕' }] }),
    } as Response);

    await expect(firstResult).resolves.toMatchObject({ name: 'AbortError' });
    expect(danmuLoadingRef.current).toBe(true);

    pendingResponses[1].resolve({
      ok: true,
      json: async () => ({ danmu: [{ text: '新弹幕' }] }),
    } as Response);

    await expect(secondResult).resolves.toEqual([{ text: '新弹幕' }]);
    expect(danmuLoadingRef.current).toBe(false);
  });

  test('rejects a result when the media identity changes before it returns', async () => {
    const cacheWrite = createDeferred<void>();
    (setDanmuCacheItem as jest.Mock).mockReturnValueOnce(cacheWrite.promise);
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/cache')) {
        return { ok: true, json: async () => ({ data: null }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ danmu: [{ text: '旧集弹幕' }] }),
      } as Response;
    }) as typeof fetch;

    const currentEpisodeIndexRef = { current: 0 };
    const { result } = renderHook(() =>
      useDanmuController({
        artPlayerRef: { current: null },
        danmuOperationTimeoutRef: { current: null },
        externalDanmuEnabledRef: { current: true },
        setExternalDanmuEnabled: jest.fn(),
        videoTitleRef: { current: '测试剧' },
        videoYearRef: { current: '2026' },
        videoDoubanIdRef: { current: 123 },
        videoUrlRef: { current: 'https://example.com/episode.m3u8' },
        currentEpisodeIndexRef,
        danmuLoadingRef: { current: false },
        lastDanmuLoadKeyRef: { current: '' },
        currentSourceRef: { current: 'source-a' },
        danmuEpisodeOffsetRef: { current: 0 },
        episodeTitleRef: { current: '' },
        variantEpisodeRef: { current: 0 },
      }),
    );

    let loadPromise!: Promise<unknown>;
    act(() => {
      loadPromise = result.current.loadExternalDanmu();
    });
    await waitFor(() => expect(setDanmuCacheItem).toHaveBeenCalledTimes(1));

    currentEpisodeIndexRef.current = 1;
    cacheWrite.resolve(undefined);

    await expect(loadPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('does not render an enable result after the user disables danmaku', async () => {
    jest.useFakeTimers();
    const cacheWrite = createDeferred<void>();
    (setDanmuCacheItem as jest.Mock).mockReturnValueOnce(cacheWrite.promise);
    const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/cache')) {
        return { ok: true, json: async () => ({ data: null }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ danmu: [{ text: '迟到弹幕' }] }),
      } as Response;
    }) as unknown as jest.Mock;
    global.fetch = fetchMock as unknown as typeof fetch;

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
    const artPlayerRef = { current: art };
    const externalDanmuEnabledRef = { current: false };
    const danmuOperationTimeoutRef = { current: null };
    const { result } = renderHook(() =>
      useDanmuController({
        artPlayerRef,
        danmuOperationTimeoutRef,
        externalDanmuEnabledRef,
        setExternalDanmuEnabled: jest.fn(),
        videoTitleRef: { current: '测试剧' },
        videoYearRef: { current: '2026' },
        videoDoubanIdRef: { current: 123 },
        videoUrlRef: { current: 'https://example.com/episode.m3u8' },
        currentEpisodeIndexRef: { current: 0 },
        danmuLoadingRef: { current: false },
        lastDanmuLoadKeyRef: { current: '' },
        currentSourceRef: { current: 'source-a' },
        danmuEpisodeOffsetRef: { current: 0 },
        episodeTitleRef: { current: '' },
        variantEpisodeRef: { current: 0 },
      }),
    );

    await act(async () => {
      result.current.handleDanmuOperationOptimized(true);
      jest.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    const danmuFetchCount = fetchMock.mock.calls.filter(
      (call) => !String(call[0]).includes('/api/cache'),
    ).length;
    expect(danmuFetchCount).toBe(1);
    expect(setDanmuCacheItem).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleDanmuOperationOptimized(false);
    });

    await act(async () => {
      cacheWrite.resolve(undefined);
      await cacheWrite.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(plugin.reset).not.toHaveBeenCalled();
    expect(plugin.load).not.toHaveBeenCalled();
    expect(plugin.show).not.toHaveBeenCalled();
    expect(art.notice.show).toBe('');

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(plugin.reset).toHaveBeenCalledTimes(1);
    expect(plugin.load).toHaveBeenCalledTimes(1);
    expect(plugin.hide).toHaveBeenCalledTimes(1);
    expect(art.notice.show).toBe('外部弹幕已关闭');
  });

  test('本地没有选择时采用其他用户的共享选择作为默认弹幕', async () => {
    const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('/api/cache')) {
        return {
          ok: true,
          json: async () => ({
            data: { episodeId: 'shared-1', title: '共享' },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ danmu: [{ text: '共享弹幕' }] }),
      } as Response;
    }) as unknown as jest.Mock;
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useDanmuController({
        artPlayerRef: { current: null },
        danmuOperationTimeoutRef: { current: null },
        externalDanmuEnabledRef: { current: true },
        setExternalDanmuEnabled: jest.fn(),
        videoTitleRef: { current: '测试剧' },
        videoYearRef: { current: '2026' },
        videoDoubanIdRef: { current: 123 },
        videoUrlRef: { current: 'https://example.com/episode.m3u8' },
        currentEpisodeIndexRef: { current: 0 },
        danmuLoadingRef: { current: false },
        lastDanmuLoadKeyRef: { current: '' },
        currentSourceRef: { current: 'source-a' },
        danmuEpisodeOffsetRef: { current: 0 },
        episodeTitleRef: { current: '' },
        variantEpisodeRef: { current: 0 },
      }),
    );

    await expect(result.current.loadExternalDanmu()).resolves.toEqual([
      { text: '共享弹幕' },
    ]);
    const danmuUrl = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => !url.includes('/api/cache'));
    // 命中手动选择时走 danmu_api 的 comment 接口
    expect(danmuUrl).toContain('action=comment&id=shared-1');
  });

  test('本地手动选择优先于共享选择，不再读取共享记录', async () => {
    const media = JSON.stringify(['测试剧', '2026', 123]);
    localStorage.setItem(
      'player_danmaku_selections_v1',
      JSON.stringify({
        [JSON.stringify([media, 0])]: { episodeId: 'local-1', title: '本地' },
      }),
    );
    const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/cache')) {
        return {
          ok: true,
          json: async () => ({
            data: { episodeId: 'shared-1', title: '共享' },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ danmu: [{ text: '本地弹幕' }] }),
      } as Response;
    }) as unknown as jest.Mock;
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useDanmuController({
        artPlayerRef: { current: null },
        danmuOperationTimeoutRef: { current: null },
        externalDanmuEnabledRef: { current: true },
        setExternalDanmuEnabled: jest.fn(),
        videoTitleRef: { current: '测试剧' },
        videoYearRef: { current: '2026' },
        videoDoubanIdRef: { current: 123 },
        videoUrlRef: { current: 'https://example.com/episode.m3u8' },
        currentEpisodeIndexRef: { current: 0 },
        danmuLoadingRef: { current: false },
        lastDanmuLoadKeyRef: { current: '' },
        currentSourceRef: { current: 'source-a' },
        danmuEpisodeOffsetRef: { current: 0 },
        episodeTitleRef: { current: '' },
        variantEpisodeRef: { current: 0 },
      }),
    );

    await expect(result.current.loadExternalDanmu()).resolves.toEqual([
      { text: '本地弹幕' },
    ]);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('/api/cache'),
      ),
    ).toBe(false);
    const danmuUrl = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => !url.includes('/api/cache'));
    expect(danmuUrl).toContain('action=comment&id=local-1');
  });

  test('游客模式下跳过服务端共享选择，并同步 Artplayer 设置面板状态', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ danmu: [{ text: '直取弹幕' }] }),
    })) as unknown as jest.Mock;
    global.fetch = fetchMock as unknown as typeof fetch;

    const settingUpdate = jest.fn();
    const artPlayerRef = {
      current: {
        setting: { update: settingUpdate },
      },
    };

    const { result } = renderHook(() =>
      useDanmuController({
        artPlayerRef: artPlayerRef as never,
        danmuOperationTimeoutRef: { current: null },
        externalDanmuEnabledRef: { current: true },
        setExternalDanmuEnabled: jest.fn(),
        videoTitleRef: { current: '测试剧' },
        videoYearRef: { current: '2026' },
        videoDoubanIdRef: { current: 123 },
        videoUrlRef: { current: 'https://example.com/episode.m3u8' },
        currentEpisodeIndexRef: { current: 0 },
        danmuLoadingRef: { current: false },
        lastDanmuLoadKeyRef: { current: '' },
        currentSourceRef: { current: 'source-a' },
        episodeTitleRef: { current: '' },
        variantEpisodeRef: { current: 0 },
        canUseSharedCacheRef: { current: false },
      }),
    );

    await expect(result.current.loadExternalDanmu()).resolves.toEqual([
      { text: '直取弹幕' },
    ]);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('/api/cache'),
      ),
    ).toBe(false);

    act(() => {
      result.current.handleDanmuOperationOptimized(false);
    });
    expect(settingUpdate).toHaveBeenCalledWith({
      name: 'external-danmu',
      tooltip: '已关闭',
    });

    act(() => {
      result.current.handleDanmuOperationOptimized(true);
    });
    expect(settingUpdate).toHaveBeenCalledWith({
      name: 'external-danmu',
      tooltip: '已开启',
    });
  });

  test('aborts in-flight external danmaku request immediately on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    global.fetch = jest.fn(
      (_url: RequestInfo | URL, options?: RequestInit) =>
        new Promise<Response>(() => {
          capturedSignal = options?.signal as AbortSignal | undefined;
        }),
    ) as typeof fetch;

    const { result, unmount } = renderHook(() =>
      useDanmuController({
        artPlayerRef: { current: null },
        danmuOperationTimeoutRef: { current: null },
        externalDanmuEnabledRef: { current: true },
        setExternalDanmuEnabled: jest.fn(),
        videoTitleRef: { current: '测试剧' },
        videoYearRef: { current: '2026' },
        videoDoubanIdRef: { current: 123 },
        videoUrlRef: { current: 'https://example.com/episode.m3u8' },
        currentEpisodeIndexRef: { current: 0 },
        danmuLoadingRef: { current: false },
        lastDanmuLoadKeyRef: { current: '' },
        currentSourceRef: { current: 'source-a' },
        episodeTitleRef: { current: '' },
        variantEpisodeRef: { current: 0 },
        canUseSharedCacheRef: { current: false },
      }),
    );

    act(() => {
      void result.current.loadExternalDanmu().catch(() => undefined);
    });
    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
