import { act, renderHook } from '@testing-library/react';

import { savePlayRecord } from '@/lib/db.client';

import { buildPlayProgressPayload, usePlayProgress } from './usePlayProgress';
import type { ArtPlayerLike } from '../utils/danmakuRuntime';

jest.mock('@/lib/db.client', () => ({
  generateStorageKey: (source: string, id: string) => `${source}+${id}`,
  savePlayRecord: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromBrowserCookie: () => ({ username: 'test-user' }),
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

  test('uses sendBeacon on beforeunload without destroying player prematurely, and cleans up on non-persisted pagehide', () => {
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
        videoCover: '',
        videoDoubanIdRef: { current: 123 },
        detailRef: { current: createDetail() },
        playRecords: null,
        availableSourcesRef: { current: [createDetail()] },
        movieDetails: null,
        bangumiDetails: null,
        currentEpisodeIndexRef: { current: 0 },
        searchTitle: 'Title',
        lastSaveTimeRef: { current: 0 },
        releaseWakeLock,
        cleanupPlayer,
        requestWakeLock: jest.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('savePlayProgress'));
      window.dispatchEvent(new Event('beforeunload'));
    });

    // savePlayProgress 与紧随的 beforeunload 在 1s 窗口内去重，且 beforeunload 不提前销毁播放器
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith(
      '/api/playrecords',
      expect.any(Blob),
    );
    expect(savePlayRecord).not.toHaveBeenCalled();
    expect(releaseWakeLock).toHaveBeenCalledTimes(1);
    expect(cleanupPlayer).not.toHaveBeenCalled();

    act(() => {
      const pageHideEvent = new Event('pagehide') as PageTransitionEvent;
      Object.defineProperty(pageHideEvent, 'persisted', { value: false });
      window.dispatchEvent(pageHideEvent);
    });
    expect(cleanupPlayer).toHaveBeenCalledTimes(1);
  });
});

describe('buildPlayProgressPayload', () => {
  test('uses douban detail poster before a known bad source poster', () => {
    const payload = buildPlayProgressPayload({
      player: {
        currentTime: 75,
        duration: 1200,
      } as ArtPlayerLike,
      currentSource: 'source',
      currentId: 'id',
      videoTitle: 'Title',
      videoCover: '',
      videoDoubanId: 123,
      detail: {
        ...createDetail(),
        poster: 'https://018.shoutu.net/static/images/logo.jpg',
      },
      playRecords: null,
      availableSources: [
        {
          ...createDetail(),
          poster: 'https://018.shoutu.net/static/images/logo.jpg',
        },
      ],
      movieDetails: {
        rate: '',
        year: '2024',
        poster:
          'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
      },
      bangumiDetails: null,
      currentEpisodeIndex: 0,
      searchTitle: 'Title',
    });

    expect(payload?.record.cover).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
  });

  test('keeps usable source poster when detail posters are unavailable', () => {
    const payload = buildPlayProgressPayload({
      player: {
        currentTime: 75,
        duration: 1200,
      } as ArtPlayerLike,
      currentSource: 'source',
      currentId: 'id',
      videoTitle: 'Title',
      videoCover: '',
      videoDoubanId: 123,
      detail: {
        ...createDetail(),
        poster: '',
      },
      playRecords: null,
      availableSources: [
        {
          ...createDetail(),
          poster: 'https://source.example/poster.jpg',
        },
      ],
      movieDetails: null,
      bangumiDetails: null,
      currentEpisodeIndex: 0,
      searchTitle: 'Title',
    });

    expect(payload?.record.cover).toBe('https://source.example/poster.jpg');
  });

  test('uses route cover before source poster when detail posters are unavailable', () => {
    const routeCover =
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg';
    const payload = buildPlayProgressPayload({
      player: {
        currentTime: 75,
        duration: 1200,
      } as ArtPlayerLike,
      currentSource: 'source',
      currentId: 'id',
      videoTitle: 'Title',
      videoCover: routeCover,
      videoDoubanId: 123,
      detail: {
        ...createDetail(),
        poster: 'https://broken-source.example/poster.jpg',
      },
      playRecords: null,
      availableSources: [
        {
          ...createDetail(),
          poster: 'https://broken-source.example/poster.jpg',
        },
      ],
      movieDetails: null,
      bangumiDetails: null,
      currentEpisodeIndex: 0,
      searchTitle: 'Title',
    });

    expect(payload?.record.cover).toBe(routeCover);
  });

  test('skips building progress payload near video end', () => {
    const payload = buildPlayProgressPayload({
      player: {
        currentTime: 1100,
        duration: 1200,
      } as ArtPlayerLike,
      currentSource: 'source',
      currentId: 'id',
      videoTitle: 'Title',
      videoCover: '',
      videoDoubanId: 123,
      detail: createDetail(),
      playRecords: null,
      availableSources: [createDetail()],
      movieDetails: null,
      bangumiDetails: null,
      currentEpisodeIndex: 0,
      searchTitle: 'Title',
    });

    expect(payload).toBeNull();
  });

  test('advances original_episodes in beacon/unload payload when user watched newly updated episode', () => {
    const detailWithNewEpisodes = {
      ...createDetail(),
      episodes: ['ep1', 'ep2', 'ep3'],
    };
    const payload = buildPlayProgressPayload({
      player: {
        currentTime: 120,
        duration: 1200,
      } as ArtPlayerLike,
      currentSource: 'source',
      currentId: 'id',
      videoTitle: 'Title',
      videoCover: '',
      videoDoubanId: 123,
      detail: detailWithNewEpisodes,
      playRecords: {
        'source+id': {
          title: 'Title',
          source_name: 'Source',
          year: '2024',
          cover: '',
          index: 2,
          total_episodes: 2,
          original_episodes: 2,
          play_time: 500,
          total_time: 1200,
          save_time: 1000,
          search_title: 'Title',
        },
      },
      availableSources: [detailWithNewEpisodes],
      movieDetails: null,
      bangumiDetails: null,
      currentEpisodeIndex: 2, // 第 3 集（超过原 original_episodes=2）且播放超过 60s
      searchTitle: 'Title',
    });

    expect(payload?.record.original_episodes).toBe(3);
  });
});
