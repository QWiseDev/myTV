import { renderHook } from '@testing-library/react';

import type { PlayRecord } from '@/lib/types';

import {
  shouldRestorePlayRecordTime,
  usePlayRecordSync,
} from './usePlayRecordSync';
import type { ArtPlayerLike } from '../utils/danmakuRuntime';

describe('shouldRestorePlayRecordTime', () => {
  test('restores same episode progress during initial episode bootstrap', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 120,
        isRestoringFromRecord: false,
        isEpisodeChanging: true,
        isSourceChanging: false,
        isSameEpisodeRecord: true,
      }),
    ).toBe(true);
  });

  test('keeps explicit record restoration behavior while source is switching', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 120,
        isRestoringFromRecord: true,
        isEpisodeChanging: false,
        isSourceChanging: true,
        isSameEpisodeRecord: true,
      }),
    ).toBe(true);
  });

  test('does not restore same-episode progress during normal source switching', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 120,
        isRestoringFromRecord: false,
        isEpisodeChanging: false,
        isSourceChanging: true,
        isSameEpisodeRecord: true,
      }),
    ).toBe(false);
  });

  test('ignores empty or invalid progress', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 0,
        isRestoringFromRecord: true,
        isEpisodeChanging: false,
        isSourceChanging: false,
        isSameEpisodeRecord: true,
      }),
    ).toBe(false);
  });
});

describe('usePlayRecordSync cross-episode restoration', () => {
  test('preserves resumeTimeRef and avoids seeking the old episode when restoring a different episode', () => {
    const videoEl = document.createElement('video');
    Object.defineProperty(videoEl, 'readyState', {
      configurable: true,
      value: 4,
    });
    const player = {
      currentTime: 5,
      duration: 2400,
      video: videoEl,
      $video: videoEl,
    } as unknown as ArtPlayerLike;
    const setCurrentEpisodeIndex = jest.fn();
    const resumeTimeRef = { current: null as number | null };
    const isRestoringFromRecordRef = { current: false };
    const record: PlayRecord = {
      title: '测试剧集',
      source_name: '测试源',
      cover: '',
      year: '2026',
      index: 5,
      total_episodes: 10,
      play_time: 900,
      total_time: 2400,
      save_time: Date.now(),
      search_title: '测试剧集',
    };

    renderHook(() =>
      usePlayRecordSync({
        currentSource: 'src-a',
        currentId: 'id-1',
        totalEpisodes: 10,
        playRecords: { 'src-a+id-1': record },
        currentEpisodeIndexRef: { current: 0 },
        isEpisodeChangingRef: { current: false },
        isSourceChangingRef: { current: false },
        setCurrentEpisodeIndex,
        resumeTimeRef,
        playRecordKeyRef: { current: null },
        playRecordAppliedRef: { current: false },
        artPlayerRef: { current: player },
        isRestoringFromRecordRef,
      }),
    );

    expect(setCurrentEpisodeIndex).toHaveBeenCalledWith(4);
    expect(resumeTimeRef.current).toBe(900);
    expect(isRestoringFromRecordRef.current).toBe(true);
    expect(player.currentTime).toBe(5);
  });
});
