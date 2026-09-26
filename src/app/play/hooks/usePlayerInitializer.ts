'use client';

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';
import { useEffect, useRef } from 'react';

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
import { getOptimizedDanmakuConfig, saveDanmakuConfigToStorage } from '../utils/danmakuConfig';
import {
  type DanmakuItemLike,
  isDanmakuAbortError,
  recoverStoppedDanmaku,
  renderDanmakuList,
  resetDanmakuTimeline,
  showDanmakuErrorNotice,
} from '../utils/danmakuRuntime';
import { createAdFilterHlsLoader } from '../utils/hlsAdFilterLoader';
import type { HlsRuntimeInstance } from '../utils/hlsConfig';
import { restoreMutedVolumeOnFirstPlay, scheduleAutoPlayWithFallback } from '../utils/playerAutoPlay';
import { detectPlayerBrowserSupport } from '../utils/playerBrowserSupport';
import {
  type PlayerMediaSwitchResult,
  applyPlayerMediaSwitch,
  shouldRebuildPlayerForMediaSwitch,
  switchPlayerMedia,
} from '../utils/playerSwitch';
import {
  EXTERNAL_DANMU_LOAD_DELAY_MS,
  MEDIA_LOADING_TIMEOUT_MS,
} from '../utils/playerTimings';
import type { PlayArtplayer } from '../utils/playerTypes';
import {
  addResolutionDisplay,
  applyAllUiEnhancements,
} from '../utils/playerUiEnhancements';
import { markSourceFailedAndFindNext } from '../utils/sourceFailover';
import { installSuperResolution } from '../utils/superResolution';
import { getVideoErrorMessage } from '../utils/videoErrorMessage';

export type { PlayArtplayer } from '../utils/playerTypes';

const VIDEO_HAVE_CURRENT_DATA = 2;

type AnalyticsHandlers = {
  handlePlay: (position?: number, quality?: string) => void;
  handlePause: (
    position?: number,
    reason?: 'user' | 'buffering' | 'error',
  ) => void;
  trackProgress: (value: number) => void;
  handleVolumeChange: (volume: number) => void;
  handleSpeedChange: (speed: number) => void;
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
  // 🎯 新增：弹幕集数调整
  danmuEpisodeNum: number;
  onDanmuEpisodeChange: (offset: number) => void;
}

export function usePlayerInitializer(params: UsePlayerInitializerParams) {
  const latestParamsRef = useRef(params);
  latestParamsRef.current = params;
  const customAdFilterCodeRef = useCustomAdFilterCode();
  const initializationGenerationRef = useRef(0);
  const mediaSessionRef = useRef(0);
  const mediaLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const {
    videoUrl,
    loading,
    currentEpisodeIndex,
    currentSource: mediaSource,
    currentId: mediaId,
    artRef,
  } = params;

  useEffect(() => {
    const generation = ++initializationGenerationRef.current;
    const mediaSession = ++mediaSessionRef.current;
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
      handleSourceChange,
      currentSource,
      currentId,
      setAvailableSources,
      availableSourcesRef,
      setIsVideoLoading,
      setLoading,
      videoTitle,
      videoCover,
      detailRef,
      currentEpisodeIndexRef,
      resumeTimeRef,
      memoryPressure,
      externalDanmuEnabledRef,
      throttledTimeUpdate,
      saveCurrentPlayProgress,
      lastSaveTimeRef,
      lastVolumeRef,
      lastPlaybackRateRef,
      requestWakeLock,
      releaseWakeLock,
      analytics,
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
      const allowAutoSwitch = options.allowAutoSwitch ?? true;
      const owner = sourceChangeOwnerRef.current;
      const isUserSwitchInFlight =
        isSourceChangingRef.current && owner?.by === 'user';
      const isUserSwitchTarget =
        !!owner && owner.source === currentSource && owner.id === currentId;
      const { sources, nextSource } = markSourceFailedAndFindNext(
        availableSourcesRef.current,
        {
          source: currentSource,
          id: currentId,
        },
      );

      availableSourcesRef.current = sources;
      setAvailableSources(sources);

      if (isUserSwitchInFlight && !isUserSwitchTarget) {
        // 用户手动换源进行中，且报错的是旧播放器：只标记失败并提示，
        // 不自动跳转也不解除换源锁，避免劫持用户选择的切换目标
        showPlayerNotice(finalNotice);
        return;
      }

      finishSourceSwitch('当前源失败');

      if (allowAutoSwitch && nextSource) {
        handleSourceChange(nextSource.source, nextSource.id, nextSource.title, {
          initiatedBy: 'auto',
        });
        return;
      }

      showPlayerNotice(finalNotice);
    };

    const scheduleMediaLoadingTimeout = (artPlayer: PlayArtplayer) => {
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
              memoryPressure,
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
            }
          },
        };

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
        installSuperResolution(artPlayer);
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

          // ✅ 添加分辨率显示
          try {
            const video = artPlayer.video as HTMLVideoElement;
            const hlsInstance = (video as HlsMediaVideo).hls;

            if (hlsInstance || videoUrl) {
              const cleanupResolution = addResolutionDisplay(
                artPlayer,
                hlsInstance,
                videoUrl,
              );

              // 保存清理函数
              if (cleanupResolution) {
                const originalDestroy = artPlayer.destroy;
                artPlayer.destroy = function (removeHtml?: boolean) {
                  cleanupResolution();
                  return originalDestroy.call(this, removeHtml);
                };
              }
            }
          } catch (error) {
            console.warn('⚠️ 初始化分辨率显示失败:', error);
          }

          if (isIOS || isSafari) {
            restoreMutedVolumeOnFirstPlay(artPlayer, {
              isActivePlayer,
              lastVolumeRef,
            });
          }

          if (externalDanmuEnabledRef.current) {
            setTimeout(async () => {
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
          analytics.handlePlay(artPlayer.currentTime || 0);
        });

        artPlayer.on('pause', () => {
          if (!isActivePlayer()) return;
          releaseWakeLock();
          const currentTime = artPlayer.currentTime || 0;
          const duration = artPlayer.duration || 0;
          const remainingTime = duration - currentTime;
          const isNearEnd = duration > 0 && remainingTime < 180;

          if (!isNearEnd) {
            saveCurrentPlayProgress();
          }

          analytics.handlePause(currentTime, 'user');
        });

        const handleVideoEnded = () => {
          if (!isActivePlayer()) return;
          releaseWakeLock();
          analytics.trackProgress(100);

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
          analytics.handleVolumeChange(artPlayer.volume);
        });
        artPlayer.on('video:ratechange', () => {
          if (!isActivePlayer()) return;
          lastPlaybackRateRef.current = artPlayer.playbackRate;
          analytics.handleSpeedChange(artPlayer.playbackRate);
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

          if (isIOS || isSafari) {
            scheduleAutoPlayWithFallback(artPlayer, {
              isActivePlayer,
              lastVolumeRef,
            });
          }

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

          throttledTimeUpdate(duration);
          lastDanmakuRecoverAt = recoverStoppedDanmaku(
            artPlayer,
            Date.now(),
            lastDanmakuRecoverAt,
          );

          const saveNow = Date.now();
          const interval =
            process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash' ? 30000 : 10000;

          const remainingTime = duration - currentTime;
          const isNearEnd = duration > 0 && remainingTime < 180;

          if (saveNow - lastSaveTimeRef.current > interval && !isNearEnd) {
            saveCurrentPlayProgress();
            lastSaveTimeRef.current = saveNow;
          }
        });

        artPlayer.on('video:seeked', () => {
          if (!isActivePlayer()) return;
          resetDanmakuTimeline(artPlayer);
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
      if (
        expectedVideoUrl !== null &&
        videoUrl.trim() !== expectedVideoUrl
      ) {
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
}
