import { act, renderHook } from '@testing-library/react';

import { useEpisodeDanmuSync } from './useEpisodeDanmuSync';
import type { DanmakuItemLike } from '../utils/danmakuRuntime';

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createParams(
  loadExternalDanmu: () => Promise<DanmakuItemLike[]>,
  enabled = true,
) {
  const plugin = {
    reset: jest.fn(),
    load: jest.fn(),
    show: jest.fn(),
  };
  const art = {
    notice: { show: '' },
    plugins: { artplayerPluginDanmuku: plugin },
  };
  const params = {
    detail: {
      id: 'id',
      title: 'title',
      poster: '',
      episodes: ['episode-1', 'episode-2'],
      episodes_titles: [],
      source: 'source',
      source_name: 'source',
      year: '2025',
    },
    currentEpisodeIndex: 0,
    updateVideoUrl: jest.fn(),
    isSourceChangingRef: { current: false },
    isEpisodeChangingRef: { current: false },
    isSkipControllerTriggeredRef: { current: false },
    videoEndedHandledRef: { current: false },
    lastDanmuLoadKeyRef: { current: '' },
    danmuLoadingRef: { current: false },
    episodeSwitchTimeoutRef: { current: null },
    artPlayerRef: { current: art },
    danmuPluginStateRef: { current: null },
    externalDanmuEnabledRef: { current: enabled },
    loadExternalDanmu,
  } as Parameters<typeof useEpisodeDanmuSync>[0];

  return { params, plugin };
}

describe('useEpisodeDanmuSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('does not render danmaku returned for a previous episode', async () => {
    const oldRequest = createDeferred<DanmakuItemLike[]>();
    const currentRequest = createDeferred<DanmakuItemLike[]>();
    const loadExternalDanmu = jest
      .fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);
    const { params, plugin } = createParams(loadExternalDanmu);

    const { rerender } = renderHook(
      ({ episodeIndex }) =>
        useEpisodeDanmuSync({
          ...params,
          currentEpisodeIndex: episodeIndex,
        }),
      { initialProps: { episodeIndex: 0 } },
    );

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(loadExternalDanmu).toHaveBeenCalledTimes(1);

    rerender({ episodeIndex: 1 });
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(loadExternalDanmu).toHaveBeenCalledTimes(2);

    await act(async () => {
      oldRequest.resolve([{ text: 'old episode' }]);
      await oldRequest.promise;
    });
    expect(plugin.load).not.toHaveBeenCalledWith([{ text: 'old episode' }]);

    await act(async () => {
      currentRequest.resolve([{ text: 'current episode' }]);
      await currentRequest.promise;
    });
    expect(plugin.load).toHaveBeenCalledWith([{ text: 'current episode' }]);
  });

  test('does not schedule a danmaku reload when it is disabled', () => {
    const loadExternalDanmu = jest.fn().mockResolvedValue([]);
    const { params, plugin } = createParams(loadExternalDanmu, false);

    renderHook(() => useEpisodeDanmuSync(params));

    expect(params.updateVideoUrl).toHaveBeenCalledTimes(1);
    expect(params.episodeSwitchTimeoutRef.current).toBeNull();
    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(loadExternalDanmu).not.toHaveBeenCalled();
    expect(plugin.reset).not.toHaveBeenCalled();
    expect(plugin.load).not.toHaveBeenCalled();
    expect(plugin.show).not.toHaveBeenCalled();
  });

  test('does not render an episode result after danmaku is disabled', async () => {
    const pendingDanmaku = createDeferred<DanmakuItemLike[]>();
    const loadExternalDanmu = jest.fn(() => pendingDanmaku.promise);
    const { params, plugin } = createParams(loadExternalDanmu);

    renderHook(() => useEpisodeDanmuSync(params));
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(loadExternalDanmu).toHaveBeenCalledTimes(1);

    plugin.reset.mockClear();
    plugin.load.mockClear();
    plugin.show.mockClear();
    params.externalDanmuEnabledRef.current = false;

    await act(async () => {
      pendingDanmaku.resolve([{ text: 'late episode' }]);
      await pendingDanmaku.promise;
    });

    expect(plugin.reset).not.toHaveBeenCalled();
    expect(plugin.load).not.toHaveBeenCalled();
    expect(plugin.show).not.toHaveBeenCalled();
  });
});
