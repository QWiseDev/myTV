import { waitFor } from '@testing-library/react';

import {
  clearDanmakuDisplay,
  createDanmakuRequest,
  DanmakuLoadManager,
  recoverStoppedDanmaku,
  renderDanmakuList,
  resetDanmakuTimeline,
} from './danmakuRuntime';
import { getDanmuCacheItem, setDanmuCacheItem } from './danmuCache';

jest.mock('./danmuCache', () => ({
  DANMU_CACHE_DURATION_SECONDS: 1800,
  getDanmuCacheItem: jest.fn(),
  setDanmuCacheItem: jest.fn(),
}));

describe('danmakuRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: jest.fn(),
    });
  });

  test('builds a stable request key from current episode and offset', () => {
    const request = createDanmakuRequest({
      enabled: true,
      videoTitle: '测试剧',
      videoYear: '2024',
      videoDoubanId: 123,
      episodeIndex: 1,
      episodeOffset: -1,
      source: 'source-a',
    });

    expect(request?.key).toBe('测试剧_2024_123_1');
    expect(request?.params.toString()).toBe(
      'douban_id=123&title=%E6%B5%8B%E8%AF%95%E5%89%A7&year=2024&episode=1',
    );
  });

  test('does not create a request when external danmaku is disabled', () => {
    const request = createDanmakuRequest({
      enabled: false,
      videoTitle: '测试剧',
      videoYear: '2024',
      videoDoubanId: 123,
      episodeIndex: 0,
      episodeOffset: 0,
    });

    expect(request).toBeNull();
  });

  test('returns fresh cached danmaku without fetching', async () => {
    (getDanmuCacheItem as jest.Mock).mockResolvedValue({
      data: [{ text: 'cached', time: 1 }],
      timestamp: 9000,
    });

    const manager = new DanmakuLoadManager(() => 10000);
    const danmaku = await manager.load({
      enabled: true,
      videoTitle: '测试剧',
      videoYear: '2024',
      videoDoubanId: 123,
      episodeIndex: 0,
      episodeOffset: 0,
    });

    expect(danmaku).toEqual([{ text: 'cached', time: 1 }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('dedupes repeated loads for the same active request', async () => {
    (getDanmuCacheItem as jest.Mock).mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ danmu: [{ text: 'fresh', time: 2 }] }),
    });

    const manager = new DanmakuLoadManager(() => 10000);
    const input = {
      enabled: true,
      videoTitle: '测试剧',
      videoYear: '2024',
      videoDoubanId: 123,
      episodeIndex: 0,
      episodeOffset: 0,
    };

    const [first, second] = await Promise.all([
      manager.load(input),
      manager.load(input),
    ]);

    expect(first).toEqual([{ text: 'fresh', time: 2 }]);
    expect(second).toEqual([{ text: 'fresh', time: 2 }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(setDanmuCacheItem).toHaveBeenCalledWith('测试剧_2024_123_1', [
      { text: 'fresh', time: 2 },
    ]);
  });

  test('passes an abort signal to external danmaku fetches', async () => {
    (getDanmuCacheItem as jest.Mock).mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ danmu: [] }),
    });

    const manager = new DanmakuLoadManager(() => 10000);
    await manager.load({
      enabled: true,
      videoTitle: '测试剧',
      videoYear: '2024',
      videoDoubanId: 123,
      episodeIndex: 0,
      episodeOffset: 0,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/danmu-external?douban_id=123&title=%E6%B5%8B%E8%AF%95%E5%89%A7&year=2024&episode=1',
      { signal: expect.any(AbortSignal) },
    );
  });

  test('aborts the previous request when a new request key starts', async () => {
    (getDanmuCacheItem as jest.Mock).mockResolvedValue(null);
    const pendingResponses: Array<{
      resolve: (response: Response) => void;
      signal?: AbortSignal;
    }> = [];
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise<Response>((resolve) => {
          pendingResponses.push({ resolve, signal: options?.signal });
        }),
    );

    const manager = new DanmakuLoadManager(() => 10000);
    const firstResult = manager
      .load({
        enabled: true,
        videoTitle: '测试剧',
        episodeIndex: 0,
        episodeOffset: 0,
      })
      .catch((error) => error);
    await waitFor(() => {
      expect(pendingResponses).toHaveLength(1);
    });

    const secondResult = manager.load({
      enabled: true,
      videoTitle: '测试剧',
      episodeIndex: 1,
      episodeOffset: 0,
    });
    await waitFor(() => {
      expect(pendingResponses).toHaveLength(2);
    });

    expect(pendingResponses[0].signal?.aborted).toBe(true);
    pendingResponses[0].resolve({
      ok: true,
      json: async () => ({ danmu: [{ text: 'old' }] }),
    } as Response);
    pendingResponses[1].resolve({
      ok: true,
      json: async () => ({ danmu: [{ text: 'current' }] }),
    } as Response);

    await expect(firstResult).resolves.toMatchObject({ name: 'AbortError' });
    await expect(secondResult).resolves.toEqual([{ text: 'current' }]);
  });

  test('reset aborts the active request', async () => {
    (getDanmuCacheItem as jest.Mock).mockResolvedValue(null);
    let resolveResponse: (response: Response) => void = () => undefined;
    let requestSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise<Response>((resolve) => {
          requestSignal = options?.signal;
          resolveResponse = resolve;
        }),
    );

    const manager = new DanmakuLoadManager(() => 10000);
    const result = manager
      .load({
        enabled: true,
        videoTitle: '测试剧',
        episodeIndex: 0,
        episodeOffset: 0,
      })
      .catch((error) => error);
    await waitFor(() => {
      expect(requestSignal).toBeDefined();
    });

    manager.reset();
    expect(requestSignal?.aborted).toBe(true);

    resolveResponse({
      ok: true,
      json: async () => ({ danmu: [] }),
    } as Response);
    await expect(result).resolves.toMatchObject({ name: 'AbortError' });
  });

  test('clears and hides the plugin through one runtime path', () => {
    const reset = jest.fn();
    const load = jest.fn();
    const hide = jest.fn();
    const art = {
      plugins: {
        artplayerPluginDanmuku: {
          reset,
          load,
          hide,
        },
      },
    };

    clearDanmakuDisplay(art, { hide: true });

    expect(reset).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith();
    expect(hide).toHaveBeenCalledTimes(1);
  });

  test('renders danmaku and preserves an explicitly hidden plugin', () => {
    const reset = jest.fn();
    const load = jest.fn();
    const show = jest.fn();
    const art = {
      notice: { show: '' },
      plugins: {
        artplayerPluginDanmuku: {
          isHide: true,
          reset,
          load,
          show,
        },
      },
    };

    renderDanmakuList(art, [{ text: 'hello', time: 3 }], {
      preserveHidden: true,
      showNotice: true,
    });

    expect(reset).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith([{ text: 'hello', time: 3 }]);
    expect(show).not.toHaveBeenCalled();
    expect(art.notice.show).toBe('已加载 1 条弹幕');
  });

  test('resets visible danmaku timeline after seek', () => {
    const reset = jest.fn();
    const emit = jest.fn();
    const art = {
      playing: true,
      emit,
      plugins: {
        artplayerPluginDanmuku: {
          isHide: false,
          reset,
        },
      },
    };

    resetDanmakuTimeline(art);

    expect(reset).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('video:playing');
  });

  test('does not reset hidden danmaku', () => {
    const reset = jest.fn();
    const emit = jest.fn();
    const art = {
      playing: true,
      emit,
      plugins: {
        artplayerPluginDanmuku: {
          isHide: true,
          reset,
        },
      },
    };

    resetDanmakuTimeline(art);

    expect(reset).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  test('recovers a stopped plugin only while video is playing', () => {
    const emit = jest.fn();
    const art = {
      playing: true,
      emit,
      plugins: {
        artplayerPluginDanmuku: {
          isHide: false,
          isStop: true,
        },
      },
    };

    const recoveredAt = recoverStoppedDanmaku(art, 2000, 0);

    expect(recoveredAt).toBe(2000);
    expect(emit).toHaveBeenCalledWith('video:playing');
  });

  test('throttles repeated recovery attempts', () => {
    const emit = jest.fn();
    const art = {
      playing: true,
      emit,
      plugins: {
        artplayerPluginDanmuku: {
          isHide: false,
          isStop: true,
        },
      },
    };

    const recoveredAt = recoverStoppedDanmaku(art, 2500, 2000);

    expect(recoveredAt).toBe(2000);
    expect(emit).not.toHaveBeenCalled();
  });
});
