import { act, renderHook, waitFor } from '@testing-library/react';

import { usePlayerInitializer } from './usePlayerInitializer';
import { loadArtplayerModules } from '../utils/artplayerLoader';

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
    externalDanmuEnabled: false,
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

function createMockPlayer(handlers: Map<string, (...args: unknown[]) => void>) {
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
    }),
    off: jest.fn(),
    destroy: jest.fn(),
    play: jest.fn().mockResolvedValue(undefined),
    paused: true,
    playing: false,
    muted: false,
    currentTime: 0,
    duration: 1000,
    volume: 0.7,
    playbackRate: 1,
  };
}

describe('usePlayerInitializer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSwitchPlayerMedia.mockResolvedValue(undefined);
    localStorage.clear();
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: jest.fn().mockResolvedValue({ ok: false }),
    });
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

  test('keeps committed player events active when media is switched in place', async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const player = createMockPlayer(handlers);
    mockArtplayerConstructor.mockImplementation(() => player);
    (loadArtplayerModules as jest.Mock).mockResolvedValue({
      Artplayer: mockArtplayerConstructor,
      artplayerPluginDanmuku: jest.fn(() => ({})),
    });

    const params = createParams('https://example.com/episode-1.m3u8');
    const { rerender } = renderHook(
      ({ videoUrl }) =>
        usePlayerInitializer({
          ...params,
          videoUrl,
        }),
      { initialProps: { videoUrl: 'https://example.com/episode-1.m3u8' } },
    );

    await waitFor(() => {
      expect(mockArtplayerConstructor).toHaveBeenCalledTimes(1);
      expect(handlers.has('video:canplay')).toBe(true);
    });

    const setIsVideoLoading = params.setIsVideoLoading as jest.Mock;
    setIsVideoLoading.mockClear();

    rerender({ videoUrl: 'https://example.com/episode-2.m3u8' });
    await waitFor(() => {
      expect(mockSwitchPlayerMedia).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handlers.get('video:canplay')?.();
    });

    expect(setIsVideoLoading).toHaveBeenCalledWith(false);
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
});
