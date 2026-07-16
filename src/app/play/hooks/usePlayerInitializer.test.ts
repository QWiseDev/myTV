import { act, renderHook, waitFor } from '@testing-library/react';

import { usePlayerInitializer } from './usePlayerInitializer';
import { createArtplayerConfig } from '../utils/artplayerConfig';
import { loadArtplayerModules } from '../utils/artplayerLoader';
import { handleHlsError, initAdaptiveHls } from '../utils/hlsConfig';

const mockArtplayerConstructor = jest.fn();
const mockSwitchPlayerMedia = jest.fn();

jest.mock('../utils/artplayerLoader', () => ({
  loadArtplayerModules: jest.fn(),
}));

jest.mock('../utils/artplayerConfig', () => ({
  createArtplayerConfig: jest.fn(() => ({})),
  setupArtplayerGlobals: jest.fn(),
}));

jest.mock('../utils/playerBrowserSupport', () => ({
  detectPlayerBrowserSupport: jest.fn(() => ({
    isSafari: false,
    isIOS: false,
    isIOS13: false,
    isMobile: false,
    isWebKit: false,
    isChrome: false,
  })),
}));

jest.mock('../utils/hlsConfig', () => ({
  handleHlsError: jest.fn(),
  initAdaptiveHls: jest.fn(),
}));

jest.mock('../utils/playerSwitch', () => ({
  ...jest.requireActual('../utils/playerSwitch'),
  switchPlayerMedia: (...args: unknown[]) => mockSwitchPlayerMedia(...args),
}));

jest.mock('../utils/playerUiEnhancements', () => ({
  addResolutionDisplay: jest.fn(),
  applyAllUiEnhancements: jest.fn(),
}));

jest.mock('hls.js', () => {
  class MockLoader {
    load() {
      return undefined;
    }
  }

  class MockHls {
    static DefaultConfig: { loader: typeof MockLoader } = {
      loader: MockLoader,
    };
  }

  return {
    __esModule: true,
    default: MockHls,
  };
});

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createParams(videoUrl: string) {
  const detail = {
    id: 'id',
    title: 'title',
    poster: '',
    episodes: [videoUrl],
    episodes_titles: [],
    source: 'source',
    source_name: 'source',
    year: '2025',
  };

  return {
    videoUrl,
    loading: false,
    currentEpisodeIndex: 0,
    artRef: { current: document.createElement('div') },
    detail,
    totalEpisodes: 1,
    setError: jest.fn(),
    userAgent: '',
    isIOSGlobal: false,
    isIOS13Global: false,
    isMobileGlobal: false,
    artPlayerRef: { current: null },
    blockAdEnabled: false,
    blockAdEnabledRef: { current: false },
    setBlockAdEnabled: jest.fn(),
    setCurrentEpisodeIndex: jest.fn(),
    handleDanmuOperationOptimized: jest.fn(),
    handleNextEpisode: jest.fn(),
    handleSourceChange: jest.fn(),
    currentSource: 'source',
    currentId: 'id',
    setAvailableSources: jest.fn(),
    availableSourcesRef: { current: [detail] },
    setIsVideoLoading: jest.fn(),
    setLoading: jest.fn(),
    videoTitle: 'title',
    videoCover: '',
    detailRef: { current: detail },
    currentEpisodeIndexRef: { current: 0 },
    resumeTimeRef: { current: null },
    memoryPressure: 'low',
    externalDanmuEnabledRef: { current: false },
    throttledTimeUpdate: jest.fn(),
    saveCurrentPlayProgress: jest.fn(),
    lastSaveTimeRef: { current: 0 },
    lastVolumeRef: { current: 0.7 },
    lastPlaybackRateRef: { current: 1 },
    requestWakeLock: jest.fn(),
    releaseWakeLock: jest.fn(),
    analytics: {
      handlePlay: jest.fn(),
      handlePause: jest.fn(),
      trackProgress: jest.fn(),
      handleVolumeChange: jest.fn(),
      handleSpeedChange: jest.fn(),
    },
    ensureVideoSource: jest.fn(),
    loadExternalDanmuRef: { current: null },
    switchPromiseRef: { current: null },
    danmuPluginStateRef: { current: null },
    isSourceChangingRef: { current: false },
    isEpisodeChangingRef: { current: false },
    isSkipControllerTriggeredRef: { current: false },
    videoEndedHandledRef: { current: false },
    isRestoringFromRecordRef: { current: false },
    videoErrorHandlerRef: { current: null },
    cleanupPlayer: jest.fn(),
    danmuEpisodeNum: 0,
    onDanmuEpisodeChange: jest.fn(),
  } as Parameters<typeof usePlayerInitializer>[0];
}

function createMockPlayer(
  handlers: Map<string, (...args: unknown[]) => void>,
  handlerLists?: Map<string, Array<(...args: unknown[]) => void>>,
) {
  const video = document.createElement('video');

  return {
    video,
    $video: video,
    plugins: {
      artplayerPluginDanmuku: {
        reset: jest.fn(),
        load: jest.fn(),
      },
    },
    notice: { show: '' },
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      if (handlerLists) {
        const eventHandlers = handlerLists.get(event) || [];
        eventHandlers.push(handler);
        handlerLists.set(event, eventHandlers);
      }
    }),
    off: jest.fn(),
    destroy: jest.fn(),
    play: jest.fn().mockResolvedValue(undefined),
    paused: true,
    playing: false,
    muted: false,
    title: 'old title',
    poster: 'old.jpg',
    currentTime: 0,
    duration: 1000,
    volume: 0.7,
    playbackRate: 1,
  };
}

type HlsErrorCallback = (event: unknown, data: unknown) => void;

function mockAdaptiveHlsSessions() {
  const callbacks: HlsErrorCallback[] = [];
  const instances: Array<{ destroy: jest.Mock }> = [];

  (initAdaptiveHls as jest.Mock).mockImplementation((...args: unknown[]) => {
    const video = args[0] as HTMLVideoElement;
    const hls = { destroy: jest.fn() };
    callbacks.push(args[4] as HlsErrorCallback);
    instances.push(hls);
    (video as unknown as { hls?: unknown }).hls = hls;
    return hls;
  });

  return { callbacks, instances };
}

async function renderPlayerAndGetEventHandlers(
  params: Parameters<typeof usePlayerInitializer>[0],
  eventName: string,
) {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const handlerLists = new Map<string, Array<(...args: unknown[]) => void>>();
  const player = createMockPlayer(handlers, handlerLists);
  mockArtplayerConstructor.mockImplementation(() => player);
  (loadArtplayerModules as jest.Mock).mockResolvedValue({
    Artplayer: mockArtplayerConstructor,
    artplayerPluginDanmuku: jest.fn(() => ({})),
  });

  renderHook(() => usePlayerInitializer(params));

  await waitFor(() => {
    expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
  });

  return handlerLists.get(eventName) || [];
}

function emitPlayerEvent(
  handlers: Array<(...args: unknown[]) => void>,
  ...args: unknown[]
) {
  [...handlers].forEach((handler) => handler(...args));
}

describe('usePlayerInitializer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createArtplayerConfig as jest.Mock).mockReset().mockReturnValue({});
    (handleHlsError as jest.Mock).mockReset();
    (initAdaptiveHls as jest.Mock).mockReset();
    mockSwitchPlayerMedia.mockResolvedValue({
      displayTitle: 'title - 第1集',
      poster: '',
      resetCurrentTime: false,
    });
    localStorage.clear();
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: jest.fn().mockResolvedValue({ ok: false }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('invalidates an older module load after the media changes', async () => {
    const firstLoad =
      createDeferred<Awaited<ReturnType<typeof loadArtplayerModules>>>();
    const secondLoad =
      createDeferred<Awaited<ReturnType<typeof loadArtplayerModules>>>();
    (loadArtplayerModules as jest.Mock)
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);

    const { rerender, unmount } = renderHook(
      ({ videoUrl }) => usePlayerInitializer(createParams(videoUrl)),
      { initialProps: { videoUrl: 'https://example.com/old.m3u8' } },
    );

    await waitFor(() => {
      expect(loadArtplayerModules).toHaveBeenCalledTimes(1);
    });

    rerender({ videoUrl: 'https://example.com/current.m3u8' });
    await waitFor(() => {
      expect(loadArtplayerModules).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      firstLoad.resolve({
        Artplayer: mockArtplayerConstructor as never,
        artplayerPluginDanmuku: jest.fn(),
      });
      await firstLoad.promise;
    });

    expect(mockArtplayerConstructor).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      secondLoad.resolve({
        Artplayer: mockArtplayerConstructor as never,
        artplayerPluginDanmuku: jest.fn(),
      });
      await secondLoad.promise;
    });

    expect(mockArtplayerConstructor).not.toHaveBeenCalled();
  });

  test('runs ended analytics before scheduling the next episode once', async () => {
    jest.useFakeTimers();
    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    const detail = {
      ...params.detail,
      episodes: [
        'https://example.com/episode-1.m3u8',
        'https://example.com/episode-2.m3u8',
      ],
    };
    params.detail = detail;
    params.detailRef.current = detail;
    params.totalEpisodes = 2;

    const endedHandlers = await renderPlayerAndGetEventHandlers(
      params,
      'video:ended',
    );
    expect(endedHandlers).toHaveLength(1);

    act(() => {
      emitPlayerEvent(endedHandlers);
      emitPlayerEvent(endedHandlers);
    });

    const releaseWakeLock = params.releaseWakeLock as jest.Mock;
    const trackProgress = params.analytics.trackProgress as jest.Mock;
    expect(releaseWakeLock).toHaveBeenCalledTimes(2);
    expect(trackProgress).toHaveBeenCalledTimes(2);
    expect(trackProgress).toHaveBeenNthCalledWith(1, 100);
    expect(trackProgress).toHaveBeenNthCalledWith(2, 100);
    expect(releaseWakeLock.mock.invocationCallOrder[0]).toBeLessThan(
      trackProgress.mock.invocationCallOrder[0],
    );
    expect(params.videoEndedHandledRef.current).toBe(true);
    expect(params.setCurrentEpisodeIndex).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(params.setCurrentEpisodeIndex).toHaveBeenCalledTimes(1);
    expect(params.setCurrentEpisodeIndex).toHaveBeenCalledWith(1);
  });

  test('keeps ended analytics while skip-controller completion suppresses auto-next', async () => {
    jest.useFakeTimers();
    const params = createParams('https://example.com/episode-1.m3u8');
    params.isSkipControllerTriggeredRef.current = true;

    const endedHandlers = await renderPlayerAndGetEventHandlers(
      params,
      'video:ended',
    );
    expect(endedHandlers).toHaveLength(1);

    act(() => {
      emitPlayerEvent(endedHandlers);
    });

    expect(params.releaseWakeLock).toHaveBeenCalledTimes(1);
    expect(params.analytics.trackProgress).toHaveBeenCalledWith(100);
    expect(params.videoEndedHandledRef.current).toBe(true);
    expect(params.setCurrentEpisodeIndex).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(params.isSkipControllerTriggeredRef.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(params.isSkipControllerTriggeredRef.current).toBe(false);
  });

  test('does not schedule auto-next when analytics replaces the active player', async () => {
    jest.useFakeTimers();
    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    const detail = {
      ...params.detail,
      episodes: [
        'https://example.com/episode-1.m3u8',
        'https://example.com/episode-2.m3u8',
      ],
    };
    params.detail = detail;
    params.detailRef.current = detail;
    params.totalEpisodes = 2;
    params.analytics.trackProgress = jest.fn(() => {
      params.artPlayerRef.current = null;
    });

    const endedHandlers = await renderPlayerAndGetEventHandlers(
      params,
      'video:ended',
    );

    act(() => {
      emitPlayerEvent(endedHandlers);
      jest.advanceTimersByTime(1000);
    });

    expect(params.releaseWakeLock).toHaveBeenCalledTimes(1);
    expect(params.analytics.trackProgress).toHaveBeenCalledWith(100);
    expect(params.videoEndedHandledRef.current).toBe(false);
    expect(params.setCurrentEpisodeIndex).not.toHaveBeenCalled();
  });

  test('keeps the final episode eligible for a later ended event', async () => {
    jest.useFakeTimers();
    const params = createParams('https://example.com/final-episode.m3u8');
    const endedHandlers = await renderPlayerAndGetEventHandlers(
      params,
      'video:ended',
    );

    act(() => {
      emitPlayerEvent(endedHandlers);
      jest.advanceTimersByTime(2000);
    });

    expect(params.releaseWakeLock).toHaveBeenCalledTimes(1);
    expect(params.analytics.trackProgress).toHaveBeenCalledWith(100);
    expect(params.videoEndedHandledRef.current).toBe(false);
    expect(params.setCurrentEpisodeIndex).not.toHaveBeenCalled();
  });

  test('keeps committed player events active and clears completed switch ownership', async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    params.detail.episodes = [
      'https://example.com/episode-1.m3u8',
      'https://example.com/episode-2.m3u8',
      'https://example.com/episode-3.m3u8',
    ];
    params.totalEpisodes = 3;
    const { rerender } = renderHook(
      ({ episodeIndex, videoUrl }) =>
        usePlayerInitializer({
          ...params,
          currentEpisodeIndex: episodeIndex,
          videoUrl,
        }),
      {
        initialProps: {
          episodeIndex: 0,
          videoUrl: 'https://example.com/episode-1.m3u8',
        },
      },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
      expect(handlers.has('video:canplay')).toBe(true);
    });

    const setIsVideoLoading = params.setIsVideoLoading as jest.Mock;
    setIsVideoLoading.mockClear();

    params.isEpisodeChangingRef.current = true;
    rerender({
      episodeIndex: 1,
      videoUrl: 'https://example.com/episode-2.m3u8',
    });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(1);
      expect(params.switchPromiseRef.current).toBeNull();
    });

    expect(params.cleanupPlayer).not.toHaveBeenCalled();
    expect(player.title).toBe('title - 第1集');

    act(() => {
      handlers.get('video:canplay')?.();
    });

    expect(setIsVideoLoading).toHaveBeenCalledWith(false);

    params.isEpisodeChangingRef.current = true;
    rerender({
      episodeIndex: 2,
      videoUrl: 'https://example.com/episode-3.m3u8',
    });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(2);
      expect(params.switchPromiseRef.current).toBeNull();
    });

    expect(params.cleanupPlayer).not.toHaveBeenCalled();
  });

  test('does not load or render external danmaku when it is disabled at ready', async () => {
    jest.useFakeTimers();
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    const loadExternalDanmu = jest.fn().mockResolvedValue([]);
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    params.externalDanmuEnabledRef.current = false;
    params.loadExternalDanmuRef.current = loadExternalDanmu;

    renderHook(() => usePlayerInitializer(params));

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
      expect(handlers.has('ready')).toBe(true);
    });

    act(() => {
      handlers.get('ready')?.();
      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(1000);
    });

    expect(loadExternalDanmu).not.toHaveBeenCalled();
    expect(player.plugins.artplayerPluginDanmuku.reset).not.toHaveBeenCalled();
    expect(player.plugins.artplayerPluginDanmuku.load).not.toHaveBeenCalled();
    expect(player.notice.show).not.toBe('暂无弹幕数据');
  });

  test('does not render an in-flight danmaku result after it is disabled', async () => {
    jest.useFakeTimers();
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    const pendingDanmaku = createDeferred<never[]>();
    const loadExternalDanmu = jest.fn(() => pendingDanmaku.promise);
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    params.externalDanmuEnabledRef.current = true;
    params.loadExternalDanmuRef.current = loadExternalDanmu;

    renderHook(() => usePlayerInitializer(params));

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
      expect(handlers.has('ready')).toBe(true);
    });

    await act(async () => {
      handlers.get('ready')?.();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(loadExternalDanmu).toHaveBeenCalledTimes(1);

    params.externalDanmuEnabledRef.current = false;
    await act(async () => {
      pendingDanmaku.resolve([]);
      await pendingDanmaku.promise;
    });

    expect(player.plugins.artplayerPluginDanmuku.reset).not.toHaveBeenCalled();
    expect(player.plugins.artplayerPluginDanmuku.load).not.toHaveBeenCalled();
    expect(player.notice.show).not.toBe('暂无弹幕数据');
  });

  test('waits for the selected episode URL before switching media', async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    params.detail.episodes = [
      'https://example.com/episode-1.m3u8',
      '  https://example.com/episode-2.m3u8  ',
    ];
    params.totalEpisodes = 2;

    const { rerender } = renderHook(
      ({ episodeIndex, videoUrl }) =>
        usePlayerInitializer({
          ...params,
          currentEpisodeIndex: episodeIndex,
          videoUrl,
        }),
      {
        initialProps: {
          episodeIndex: 0,
          videoUrl: 'https://example.com/episode-1.m3u8',
        },
      },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    params.isEpisodeChangingRef.current = true;
    await act(async () => {
      rerender({
        episodeIndex: 1,
        videoUrl: 'https://example.com/episode-1.m3u8',
      });
      await Promise.resolve();
    });

    expect(mockSwitchPlayerMedia).not.toHaveBeenCalled();
    expect(params.cleanupPlayer).not.toHaveBeenCalled();

    rerender({
      episodeIndex: 1,
      videoUrl: 'https://example.com/episode-2.m3u8',
    });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(1);
    });

    expect(mockSwitchPlayerMedia).toHaveBeenCalledWith(
      player,
      expect.objectContaining({
        episodeIndex: 1,
        videoUrl: 'https://example.com/episode-2.m3u8',
      }),
    );
    expect(params.cleanupPlayer).not.toHaveBeenCalled();
  });

  test('does not switch the old URL when the selected episode URL is empty', async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    params.detail.episodes = ['https://example.com/episode-1.m3u8', '   '];
    params.totalEpisodes = 2;

    const { rerender } = renderHook(
      ({ episodeIndex, videoUrl }) =>
        usePlayerInitializer({
          ...params,
          currentEpisodeIndex: episodeIndex,
          videoUrl,
        }),
      {
        initialProps: {
          episodeIndex: 0,
          videoUrl: 'https://example.com/episode-1.m3u8',
        },
      },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    params.isEpisodeChangingRef.current = true;
    await act(async () => {
      rerender({
        episodeIndex: 1,
        videoUrl: 'https://example.com/episode-1.m3u8',
      });
      await Promise.resolve();
    });

    expect(mockSwitchPlayerMedia).not.toHaveBeenCalled();
    expect(params.cleanupPlayer).not.toHaveBeenCalled();
    expect(loadArtplayerModules).toHaveBeenCalledTimes(1);

    rerender({ episodeIndex: 1, videoUrl: '' });

    await waitFor(() => {
      expect(params.setError).toHaveBeenCalledWith('视频地址无效');
    });
    expect(mockSwitchPlayerMedia).not.toHaveBeenCalled();
    expect(params.cleanupPlayer).not.toHaveBeenCalled();
  });

  test('rebuilds instead of starting a second in-place switch on the same player', async () => {
    const firstHandlers = new Map<string, (...args: unknown[]) => void>();
    const secondHandlers = new Map<string, (...args: unknown[]) => void>();
    const firstPlayer = createMockPlayer(firstHandlers);
    const secondPlayer = createMockPlayer(secondHandlers);
    const staleSwitch = createDeferred<{
      displayTitle: string;
      poster: string;
      resetCurrentTime: boolean;
    }>();
    const currentSwitch = createDeferred<{
      displayTitle: string;
      poster: string;
      resetCurrentTime: boolean;
    }>();
    mockSwitchPlayerMedia
      .mockReturnValueOnce(staleSwitch.promise)
      .mockReturnValueOnce(currentSwitch.promise);
    mockArtplayerConstructor
      .mockImplementationOnce(() => firstPlayer)
      .mockImplementationOnce(() => secondPlayer);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    params.detail.episodes = [
      'https://example.com/episode-1.m3u8',
      'https://example.com/episode-2.m3u8',
      'https://example.com/episode-3.m3u8',
      'https://example.com/episode-4.m3u8',
    ];
    params.totalEpisodes = 4;
    params.cleanupPlayer = jest.fn(() => {
      params.artPlayerRef.current = null;
    });

    const { rerender } = renderHook(
      ({ episodeIndex, videoUrl }) =>
        usePlayerInitializer({
          ...params,
          currentEpisodeIndex: episodeIndex,
          videoTitle: `title-${episodeIndex + 1}`,
          videoUrl,
        }),
      {
        initialProps: {
          episodeIndex: 0,
          videoUrl: 'https://example.com/episode-1.m3u8',
        },
      },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    params.isEpisodeChangingRef.current = true;
    rerender({
      episodeIndex: 1,
      videoUrl: 'https://example.com/episode-2.m3u8',
    });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(1);
    });

    rerender({
      episodeIndex: 2,
      videoUrl: 'https://example.com/episode-3.m3u8',
    });
    await waitFor(() => {
      expect(params.cleanupPlayer).toHaveBeenCalledTimes(1);
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(2);
    });

    rerender({
      episodeIndex: 3,
      videoUrl: 'https://example.com/episode-4.m3u8',
    });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(2);
      expect(params.switchPromiseRef.current).toBe(currentSwitch.promise);
    });

    await act(async () => {
      staleSwitch.resolve({
        displayTitle: 'stale title - 第2集',
        poster: 'stale.jpg',
        resetCurrentTime: true,
      });
      await staleSwitch.promise;
    });

    expect(params.switchPromiseRef.current).toBe(currentSwitch.promise);
    expect(params.artPlayerRef.current).toBe(secondPlayer);
    expect(firstPlayer.title).toBe('old title');
    expect(firstPlayer.poster).toBe('old.jpg');

    await act(async () => {
      currentSwitch.resolve({
        displayTitle: 'current title - 第4集',
        poster: 'current.jpg',
        resetCurrentTime: false,
      });
      await currentSwitch.promise;
    });

    expect(params.switchPromiseRef.current).toBeNull();
    expect(secondPlayer.title).toBe('current title - 第4集');
    expect(secondPlayer.poster).toBe('current.jpg');
  });

  test('keeps HLS error recovery active after an in-place episode switch', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    const hlsSessions = mockAdaptiveHlsSessions();
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });
    (createArtplayerConfig as jest.Mock).mockImplementation(
      (options: unknown) => options,
    );
    (handleHlsError as jest.Mock).mockImplementation((...args: unknown[]) => {
      const reportFatalError = args[4] as (message: string) => void;
      reportFatalError('fatal hls error');
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    params.detail.episodes = [
      'https://example.com/episode-1.m3u8',
      'https://example.com/episode-2.m3u8',
    ];
    params.totalEpisodes = 2;

    const { rerender } = renderHook(
      ({ episodeIndex, videoUrl }) =>
        usePlayerInitializer({
          ...params,
          currentEpisodeIndex: episodeIndex,
          videoUrl,
        }),
      {
        initialProps: {
          episodeIndex: 0,
          videoUrl: 'https://example.com/episode-1.m3u8',
        },
      },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    const playerOptions = (createArtplayerConfig as jest.Mock).mock.calls[0][0];
    act(() => {
      playerOptions.customType.m3u8(
        player.video,
        'https://example.com/episode-1.m3u8',
      );
    });

    const setLoading = params.setLoading as jest.Mock;
    const setIsVideoLoading = params.setIsVideoLoading as jest.Mock;
    setLoading.mockClear();
    setIsVideoLoading.mockClear();
    (handleHlsError as jest.Mock).mockClear();

    act(() => {
      hlsSessions.callbacks[0]('queued stale error', {});
    });
    expect(handleHlsError).toHaveBeenCalledTimes(1);

    params.isEpisodeChangingRef.current = true;
    rerender({
      episodeIndex: 1,
      videoUrl: 'https://example.com/episode-2.m3u8',
    });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(1);
    });

    act(() => {
      hlsSessions.callbacks[0]('stale error after switch', {});
    });
    expect(handleHlsError).toHaveBeenCalledTimes(1);

    act(() => {
      playerOptions.customType.m3u8(
        player.video,
        'https://example.com/episode-2.m3u8',
      );
    });

    expect(hlsSessions.callbacks).toHaveLength(2);
    expect(hlsSessions.instances).toHaveLength(2);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(setLoading).not.toHaveBeenCalled();
    expect(setIsVideoLoading).not.toHaveBeenCalled();

    act(() => {
      hlsSessions.callbacks[1]('current error', {});
    });

    expect(handleHlsError).toHaveBeenCalledTimes(2);
    expect(handleHlsError).toHaveBeenCalledWith(
      'current error',
      {},
      hlsSessions.instances[1],
      player.video,
      expect.any(Function),
    );

    act(() => {
      jest.advanceTimersByTime(99);
    });
    expect(setLoading).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(setLoading).toHaveBeenCalledWith(false);
    expect(setIsVideoLoading).toHaveBeenCalledWith(false);
  });

  test('ignores HLS errors from a replaced player even when its session starts late', async () => {
    const firstHandlers = new Map<string, (...args: unknown[]) => void>();
    const secondHandlers = new Map<string, (...args: unknown[]) => void>();
    const firstPlayer = createMockPlayer(firstHandlers);
    const secondPlayer = createMockPlayer(secondHandlers);
    const hlsSessions = mockAdaptiveHlsSessions();
    mockArtplayerConstructor
      .mockImplementationOnce(() => firstPlayer)
      .mockImplementationOnce(() => secondPlayer);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });
    (createArtplayerConfig as jest.Mock).mockImplementation(
      (options: unknown) => options,
    );

    const params = createParams('https://example.com/shared.m3u8');
    params.cleanupPlayer = jest.fn(() => {
      params.artPlayerRef.current = null;
    });

    const { rerender } = renderHook(
      ({ source, id }) =>
        usePlayerInitializer({
          ...params,
          currentSource: source,
          currentId: id,
        }),
      { initialProps: { source: 'source-a', id: 'id-a' } },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    params.isSourceChangingRef.current = true;
    rerender({ source: 'source-b', id: 'id-b' });
    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(2);
    });

    const firstOptions = (createArtplayerConfig as jest.Mock).mock.calls[0][0];
    const secondOptions = (createArtplayerConfig as jest.Mock).mock.calls[1][0];

    act(() => {
      firstOptions.customType.m3u8(
        firstPlayer.video,
        'https://example.com/stale.m3u8',
      );
    });

    (handleHlsError as jest.Mock).mockClear();
    act(() => {
      hlsSessions.callbacks[0]('stale error', {});
    });
    expect(handleHlsError).not.toHaveBeenCalled();

    act(() => {
      secondOptions.customType.m3u8(
        secondPlayer.video,
        'https://example.com/shared.m3u8',
      );
      hlsSessions.callbacks[1]('current error', {});
    });

    expect(handleHlsError).toHaveBeenCalledWith(
      'current error',
      {},
      hlsSessions.instances[1],
      secondPlayer.video,
      expect.any(Function),
    );
  });

  test('restarts the loading timeout for the current in-place episode switch', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    const pendingSwitch = createDeferred<{
      displayTitle: string;
      poster: string;
      resetCurrentTime: boolean;
    }>();
    mockSwitchPlayerMedia.mockReturnValueOnce(pendingSwitch.promise);
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    params.detail.episodes = [
      'https://example.com/episode-1.m3u8',
      'https://example.com/episode-2.m3u8',
    ];
    params.totalEpisodes = 2;

    const { rerender, unmount } = renderHook(
      ({ episodeIndex, videoUrl }) =>
        usePlayerInitializer({
          ...params,
          currentEpisodeIndex: episodeIndex,
          videoUrl,
        }),
      {
        initialProps: {
          episodeIndex: 0,
          videoUrl: 'https://example.com/episode-1.m3u8',
        },
      },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handlers.get('video:canplay')?.();
    });

    const setLoading = params.setLoading as jest.Mock;
    const setIsVideoLoading = params.setIsVideoLoading as jest.Mock;
    setLoading.mockClear();
    setIsVideoLoading.mockClear();
    consoleError.mockClear();
    jest.useFakeTimers();

    params.isEpisodeChangingRef.current = true;
    rerender({
      episodeIndex: 1,
      videoUrl: 'https://example.com/episode-2.m3u8',
    });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(1);
      expect(params.switchPromiseRef.current).toBe(pendingSwitch.promise);
    });

    act(() => {
      jest.advanceTimersByTime(9999);
    });
    expect(setLoading).not.toHaveBeenCalled();
    expect(setIsVideoLoading).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(setLoading).toHaveBeenCalledWith(false);
    expect(setIsVideoLoading).toHaveBeenCalledWith(false);
    expect(consoleError).toHaveBeenCalledWith('视频加载超时:', {
      url: 'https://example.com/episode-2.m3u8',
      source: 'source',
      id: 'id',
      episodeIndex: 1,
    });
    expect(player.notice.show).toContain('https://example.com/episode-2.m3u8');
    expect(params.switchPromiseRef.current).toBe(pendingSwitch.promise);

    unmount();
    await act(async () => {
      pendingSwitch.resolve({
        displayTitle: 'late title - 第2集',
        poster: 'late.jpg',
        resetCurrentTime: true,
      });
      await pendingSwitch.promise;
    });

    expect(params.switchPromiseRef.current).toBeNull();
    expect(player.title).toBe('old title');
    expect(player.poster).toBe('old.jpg');
  });

  test('restarts initialization when source identity changes with the same URL', async () => {
    const firstLoad =
      createDeferred<Awaited<ReturnType<typeof loadArtplayerModules>>>();
    const secondLoad =
      createDeferred<Awaited<ReturnType<typeof loadArtplayerModules>>>();
    (loadArtplayerModules as jest.Mock)
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);
    const params = createParams('https://example.com/shared.m3u8');

    const { rerender, unmount } = renderHook(
      ({ source }) =>
        usePlayerInitializer({
          ...params,
          currentSource: source,
          currentId: `${source}-id`,
        }),
      { initialProps: { source: 'source-a' } },
    );

    await waitFor(() => {
      expect(loadArtplayerModules).toHaveBeenCalledTimes(1);
    });

    rerender({ source: 'source-b' });
    await waitFor(() => {
      expect(loadArtplayerModules).toHaveBeenCalledTimes(2);
    });

    unmount();
    await act(async () => {
      firstLoad.resolve({
        Artplayer: mockArtplayerConstructor as never,
        artplayerPluginDanmuku: jest.fn(),
      });
      secondLoad.resolve({
        Artplayer: mockArtplayerConstructor as never,
        artplayerPluginDanmuku: jest.fn(),
      });
      await Promise.all([firstLoad.promise, secondLoad.promise]);
    });

    expect(mockArtplayerConstructor).not.toHaveBeenCalled();
  });

  test('rebuilds an existing player when source identity changes with the same URL', async () => {
    const firstHandlers = new Map<string, (...args: unknown[]) => void>();
    const secondHandlers = new Map<string, (...args: unknown[]) => void>();
    const firstPlayer = createMockPlayer(firstHandlers);
    const secondPlayer = createMockPlayer(secondHandlers);
    mockArtplayerConstructor
      .mockImplementationOnce(() => firstPlayer)
      .mockImplementationOnce(() => secondPlayer);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/shared.m3u8');
    params.cleanupPlayer = jest.fn(() => {
      params.artPlayerRef.current = null;
    });

    const { rerender } = renderHook(
      ({ source }) =>
        usePlayerInitializer({
          ...params,
          currentSource: source,
          currentId: `${source}-id`,
        }),
      { initialProps: { source: 'source-a' } },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    params.isSourceChangingRef.current = true;
    params.resumeTimeRef.current = 37;
    rerender({ source: 'source-b' });

    await waitFor(() => {
      expect(params.cleanupPlayer).toHaveBeenCalledTimes(1);
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(2);
    });

    expect(mockSwitchPlayerMedia).not.toHaveBeenCalled();
    expect(params.isSourceChangingRef.current).toBe(true);

    act(() => {
      secondHandlers.get('video:canplay')?.();
    });

    expect(params.isSourceChangingRef.current).toBe(false);
    expect(params.resumeTimeRef.current).toBeNull();
  });

  test('waits for the new source URL before rebuilding an existing player', async () => {
    const firstHandlers = new Map<string, (...args: unknown[]) => void>();
    const secondHandlers = new Map<string, (...args: unknown[]) => void>();
    const firstPlayer = createMockPlayer(firstHandlers);
    const secondPlayer = createMockPlayer(secondHandlers);
    mockArtplayerConstructor
      .mockImplementationOnce(() => firstPlayer)
      .mockImplementationOnce(() => secondPlayer);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/source-a.m3u8');
    if (!params.detail) throw new Error('expected test detail');
    params.cleanupPlayer = jest.fn(() => {
      params.artPlayerRef.current = null;
    });
    const nextDetail = {
      ...params.detail,
      id: 'id-b',
      source: 'source-b',
      source_name: 'source-b',
      episodes: ['https://example.com/source-b.m3u8'],
    };

    const { rerender } = renderHook(
      ({ source, id, detail, videoUrl }) =>
        usePlayerInitializer({
          ...params,
          currentSource: source,
          currentId: id,
          detail,
          videoUrl,
        }),
      {
        initialProps: {
          source: 'source-a',
          id: 'id-a',
          detail: params.detail,
          videoUrl: 'https://example.com/source-a.m3u8',
        },
      },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
    });

    params.isSourceChangingRef.current = true;
    await act(async () => {
      rerender({
        source: 'source-b',
        id: 'id-b',
        detail: nextDetail,
        videoUrl: 'https://example.com/source-a.m3u8',
      });
      await Promise.resolve();
    });

    expect(mockSwitchPlayerMedia).not.toHaveBeenCalled();
    expect(params.cleanupPlayer).not.toHaveBeenCalled();
    expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);

    rerender({
      source: 'source-b',
      id: 'id-b',
      detail: nextDetail,
      videoUrl: 'https://example.com/source-b.m3u8',
    });

    await waitFor(() => {
      expect(params.cleanupPlayer).toHaveBeenCalledTimes(1);
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(2);
    });
    expect(mockSwitchPlayerMedia).not.toHaveBeenCalled();
  });
});
