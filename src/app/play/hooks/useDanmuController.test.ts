import { act, renderHook, waitFor } from '@testing-library/react';

import { useDanmuController } from './useDanmuController';
import { getDanmuCacheItem, setDanmuCacheItem } from '../utils/danmuCache';

jest.mock('../utils/danmuCache', () => ({
  DANMU_CACHE_DURATION_SECONDS: 1800,
  getDanmuCacheItem: jest.fn(),
  setDanmuCacheItem: jest.fn(),
}));

describe('useDanmuController', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    (getDanmuCacheItem as jest.Mock).mockResolvedValue(null);
    (setDanmuCacheItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
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
});
