import { act, renderHook } from '@testing-library/react';

import { useEpisodeControls } from './useEpisodeControls';
import type { ArtPlayerLike } from '../utils/danmakuRuntime';

function createDetail() {
  return {
    id: 'id',
    title: 'title',
    poster: '',
    episodes: ['episode-1', 'episode-2'],
    episodes_titles: [],
    source: 'source',
    source_name: 'Source',
    year: '2024',
  };
}

describe('useEpisodeControls', () => {
  test('saves progress before switching to next episode while playing', () => {
    const saveCurrentPlayProgress = jest.fn();
    const setCurrentEpisodeIndex = jest.fn();
    const isSkipControllerTriggeredRef = { current: false };

    const { result } = renderHook(() =>
      useEpisodeControls({
        totalEpisodes: 2,
        artPlayerRef: {
          current: { paused: false } as ArtPlayerLike,
        },
        saveCurrentPlayProgress,
        setCurrentEpisodeIndex,
        detailRef: { current: createDetail() },
        currentEpisodeIndexRef: { current: 0 },
        isSkipControllerTriggeredRef,
      }),
    );

    act(() => {
      result.current.handleNextEpisode();
    });

    expect(saveCurrentPlayProgress).toHaveBeenCalledTimes(1);
    expect(isSkipControllerTriggeredRef.current).toBe(true);
    expect(setCurrentEpisodeIndex).toHaveBeenCalledWith(1);
  });
});
