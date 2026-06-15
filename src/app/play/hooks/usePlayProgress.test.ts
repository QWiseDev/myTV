import { act, renderHook } from '@testing-library/react';

import { savePlayRecord } from '@/lib/db.client';

import { usePlayProgress } from './usePlayProgress';
import type { ArtPlayerLike } from '../utils/danmakuRuntime';

jest.mock('@/lib/db.client', () => ({
  generateStorageKey: (source: string, id: string) => `${source}+${id}`,
  savePlayRecord: jest.fn(),
}));

function createDetail() {
  return {
    id: 'id',
    title: 'Title',
    poster: 'poster.jpg',
    episodes: ['episode-1', 'episode-2'],
    episodes_titles: [],
    source: 'source',
    source_name: 'Source',
    year: '2024',
  };
}

describe('usePlayProgress', () => {
  afterEach(() => {
    jest.clearAllMocks();
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  test('uses sendBeacon instead of async save during beforeunload', () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    const releaseWakeLock = jest.fn();
    const cleanupPlayer = jest.fn();

    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    renderHook(() =>
      usePlayProgress({
        artPlayerRef: {
          current: {
            currentTime: 75,
            duration: 1200,
          } as ArtPlayerLike,
        },
        currentSourceRef: { current: 'source' },
        currentIdRef: { current: 'id' },
        videoTitleRef: { current: 'Title' },
        videoDoubanIdRef: { current: 123 },
        detailRef: { current: createDetail() },
        playRecords: null,
        availableSourcesRef: { current: [createDetail()] },
        currentEpisodeIndexRef: { current: 0 },
        searchTitle: 'Title',
        lastSaveTimeRef: { current: 0 },
        releaseWakeLock,
        cleanupPlayer,
        requestWakeLock: jest.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(sendBeacon).toHaveBeenCalledWith(
      '/api/playrecords',
      expect.any(Blob),
    );
    expect(savePlayRecord).not.toHaveBeenCalled();
    expect(releaseWakeLock).toHaveBeenCalledTimes(1);
    expect(cleanupPlayer).toHaveBeenCalledTimes(1);
  });
});
