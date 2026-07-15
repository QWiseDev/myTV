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
    const load = jest.fn();
    const art = {
      notice: { show: '' },
      plugins: {
        artplayerPluginDanmuku: {
          reset: jest.fn(),
          load,
          show: jest.fn(),
        },
      },
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
      loadExternalDanmu,
    } as Parameters<typeof useEpisodeDanmuSync>[0];

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
    expect(load).not.toHaveBeenCalledWith([{ text: 'old episode' }]);

    await act(async () => {
      currentRequest.resolve([{ text: 'current episode' }]);
      await currentRequest.promise;
    });
    expect(load).toHaveBeenCalledWith([{ text: 'current episode' }]);
  });
});
