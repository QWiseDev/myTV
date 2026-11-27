'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';

import artplayerPluginChromecast from '@/lib/artplayer-plugin-chromecast';
import { SearchResult } from '@/lib/types';

import { useCustomAdFilterCode } from './useCustomAdFilterCode';
import type { MemoryPressure } from './useMemoryMonitor';
import type { SourceChangeOwner } from './useSourceSwitcher';
import {
  createArtplayerConfig,
  setupArtplayerGlobals,
} from '../utils/artplayerConfig';
import type { ArtplayerRuntimeModules } from '../utils/artplayerLoader';
import { loadArtplayerModules } from '../utils/artplayerLoader';
import {
  getOptimizedDanmakuConfig,
  saveDanmakuConfigToStorage,
} from '../utils/danmakuConfig';
import {
  type DanmakuItemLike,
  isDanmakuAbortError,
  recoverStoppedDanmaku,
  renderDanmakuList,
  resetDanmakuTimeline,
  showDanmakuErrorNotice,
} from '../utils/danmakuRuntime';
import {
  type DynamicBufferController,
  installDynamicBuffer,
} from '../utils/dynamicBuffer';
import { prefetchNextEpisodeMedia } from '../utils/episodePrefetch';
import { createAdFilterHlsLoader } from '../utils/hlsAdFilterLoader';
import type { HlsRuntimeInstance } from '../utils/hlsConfig';
import {
  restoreMutedVolumeOnFirstPlay,
  scheduleAutoPlayWithFallback,
} from '../utils/playerAutoPlay';
import { detectPlayerBrowserSupport } from '../utils/playerBrowserSupport';
import {
  type PlayerMediaSwitchResult,
  applyPlayerMediaSwitch,
  buildDisplayTitle,
  shouldRebuildPlayerForMediaSwitch,
  switchPlayerMedia,
} from '../utils/playerSwitch';
import {
  EXTERNAL_DANMU_LOAD_DELAY_MS,
  MEDIA_LOADING_TIMEOUT_MS,
} from '../utils/playerTimings';
import type { PlayArtplayer } from '../utils/playerTypes';
import { applyAllUiEnhancements } from '../utils/playerUiEnhancements';
import {
  type QualityControls,
  addSpeedControl,
  createQualityControls,
} from '../utils/qualitySelector';
import { markSourceFailedAndFindNext } from '../utils/sourceFailover';
import { installSuperResolution } from '../utils/superResolution';
import { getVideoErrorMessage } from '../utils/videoErrorMessage';

export type { PlayArtplayer } from '../utils/playerTypes';

const VIDEO_HAVE_CURRENT_DATA = 2;

/** 片尾最后这段时间内不保存进度，避免记录停在片尾字幕处 */
const NEAR_END_SKIP_SAVE_SECONDS = 180;
/** 只有足够长的视频才启用片尾跳过；短剧等短视频整片都不足阈值，必须照常保存 */
const NEAR_END_MIN_DURATION_SECONDS = NEAR_END_SKIP_SAVE_SECONDS * 2;

export function isNearVideoEnd(currentTime: number, duration: number): boolean {
  return (
    duration >= NEAR_END_MIN_DURATION_SECONDS &&
    duration - currentTime < NEAR_END_SKIP_SAVE_SECONDS
  );
}

type AnalyticsHandlers = {
  handlePlay: (position?: number, quality?: string) => void;
  handlePause: (
    position?: number,
    reason?: 'user' | 'buffering' | 'error',
  ) => void;
  trackProgress: (value: number) => void;
  handleVolumeChange: (volume: number) => void;
  handleSpeedChange: (speed: number) => void;
  handleBufferStart: () => void;
  handleBufferEnd: (duration: number) => void;
  handleSeek: (fromPosition: number, toPosition: number) => void;
  handleFullscreenToggle: (isFullscreen: boolean) => void;
  handleQualityChange: (fromQuality: string, toQuality: string) => void;
  handlePlayerError: (
    errorType: string,
    errorMessage: string,
    context?: Record<string, unknown>,
  ) => void;
};

type HlsConstructor = typeof import('hls.js').default;
type HlsConfigRuntime = typeof import('../utils/hlsConfig');
type DanmakuPluginSnapshot = {
  isHide?: boolean;
  isStop?: boolean;
  option?: unknown;
};
type HlsMediaVideo = HTMLVideoElement & {
  hls?: HlsRuntimeInstance | null;
};
type DanmakuConfigChange = {
  [key: string]: unknown;
  fontSize?: unknown;
  opacity?: unknown;
  speed?: unknown;
};

interface UsePlayerInitializerParams {
  videoUrl: string;
  loading: boolean;
  currentEpisodeIndex: number | null;
  artRef: MutableRefObject<HTMLDivElement | null>;
  detail: SearchResult | null;
  totalEpisodes: number;
  setError: (message: string | null) => void;
  userAgent: string;
  isIOSGlobal: boolean;
  isIOS13Global: boolean;
  isMobileGlobal: boolean;
  artPlayerRef: MutableRefObject<PlayArtplayer | null>;
  blockAdEnabled: boolean;
  blockAdEnabledRef: MutableRefObject<boolean>;
  setBlockAdEnabled: (value: boolean) => void;
  setCurrentEpisodeIndex: (index: number) => void;
  handleDanmuOperationOptimized: (enabled: boolean) => void;
  handleNextEpisode: () => void;
  handleSourceChange: (
    source: string,
    id: string,
    title: string,
    options?: { initiatedBy?: 'user' | 'auto' },
  ) => Promise<void> | void;
  currentSource: string;
  currentId: string;
  setAvailableSources: Dispatch<SetStateAction<SearchResult[]>>;
  availableSourcesRef: MutableRefObject<SearchResult[]>;
  setIsVideoLoading: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  videoTitle: string;
  videoCover: string;
  detailRef: MutableRefObject<SearchResult | null>;
  currentEpisodeIndexRef: MutableRefObject<number>;
  resumeTimeRef: MutableRefObject<number | null>;
  memoryPressure: MemoryPressure;
  externalDanmuEnabledRef: MutableRefObject<boolean>;
  throttledTimeUpdate: (duration: number) => void;
  saveCurrentPlayProgress: () => Promise<void> | void;
  lastSaveTimeRef: MutableRefObject<number>;
  lastVolumeRef: MutableRefObject<number>;
  lastPlaybackRateRef: MutableRefObject<number>;
  requestWakeLock: () => Promise<void> | void;
  releaseWakeLock: () => Promise<void> | void;
  analytics: AnalyticsHandlers;
  ensureVideoSource: (video: HTMLVideoElement | null, url: string) => void;
  loadExternalDanmuRef: MutableRefObject<
    (() => Promise<DanmakuItemLike[]>) | null
  >;
  switchPromiseRef: MutableRefObject<Promise<PlayerMediaSwitchResult> | null>;
  danmuPluginStateRef: MutableRefObject<DanmakuPluginSnapshot | null>;
  isSourceChangingRef: MutableRefObject<boolean>;
  sourceChangeOwnerRef: MutableRefObject<SourceChangeOwner | null>;
  isEpisodeChangingRef: MutableRefObject<boolean>;
  isSkipControllerTriggeredRef: MutableRefObject<boolean>;
  videoEndedHandledRef: MutableRefObject<boolean>;
  isRestoringFromRecordRef: MutableRefObject<boolean>;
  videoErrorHandlerRef: MutableRefObject<((e: Event) => void) | null>;
  cleanupPlayer: () => void;
  danmuEpisodeNum?: number;
  onDanmuEpisodeChange?: (offset: number) => void;
}

export function usePlayerInitializer(params: UsePlayerInitializerParams) {
  const [playerInstanceId, setPlayerInstanceId] = useState(0);
  const latestParamsRef = useRef(params);
  latestParamsRef.current = params;
  const customAdFilterCodeRef = useCustomAdFilterCode();
  const initializationGenerationRef = useRef(0);
  const mediaSessionRef = useRef(0);
  // 每个媒体只走一次自动播放兜底：canplay 在拖动进度/缓冲恢复后也会触发，
  // 若每次都 play()，暂停状态拖进度条会被自动恢复播放
  const autoPlayFallbackDoneRef = useRef(false);
  // 同一次媒体加载的故障（HLS 致命错误 / video 元素错误 / 播放器 error 常连环触发）
  // 只处理一次，避免后续调用解除换源锁并重启同一场自动换源
  const sourceFailureHandledRef = useRef(false);
  const mediaLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // 埋点辅助状态：卡顿起始时间 / 最近一次播放位置
  const bufferStartAtRef = useRef<number>(0);
  const lastPlayTimeRef = useRef<number>(0);
  const dynamicBufferRef = useRef<DynamicBufferController | null>(null);
  const nextEpisodePrefetchControllerRef = useRef<AbortController | null>(null);
  const prefetchedEpisodeUrlRef = useRef<string>('');

  const {
    videoUrl,
    loading,
    currentEpisodeIndex,
    currentSource: mediaSource,
    currentId: mediaId,
    artRef,
    memoryPressure: activeMemoryPressure,
  } = params;

  useEffect(() => {
    dynamicBufferRef.current?.setMemoryPressure(activeMemoryPressure);
  }, [activeMemoryPressure]);

  useEffect(() => {
    return () => {
      nextEpisodePrefetchControllerRef.current?.abort();
      nextEpisodePrefetchControllerRef.current = null;
      dynamicBufferRef.current?.dispose();
      dynamicBufferRef.current = null;
    };
  }, []);

  useEffect(() => {
    const generation = ++initializationGenerationRef.current;
    const mediaSession = ++mediaSessionRef.current;
    autoPlayFallbackDoneRef.current = false;
    sourceFailureHandledRef.current = false;
    prefetchedEpisodeUrlRef.current = '';
    nextEpisodePrefetchControllerRef.current?.abort();
    nextEpisodePrefetchControllerRef.current = null;
    const isCurrentInitialization = () =>
      initializationGenerationRef.current === generation;

    const clearMediaLoadingTimeout = () => {
      if (mediaLoadingTimeoutRef.current) {
        clearTimeout(mediaLoadingTimeoutRef.current);
        mediaLoadingTimeoutRef.current = null;
      }
    };

    const {
      detail,
      totalEpisodes,
      setError,
      userAgent,
      isIOSGlobal,
      isIOS13Global,
      isMobileGlobal,
      artPlayerRef,
      blockAdEnabled,
      blockAdEnabledRef,
      setBlockAdEnabled,
      setCurrentEpisodeIndex,
      handleDanmuOperationOptimized,
      handleNextEpisode,
      currentSource,
      setIsVideoLoading,
      setLoading,
      videoTitle,
      videoCover,
      detailRef,
      currentEpisodeIndexRef,
      resumeTimeRef,
      externalDanmuEnabledRef,
      lastSaveTimeRef,
      lastVolumeRef,
      lastPlaybackRateRef,
      requestWakeLock,
      releaseWakeLock,
      ensureVideoSource,
      loadExternalDanmuRef,
      switchPromiseRef,
      danmuPluginStateRef,
      isSourceChangingRef,
      sourceChangeOwnerRef,
      isEpisodeChangingRef,
      isSkipControllerTriggeredRef,
      videoEndedHandledRef,
      isRestoringFromRecordRef,
      videoErrorHandlerRef,
      cleanupPlayer,
      danmuEpisodeNum,
      onDanmuEpisodeChange,
    } = latestParamsRef.current;

    const showPlayerNotice = (message: string) => {
      if (artPlayerRef.current?.notice) {
        artPlayerRef.current.notice.show = message;
      }
    };

    const finishSourceSwitch = (_reason: string) => {
      if (!isSourceChangingRef.current) return;
      isSourceChangingRef.current = false;
      sourceChangeOwnerRef.current = null;
    };

    const handleCurrentSourceFailure = (
      finalNotice: string,
      options: { allowAutoSwitch?: boolean } = {},
    ) => {
      // HLS 致命错误、video 元素错误、播放器 error 会针对同一次失败连环触发，
      // 第一个事件已经完成标记失败/自动换源，后续事件只可能重复这一动作
      if (sourceFailureHandledRef.current) return;
      sourceFailureHandledRef.current = true;
      const allowAutoSwitch = options.allowAutoSwitch ?? true;
      const activeParams = latestParamsRef.current;
      const activeSource = activeParams.currentSource;
      const activeId = activeParams.currentId;
      const owner = sourceChangeOwnerRef.current;
      const isUserSwitchInFlight =
        isSourceChangingRef.current && owner?.by === 'user';
      const isUserSwitchTarget =
        !!owner && owner.source === activeSource && owner.id === activeId;
      const { sources, nextSource } = markSourceFailedAndFindNext(
        activeParams.availableSourcesRef.current,
        {
          source: activeSource,
          id: activeId,
        },
        {
          // 同集播放地址相同的源（常为同一 CDN 的多个聚合站）一并标记失败
          failedUrl: activeParams.videoUrl,
          episodeIndex: activeParams.currentEpisodeIndexRef.current,
        },
      );

      activeParams.availableSourcesRef.current = sources;
      activeParams.setAvailableSources(sources);

      if (isUserSwitchInFlight && !isUserSwitchTarget) {
        // 用户手动换源进行中，且报错的是旧播放器：只标记失败并提示，
        // 不自动跳转也不解除换源锁，避免劫持用户选择的切换目标
        showPlayerNotice(finalNotice);
        return;
      }

      finishSourceSwitch('当前源失败');

      if (allowAutoSwitch && nextSource) {
        activeParams.handleSourceChange(
          nextSource.source,
          nextSource.id,
          nextSource.title,
          {
            initiatedBy: 'auto',
          },
        );
        return;
      }

      showPlayerNotice(finalNotice);
    };

    const hasUnfailedAlternativeSource = () => {
      const active = latestParamsRef.current;
      return active.availableSourcesRef.current.some(
        (s) =>
          !s.failed &&
          !(s.source === active.currentSource && s.id === active.currentId),
      );
    };

    const scheduleMediaLoadingTimeout = (
      artPlayer: PlayArtplayer,
      graceExtended = false,
    ) => {
      clearMediaLoadingTimeout();

      const timeoutId = setTimeout(() => {
        if (mediaLoadingTimeoutRef.current === timeoutId) {
          mediaLoadingTimeoutRef.current = null;
        }
        if (
          mediaSessionRef.current !== mediaSession ||
          artPlayerRef.current !== artPlayer ||
          artPlayer.playing
        ) {
          return;
        }

        const activeParams = latestParamsRef.current;
        const mediaVideo = artPlayer.video as HTMLVideoElement | undefined;

        // 媒体数据已就绪只是自动播放被浏览器拦截时，不判源失败：
        // 否则移动端会把每个可用源都标成失败并来回切换，表现为「一直不播放」。
        if (
          mediaVideo &&
          mediaVideo.readyState >= VIDEO_HAVE_CURRENT_DATA &&
          mediaVideo.videoWidth > 0
        ) {
          setLoading(false);
          setIsVideoLoading(false);
          return;
        }

        // 无备用源可切且当前 HLS 已拉取清单或分片正在下载时，给一次额外缓冲宽限期
        const bufferSnapshot = dynamicBufferRef.current?.getSnapshot();
        if (
          !graceExtended &&
          !hasUnfailedAlternativeSource() &&
          bufferSnapshot?.hasActiveProgress
        ) {
          showPlayerNotice('当前源起播较慢，仍在努力缓冲中...');
          scheduleMediaLoadingTimeout(artPlayer, true);
          return;
        }

        setLoading(false);
        setIsVideoLoading(false);

        console.error('视频加载超时:', {
          url: activeParams.videoUrl,
          source: activeParams.currentSource,
          id: activeParams.currentId,
          episodeIndex: activeParams.currentEpisodeIndex,
        });

        handleCurrentSourceFailure(
          `视频加载超时 (${MEDIA_LOADING_TIMEOUT_MS / 1000}秒)\n地址: ${activeParams.videoUrl}\n\n没有更多播放源了`,
        );
      }, MEDIA_LOADING_TIMEOUT_MS);

      mediaLoadingTimeoutRef.current = timeoutId;
    };

    // 异步初始化播放器，避免SSR问题
    const initPlayer = async (
      { Artplayer, artplayerPluginDanmuku }: ArtplayerRuntimeModules,
      hlsRuntime: HlsConfigRuntime,
      Hls: HlsConstructor,
    ) => {
      if (
        !isCurrentInitialization() ||
        !Hls ||
        !videoUrl ||
        loading ||
        currentEpisodeIndex === null ||
        !artRef.current
      ) {
        return;
      }

      const CustomHlsJsLoader = createAdFilterHlsLoader(Hls, {
        blockAdEnabledRef,
        customAdFilterCodeRef,
        source: currentSource,
      });

      if (
        !detail ||
        !detail.episodes ||
        currentEpisodeIndex >= detail.episodes.length ||
        currentEpisodeIndex < 0
      ) {
        setError(`选集索引无效，当前共 ${totalEpisodes} 集`);
        return;
      }

      if (!videoUrl) {
        setError('视频地址无效');
        return;
      }

      const { isSafari, isIOS, isIOS13, isMobile, isWebKit, isChrome } =
        detectPlayerBrowserSupport({
          userAgent,
          isIOS: isIOSGlobal,
          isIOS13: isIOS13Global,
          isMobile: isMobileGlobal,
        });

      const existingArt = artPlayerRef.current;
      if (existingArt && !loading) {
        if (!isCurrentInitialization()) return;
        const isEpisodeChange = isEpisodeChangingRef.current;
        const isSourceChange = isSourceChangingRef.current;

        if (
          shouldRebuildPlayerForMediaSwitch({
            isEpisodeChange,
            isSourceChange,
          }) ||
          switchPromiseRef.current
        ) {
          switchPromiseRef.current = null;
          cleanupPlayer();
        } else {
          let switchPromise: ReturnType<typeof switchPlayerMedia> | null = null;

          try {
            scheduleMediaLoadingTimeout(existingArt);

            if (existingArt.plugins?.artplayerPluginDanmuku) {
              danmuPluginStateRef.current = {
                isHide: existingArt.plugins.artplayerPluginDanmuku.isHide,
                isStop: existingArt.plugins.artplayerPluginDanmuku.isStop,
                option: existingArt.plugins.artplayerPluginDanmuku.option,
              };
            }

            const currentTime = existingArt.currentTime || 0;
            const resumeTime = isEpisodeChange
              ? resumeTimeRef.current
              : resumeTimeRef.current || currentTime;

            switchPromise = switchPlayerMedia(existingArt, {
              videoUrl,
              title: videoTitle,
              poster: videoCover,
              episodeIndex: currentEpisodeIndex,
              episodeTitle: detail?.episodes_titles?.[currentEpisodeIndex],
              isEpisodeChange,
              resumeTime,
            });

            switchPromiseRef.current = switchPromise;
            const switchResult = await switchPromise;
            if (
              !isCurrentInitialization() ||
              artPlayerRef.current !== existingArt ||
              switchPromiseRef.current !== switchPromise
            ) {
              return;
            }

            applyPlayerMediaSwitch(existingArt, switchResult);

            if (isEpisodeChange) {
              isEpisodeChangingRef.current = false;
            }

            if (existingArt.video) {
              ensureVideoSource(
                existingArt.video as HTMLVideoElement,
                videoUrl,
              );
            }

            return;
          } catch (error) {
            if (
              !isCurrentInitialization() ||
              artPlayerRef.current !== existingArt
            ) {
              return;
            }
            console.warn('Switch方法失败，将重建播放器:', error);
            isEpisodeChangingRef.current = false;
            clearMediaLoadingTimeout();
            cleanupPlayer();
          } finally {
            if (switchPromise && switchPromiseRef.current === switchPromise) {
              switchPromiseRef.current = null;
            }
          }
        }
      }
      if (!isCurrentInitialization()) return;
      if (artPlayerRef.current) {
        cleanupPlayer();
      }

      if (!isCurrentInitialization()) return;
      if (artRef.current) {
        artRef.current.innerHTML = '';
      }

      try {
        let lastDanmakuRecoverAt = 0;
        const { handleHlsError, initAdaptiveHls } = hlsRuntime;

        setupArtplayerGlobals(Artplayer);

        const customType = {
          m3u8: function (video: HTMLVideoElement, url: string) {
            const hlsSession = mediaSessionRef.current;
            let hls: HlsRuntimeInstance | null = null;
            const isActiveHlsSession = () =>
              Boolean(hls) &&
              mediaSessionRef.current === hlsSession &&
              artPlayerRef.current?.video === video &&
              (video as HlsMediaVideo).hls === hls;

            hls = initAdaptiveHls(
              video,
              url,
              {
                deviceInfo: { isMobile, isIOS, isIOS13 },
                blockAdEnabled: blockAdEnabledRef.current,
                customLoader: CustomHlsJsLoader,
              },
              latestParamsRef.current.memoryPressure,
              (event, data) => {
                if (!isActiveHlsSession() || !hls) return;
                handleHlsError(
                  event,
                  data,
                  hls,
                  video,
                  (errorMessage: string) => {
                    setTimeout(() => {
                      if (!isActiveHlsSession()) return;
                      clearMediaLoadingTimeout();
                      setLoading(false);
                      setIsVideoLoading(false);
                      console.error('播放失败，详细错误信息:', errorMessage);
                      const displayMessage =
                        errorMessage.length > 100
                          ? `${errorMessage.substring(
                              0,
                              100,
                            )}...\n\n没有更多播放源了`
                          : errorMessage;
                      handleCurrentSourceFailure(displayMessage);
                    }, 100);
                  },
                );
              },
            );
            if (hls) {
              ensureVideoSource(video, url);
              dynamicBufferRef.current?.attachHls(hls);
            }
          },
        };

        // 移动端也注入：按钮由 relocateCornerControlsOnMobile 和画中画
        // 一起挪到播放器右上角，不占控制栏空间（playerUiEnhancements.ts）
        const chromecastConfig =
          isChrome && !isIOS
            ? artplayerPluginChromecast({
                onStateChange: () => {
                  /* no-op */
                },
                onCastAvailable: () => {
                  /* no-op */
                },
                onCastStart: () => {
                  /* no-op */
                },
                onError: (error) => {
                  console.error('Chromecast error:', error);
                },
              })
            : undefined;

        const playerConfig = createArtplayerConfig({
          container: artRef.current,
          url: videoUrl,
          poster: videoCover,
          isIOS,
          isSafari,
          isChrome,
          isMobile,
          blockAdEnabled,
          blockAdEnabledRef,
          externalDanmuEnabledRef,
          onBlockAdToggle: setBlockAdEnabled,
          onDanmuToggle: handleDanmuOperationOptimized,
          onNextEpisode: handleNextEpisode,
          artPlayerRef,
          resumeTimeRef,
          customType,
          danmakuConfig: artplayerPluginDanmuku(
            getOptimizedDanmakuConfig(isMobile),
          ),
          chromecastConfig,
          danmuEpisodeNum, // 🎯 新增
          onDanmuEpisodeChange, // 🎯 新增
        });

        artPlayerRef.current = new Artplayer(playerConfig) as PlayArtplayer;
        const artPlayer = artPlayerRef.current;
        let readyDanmuTimer: ReturnType<typeof setTimeout> | null = null;
        // 通知依赖播放器实例的子组件（如 SkipController / PlayerContainer）重绑监听
        setPlayerInstanceId((id) => id + 1);
        // 左上角初始标题：与换集后的 displayTitle 保持同一格式（换集由 applyPlayerMediaSwitch 更新）
        artPlayer.title = buildDisplayTitle(
          videoTitle,
          currentEpisodeIndex,
          detail?.episodes_titles?.[currentEpisodeIndex],
        );
        installSuperResolution(artPlayer);
        dynamicBufferRef.current?.dispose();
        const dynamicBuffer = installDynamicBuffer(artPlayer, {
          deviceInfo: { isMobile, isIOS, isIOS13 },
          getMemoryPressure: () => latestParamsRef.current.memoryPressure,
          getSourceKey: () => latestParamsRef.current.currentSource,
          getStreamUrl: () => latestParamsRef.current.videoUrl,
          hasAlternativeSource: hasUnfailedAlternativeSource,
        });
        dynamicBufferRef.current = dynamicBuffer;
        const originalDestroyForBuffer = artPlayer.destroy;
        artPlayer.destroy = function (removeHtml?: boolean) {
          if (readyDanmuTimer) {
            clearTimeout(readyDanmuTimer);
            readyDanmuTimer = null;
          }
          nextEpisodePrefetchControllerRef.current?.abort();
          nextEpisodePrefetchControllerRef.current = null;
          dynamicBuffer.dispose();
          if (dynamicBufferRef.current === dynamicBuffer) {
            dynamicBufferRef.current = null;
          }
          return originalDestroyForBuffer.call(this, removeHtml);
        };
        // 播放器实例在换集/换源时会复用；事件监听必须跨 effect generation 保持生效。
        // generation 只约束尚未提交的异步初始化，实例事件只校验当前播放器身份。
        const isActivePlayer = () => artPlayerRef.current === artPlayer;
        scheduleMediaLoadingTimeout(artPlayer);

        const videoElement = artPlayer.video as HTMLVideoElement;
        const clearVideoLoadingWhenRenderable = (reason: string) => {
          if (!isActivePlayer()) return false;
          if (
            videoElement.readyState >= VIDEO_HAVE_CURRENT_DATA &&
            videoElement.videoWidth > 0 &&
            videoElement.videoHeight > 0
          ) {
            clearMediaLoadingTimeout();
            setIsVideoLoading(false);
            finishSourceSwitch(reason);
            return true;
          }

          return false;
        };
        const videoRenderableHandler = () => {
          clearVideoLoadingWhenRenderable('视频原生事件可渲染');
        };

        videoElement.addEventListener('loadeddata', videoRenderableHandler, {
          once: true,
        });
        videoElement.addEventListener('canplay', videoRenderableHandler, {
          once: true,
        });
        videoElement.addEventListener('playing', videoRenderableHandler, {
          once: true,
        });
        queueMicrotask(() => {
          clearVideoLoadingWhenRenderable('视频已可渲染');
        });

        const videoErrorHandler = (e: Event) => {
          if (!isActivePlayer()) return;
          const video = e.target as HTMLVideoElement;
          const error = video.error;

          if (!error) {
            return;
          }

          console.error('视频元素错误:', {
            code: error.code,
            message: error.message,
            videoUrl: video.currentSrc || video.src,
          });

          latestParamsRef.current.analytics.handlePlayerError(
            'video_element_error',
            error.message,
            {
              error_code: error.code,
            },
          );

          setIsVideoLoading(false);
          clearMediaLoadingTimeout();

          handleCurrentSourceFailure(getVideoErrorMessage(error));
        };

        videoErrorHandlerRef.current = videoErrorHandler;
        videoElement.addEventListener('error', videoErrorHandler);

        applyAllUiEnhancements(artPlayerRef);

        artPlayer.on('ready', async () => {
          if (!isActivePlayer()) return;
          clearMediaLoadingTimeout();
          setError(null);

          // ✅ 控制栏「画质」「倍速」按钮（参考爱奇艺：文字按钮 + 上浮选择面板）
          // 单码率源也显示画质按钮（展示实际分辨率），多码率源额外提供切换项。
          // 换集复用播放器时不会再次触发 ready，控件内部监听 restart/media 事件，
          // 按当前 hls 实例重建自己，因此这里只负责首次注入与统一销毁。
          try {
            const qualityArt = artPlayer as PlayArtplayer & {
              __qualityControls?: QualityControls;
            };

            if (!qualityArt.__qualityControls) {
              const qualityControls = createQualityControls(
                artPlayer,
                (fromLabel, toLabel) =>
                  // 手动选档：auto 标记由实现侧默认为 false
                  latestParamsRef.current.analytics.handleQualityChange(
                    fromLabel,
                    toLabel,
                  ),
              );
              qualityArt.__qualityControls = qualityControls;
              const cleanupSpeed = addSpeedControl(artPlayer);

              const originalDestroy = artPlayer.destroy;
              artPlayer.destroy = function (removeHtml?: boolean) {
                qualityControls.dispose();
                cleanupSpeed?.();
                return originalDestroy.call(this, removeHtml);
              };
            }

            qualityArt.__qualityControls.sync();
          } catch (error) {
            console.warn('⚠️ 初始化控制栏画质/倍速按钮失败:', error);
          }

          if (isIOS || isSafari) {
            restoreMutedVolumeOnFirstPlay(artPlayer, {
              isActivePlayer,
              lastVolumeRef,
            });
          }

          if (externalDanmuEnabledRef.current) {
            if (readyDanmuTimer) {
              clearTimeout(readyDanmuTimer);
            }
            readyDanmuTimer = setTimeout(async () => {
              readyDanmuTimer = null;
              if (!isActivePlayer() || !externalDanmuEnabledRef.current) return;

              try {
                // 🔥 使用 ref.current 获取最新的弹幕加载函数，避免闭包过期
                const loadDanmuFn = loadExternalDanmuRef.current;
                if (!loadDanmuFn) {
                  console.warn('⚠️ loadExternalDanmu 函数未初始化');
                  return;
                }

                if (!artPlayer.plugins?.artplayerPluginDanmuku) {
                  return;
                }

                const danmaku = await loadDanmuFn();
                if (!isActivePlayer() || !externalDanmuEnabledRef.current) {
                  return;
                }

                renderDanmakuList(artPlayer, danmaku, {
                  preserveHidden: false,
                  showNotice: true,
                });
              } catch (error) {
                if (!isActivePlayer() || !externalDanmuEnabledRef.current) {
                  return;
                }
                if (isDanmakuAbortError(error)) return;
                console.error('加载外部弹幕失败:', error);
                showDanmakuErrorNotice(artPlayer, error);
              }
            }, EXTERNAL_DANMU_LOAD_DELAY_MS);
          }

          artPlayer.on('artplayerPluginDanmuku:show', () => {
            if (!isActivePlayer()) return;
            localStorage.setItem('danmaku_visible', 'true');
          });

          artPlayer.on('artplayerPluginDanmuku:hide', () => {
            if (!isActivePlayer()) return;
            localStorage.setItem('danmaku_visible', 'false');
          });

          artPlayer.on(
            'artplayerPluginDanmuku:config',
            (option: DanmakuConfigChange) => {
              if (!isActivePlayer()) return;
              saveDanmakuConfigToStorage(option);
            },
          );
        });

        artPlayer.on('play', () => {
          if (!isActivePlayer()) return;
          requestWakeLock();
          latestParamsRef.current.analytics.handlePlay(
            artPlayer.currentTime || 0,
          );
        });

        artPlayer.on('pause', () => {
          if (!isActivePlayer()) return;
          releaseWakeLock();
          const currentTime = artPlayer.currentTime || 0;
          const duration = artPlayer.duration || 0;

          if (!isNearVideoEnd(currentTime, duration)) {
            latestParamsRef.current.saveCurrentPlayProgress();
          }

          latestParamsRef.current.analytics.handlePause(currentTime, 'user');
        });

        const handleVideoEnded = () => {
          if (!isActivePlayer()) return;
          releaseWakeLock();
          latestParamsRef.current.analytics.trackProgress(100);

          if (!isActivePlayer()) return;
          const idx = currentEpisodeIndexRef.current;

          if (videoEndedHandledRef.current) {
            return;
          }

          if (isSkipControllerTriggeredRef.current) {
            videoEndedHandledRef.current = true;
            setTimeout(() => {
              if (isActivePlayer()) {
                isSkipControllerTriggeredRef.current = false;
              }
            }, 2000);
            return;
          }

          const d = detailRef.current;
          if (d && d.episodes && idx < d.episodes.length - 1) {
            videoEndedHandledRef.current = true;
            setTimeout(() => {
              if (isActivePlayer()) {
                setCurrentEpisodeIndex(idx + 1);
              }
            }, 1000);
          }
        };

        artPlayer.on('video:ended', handleVideoEnded);

        if (!artPlayer.paused) {
          requestWakeLock();
        }

        artPlayer.on('video:volumechange', () => {
          if (!isActivePlayer()) return;
          lastVolumeRef.current = artPlayer.volume;
          latestParamsRef.current.analytics.handleVolumeChange(
            artPlayer.volume,
          );
        });
        artPlayer.on('video:ratechange', () => {
          if (!isActivePlayer()) return;
          lastPlaybackRateRef.current = artPlayer.playbackRate;
          latestParamsRef.current.analytics.handleSpeedChange(
            artPlayer.playbackRate,
          );
        });

        // 缓冲卡顿统计（waiting → playing 为一次完整卡顿）
        artPlayer.on('video:waiting', () => {
          if (!isActivePlayer()) return;
          if (bufferStartAtRef.current === 0) {
            bufferStartAtRef.current = Date.now();
            latestParamsRef.current.analytics.handleBufferStart();
          }
        });
        artPlayer.on('video:playing', () => {
          if (!isActivePlayer()) return;
          if (bufferStartAtRef.current > 0) {
            latestParamsRef.current.analytics.handleBufferEnd(
              Date.now() - bufferStartAtRef.current,
            );
            bufferStartAtRef.current = 0;
          }
        });

        // 全屏切换埋点
        artPlayer.on('fullscreen', (flag: boolean) => {
          if (!isActivePlayer()) return;
          latestParamsRef.current.analytics.handleFullscreenToggle(!!flag);
        });

        artPlayer.on('video:canplay', () => {
          if (!isActivePlayer()) return;
          clearMediaLoadingTimeout();
          setIsVideoLoading(false);
          finishSourceSwitch('视频可播放');
          videoEndedHandledRef.current = false;

          let restoredFromRecord = false;

          if (resumeTimeRef.current && resumeTimeRef.current > 0) {
            try {
              const duration = artPlayer.duration || 0;
              let target = resumeTimeRef.current;

              if (duration && !Number.isNaN(duration) && duration > 0) {
                if (target >= duration - 2) {
                  target = Math.max(0, duration - 5);
                }
              }

              const videoElement = artPlayer.video || artPlayer.$video;
              if (videoElement) {
                videoElement.currentTime = target;
              }
              artPlayer.currentTime = target;
              resetDanmakuTimeline(artPlayer);

              resumeTimeRef.current = null;
              restoredFromRecord = true;
            } catch (err) {
              console.error('❌ 恢复播放进度失败:', err);
              resumeTimeRef.current = null;
            }
          }

          if (restoredFromRecord || !resumeTimeRef.current) {
            isRestoringFromRecordRef.current = false;
          }

          // 自动播放兜底与音量/倍速回填只在换媒体后的首个 canplay 执行一次；
          // canplay 在拖动进度、缓冲恢复后也会触发，重复执行会
          // 把暂停中的播放器自动恢复播放，并清掉刚弹出的提示
          if (!autoPlayFallbackDoneRef.current) {
            autoPlayFallbackDoneRef.current = true;

            // 所有平台都走一遍自动播放兜底：Android Chrome 等移动端
            // 会拦截非静音自动播放，兜底负责静音起播并在起播后恢复声音
            scheduleAutoPlayWithFallback(artPlayer, {
              isActivePlayer,
              lastVolumeRef,
            });

            setTimeout(() => {
              if (!isActivePlayer()) return;
              if (Math.abs(artPlayer.volume - lastVolumeRef.current) > 0.01) {
                artPlayer.volume = lastVolumeRef.current;
              }
              if (
                Math.abs(artPlayer.playbackRate - lastPlaybackRateRef.current) >
                  0.01 &&
                isWebKit
              ) {
                artPlayer.playbackRate = lastPlaybackRateRef.current;
              }
              artPlayer.notice.show = '';
            }, 0);
          }

          setIsVideoLoading(false);
          finishSourceSwitch('播放器就绪');

          if (isEpisodeChangingRef.current) {
            isEpisodeChangingRef.current = false;
          }
        });

        artPlayer.on('error', (err: unknown) => {
          if (!isActivePlayer()) return;
          console.error('播放器错误:', err);

          clearMediaLoadingTimeout();
          setIsVideoLoading(false);

          if (artPlayer.currentTime > 0) {
            handleCurrentSourceFailure('播放失败，请切换其他播放源', {
              allowAutoSwitch: false,
            });
            return;
          }

          handleCurrentSourceFailure('播放失败，没有更多播放源了');
        });

        artPlayer.on('video:timeupdate', () => {
          if (!isActivePlayer()) return;
          const currentTime = artPlayer.currentTime || 0;
          const duration = artPlayer.duration || 0;

          lastPlayTimeRef.current = currentTime;
          latestParamsRef.current.throttledTimeUpdate(duration);
          lastDanmakuRecoverAt = recoverStoppedDanmaku(
            artPlayer,
            Date.now(),
            lastDanmakuRecoverAt,
          );

          const saveNow = Date.now();
          const interval =
            process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash' ? 30000 : 10000;

          const isNearEnd = isNearVideoEnd(currentTime, duration);

          if (saveNow - lastSaveTimeRef.current > interval && !isNearEnd) {
            latestParamsRef.current.saveCurrentPlayProgress();
            lastSaveTimeRef.current = saveNow;
          }

          // 临近片尾时提前预热下一集清单与首片，缩短连播切集等待
          const d = detailRef.current;
          const idx = currentEpisodeIndexRef.current;
          const nextEpisodeUrl = d?.episodes?.[idx + 1]?.trim();
          const bufferSnapshot = dynamicBufferRef.current?.getSnapshot();
          if (
            nextEpisodeUrl &&
            nextEpisodeUrl !== prefetchedEpisodeUrlRef.current &&
            duration >= 60 &&
            currentTime > 0 &&
            duration - currentTime <= 25 &&
            duration - currentTime > 1 &&
            !artPlayer.paused &&
            latestParamsRef.current.memoryPressure === 'low' &&
            bufferSnapshot?.strategy !== 'balanced' &&
            bufferSnapshot?.speedTier !== 'very_slow'
          ) {
            prefetchedEpisodeUrlRef.current = nextEpisodeUrl;
            nextEpisodePrefetchControllerRef.current?.abort();
            const controller = new AbortController();
            nextEpisodePrefetchControllerRef.current = controller;
            void prefetchNextEpisodeMedia(nextEpisodeUrl, {
              sourceKey: latestParamsRef.current.currentSource,
              adFilterType: latestParamsRef.current.currentSource,
              signal: controller.signal,
            });
          }
        });

        artPlayer.on('video:seeked', () => {
          if (!isActivePlayer()) return;
          resetDanmakuTimeline(artPlayer);
          // 拖动进度条埋点：拖动距离基于 timeupdate 维护的最近播放位置
          const to = artPlayer.currentTime || 0;
          latestParamsRef.current.analytics.handleSeek(
            lastPlayTimeRef.current,
            to,
          );
          lastPlayTimeRef.current = to;
        });

        if (artPlayer.video) {
          ensureVideoSource(artPlayer.video as HTMLVideoElement, videoUrl);
        }
      } catch (err) {
        if (!isCurrentInitialization()) return;
        console.error('创建播放器失败:', err);
        finishSourceSwitch('播放器初始化失败');
        isEpisodeChangingRef.current = false;
        setIsVideoLoading(false);
        setError('播放器初始化失败');
      }
    };

    const loadAndInit = async () => {
      const expectedVideoUrl =
        detail?.episodes &&
        currentEpisodeIndex !== null &&
        currentEpisodeIndex >= 0 &&
        currentEpisodeIndex < detail.episodes.length
          ? detail.episodes[currentEpisodeIndex]?.trim() || ''
          : null;

      // 选集会先更新 episodeIndex，再由 useEpisodeDanmuSync 写入对应 URL。
      // 过渡 render 仍携带旧 URL，必须等待下一次 render，避免对旧媒体误发 switch。
      if (expectedVideoUrl !== null && videoUrl.trim() !== expectedVideoUrl) {
        return;
      }

      if (expectedVideoUrl === '') {
        setError('视频地址无效');
        return;
      }

      try {
        const [artplayerModules, hlsRuntime, hlsModule] = await Promise.all([
          loadArtplayerModules(),
          import('../utils/hlsConfig'),
          import('hls.js'),
        ]);
        if (!isCurrentInitialization()) return;
        await initPlayer(artplayerModules, hlsRuntime, hlsModule.default);
      } catch (error) {
        if (!isCurrentInitialization()) return;
        console.error('动态导入 ArtPlayer 失败:', error);
        finishSourceSwitch('播放器模块加载失败');
        setIsVideoLoading(false);
        setError('播放器加载失败');
      }
    };

    void loadAndInit();
    return () => {
      if (initializationGenerationRef.current === generation) {
        initializationGenerationRef.current += 1;
      }
      nextEpisodePrefetchControllerRef.current?.abort();
      nextEpisodePrefetchControllerRef.current = null;
      clearMediaLoadingTimeout();
    };
  }, [
    videoUrl,
    artRef,
    loading, // 需要loading状态来判断是否初始化播放器
    currentEpisodeIndex, // 需要集数索引来验证播放条件
    mediaSource,
    mediaId,
    customAdFilterCodeRef, // 稳定 ref（非裸 useRef，需显式声明以通过 exhaustive-deps）
    // 其他状态通过 ref 访问，避免不必要的重新初始化
  ]);

  return { playerInstanceId };
}
