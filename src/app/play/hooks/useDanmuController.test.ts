import { act, renderHook, waitFor } from '@testing-library/react';

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
    global.fetch = jest.fn(
      (_url: RequestInfo | URL, options?: RequestInit) =>
        new Promise<Response>((resolve) => {
          pendingResponses.push({
            resolve,
            signal: options?.signal as AbortSignal | undefined,
          });
        }),
    ) as typeof fetch;

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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ danmu: [{ text: '旧集弹幕' }] }),
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ danmu: [{ text: '迟到弹幕' }] }),
    }) as typeof fetch;

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
      }),
    );

    await act(async () => {
      result.current.handleDanmuOperationOptimized(true);
      jest.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
});
