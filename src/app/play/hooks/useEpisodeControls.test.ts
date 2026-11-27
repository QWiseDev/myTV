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

  test('clamps keyboard volume shortcuts within [0, 1]', () => {
    const player = {
      paused: false,
      volume: 0.95,
      notice: { show: '' },
    } as ArtPlayerLike;

    renderHook(() =>
      useEpisodeControls({
        totalEpisodes: 2,
        artPlayerRef: { current: player },
        saveCurrentPlayProgress: jest.fn(),
        setCurrentEpisodeIndex: jest.fn(),
        detailRef: { current: createDetail() },
        currentEpisodeIndexRef: { current: 0 },
        isSkipControllerTriggeredRef: { current: false },
      }),
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    });
    expect(player.volume).toBe(1);

    player.volume = 0.04;
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      );
    });
    expect(player.volume).toBe(0);
  });
});
