'use client';

import type Artplayer from 'artplayer';
import type { HlsConfig } from 'hls.js';
import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useEffect,
  useRef,
} from 'react';

import artplayerPluginChromecast from '@/lib/artplayer-plugin-chromecast';
import { SearchResult } from '@/lib/types';

import type { MemoryPressure } from './useMemoryMonitor';
import {
  createArtplayerConfig,
  setupArtplayerGlobals,
} from '../utils/artplayerConfig';
import type { ArtplayerRuntimeModules } from '../utils/artplayerLoader';
import { loadArtplayerModules } from '../utils/artplayerLoader';
import { getOptimizedDanmakuConfig } from '../utils/danmakuConfig';
import {
  type ArtPlayerLike,
  type DanmakuItemLike,
  loadAndRenderDanmaku,
  recoverStoppedDanmaku,
  resetDanmakuTimeline,
  showDanmakuErrorNotice,
} from '../utils/danmakuRuntime';
import { filterAdsFromM3U8 } from '../utils/helpers';
import type { HlsRuntimeInstance } from '../utils/hlsConfig';
import { stripMpegTsPrefix } from '../utils/mpegTs';
import { detectPlayerBrowserSupport } from '../utils/playerBrowserSupport';
import {
  shouldRebuildPlayerForMediaSwitch,
  switchPlayerMedia,
} from '../utils/playerSwitch';
import {
  addResolutionDisplay,
  applyAllUiEnhancements,
} from '../utils/playerUiEnhancements';
import { markSourceFailedAndFindNext } from '../utils/sourceFailover';
import { getVideoErrorMessage } from '../utils/videoErrorMessage';

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
type HlsLoaderContext = {
  type?: string;
};
type HlsLoaderResponse = {
  data?: unknown;
};
type HlsLoaderCallbacks = {
  onSuccess?: (
    response: HlsLoaderResponse,
    stats: unknown,
    context: HlsLoaderContext,
    networkDetails: unknown,
  ) => void;
};
type HlsMediaVideo = HTMLVideoElement & {
  hls?: HlsRuntimeInstance | null;
};
type DanmakuConfigChange = {
  fontSize?: unknown;
  opacity?: unknown;
  speed?: unknown;
};
export type PlayArtplayer = Artplayer &
  ArtPlayerLike & {
    notice: {
      show: string;
    };
    $video?: HTMLVideoElement;
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
  externalDanmuEnabled: boolean;
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
  sourceSwitchTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  switchPromiseRef: MutableRefObject<Promise<void> | null>;
  danmuPluginStateRef: MutableRefObject<DanmakuPluginSnapshot | null>;
  isSourceChangingRef: MutableRefObject<boolean>;
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

  const { videoUrl, loading, currentEpisodeIndex, artRef } = params;

  useEffect(() => {
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
      externalDanmuEnabled,
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
      sourceSwitchTimeoutRef,
      switchPromiseRef,
      danmuPluginStateRef,
      isSourceChangingRef,
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

    const finishSourceSwitch = (reason: string) => {
      if (!isSourceChangingRef.current) return;
      isSourceChangingRef.current = false;
      console.log(`✅ 源切换状态已重置: ${reason}`);
    };

    const handleCurrentSourceFailure = (
      finalNotice: string,
      options: { allowAutoSwitch?: boolean } = {},
    ) => {
      const allowAutoSwitch = options.allowAutoSwitch ?? true;
      const { sources, nextSource } = markSourceFailedAndFindNext(
        availableSourcesRef.current,
        {
          source: currentSource,
          id: currentId,
        },
      );

      availableSourcesRef.current = sources;
      setAvailableSources(sources);

      if (allowAutoSwitch && nextSource) {
        finishSourceSwitch('当前源失败，允许自动换源');
        console.log(`🔄 自动切换到下一个播放源: ${nextSource.source_name}`);
        handleSourceChange(nextSource.source, nextSource.id, nextSource.title);
        return;
      }

      showPlayerNotice(finalNotice);
    };

    // 异步初始化播放器，避免SSR问题
    const initPlayer = async (
      { Artplayer, artplayerPluginDanmuku }: ArtplayerRuntimeModules,
      hlsRuntime: HlsConfigRuntime,
      Hls: HlsConstructor,
    ) => {
      if (
        !Hls ||
        !videoUrl ||
        loading ||
        currentEpisodeIndex === null ||
        !artRef.current
      ) {
        return;
      }

      class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
        constructor(config: HlsConfig) {
          super(config);
          const load = this.load.bind(this);
          this.load = function (
            context: HlsLoaderContext,
            conf: unknown,
            callbacks: HlsLoaderCallbacks,
          ) {
            if (context.type === 'manifest' || context.type === 'level') {
              const onSuccess = callbacks.onSuccess;
              if (typeof onSuccess === 'function') {
                callbacks.onSuccess = function (
                  response: HlsLoaderResponse,
                  stats: unknown,
                  ctx: HlsLoaderContext,
                ) {
                  if (
                    blockAdEnabledRef.current &&
                    response.data &&
                    typeof response.data === 'string'
                  ) {
                    response.data = filterAdsFromM3U8(response.data);
                  }
                  return onSuccess(response, stats, ctx, null);
                };
              }
            } else if (context.type === 'fragment') {
              const onSuccess = callbacks.onSuccess;
              if (typeof onSuccess === 'function') {
                callbacks.onSuccess = function (
                  response: HlsLoaderResponse,
                  stats: unknown,
                  ctx: HlsLoaderContext,
                ) {
                  response.data = stripMpegTsPrefix(response.data);
                  return onSuccess(response, stats, ctx, null);
                };
              }
            }
            load(context, conf, callbacks);
          };
        }
      }

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
      console.log(videoUrl);

      const { isSafari, isIOS, isIOS13, isMobile, isWebKit, isChrome } =
        detectPlayerBrowserSupport({
          userAgent,
          isIOS: isIOSGlobal,
          isIOS13: isIOS13Global,
          isMobile: isMobileGlobal,
        });

      console.log('🔍 设备检测结果:', {
        userAgent,
        isIOS,
        isSafari,
        isMobile,
        isWebKit,
        isChrome,
        AirPlay按钮: isIOS || isSafari ? '✅ 显示' : '❌ 隐藏',
        Chromecast按钮: isChrome && !isIOS ? '✅ 显示' : '❌ 隐藏',
        投屏策略:
          isIOS || isSafari
            ? '🍎 AirPlay (WebKit)'
            : isChrome
              ? '📺 Chromecast (Cast API)'
              : '❌ 不支持投屏',
      });

      const existingArt = artPlayerRef.current;
      if (existingArt && !loading) {
        const isEpisodeChange = isEpisodeChangingRef.current;
        const isSourceChange = isSourceChangingRef.current;

        if (
          shouldRebuildPlayerForMediaSwitch({
            isEpisodeChange,
            isSourceChange,
          })
        ) {
          console.log('🔄 换源时重建播放器，重置 HLS/MSE 媒体管线');
          cleanupPlayer();
        } else {
          try {
            if (sourceSwitchTimeoutRef.current) {
              clearTimeout(sourceSwitchTimeoutRef.current);
              sourceSwitchTimeoutRef.current = null;
            }

            if (switchPromiseRef.current) {
              console.log('⏸️ 取消前一个切换操作，开始新的切换');
              switchPromiseRef.current = null;
            }

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

            console.log(
              isEpisodeChange
                ? `🎯 开始切换集数: ${videoUrl} (重置播放时间到0)`
                : `🎯 开始切换源: ${videoUrl} (重新装载媒体，恢复进度: ${(
                    resumeTime || 0
                  ).toFixed(2)}s)`,
            );

            const switchPromise = switchPlayerMedia(existingArt, {
              videoUrl,
              title: videoTitle,
              poster: videoCover,
              episodeIndex: currentEpisodeIndex,
              isEpisodeChange,
              resumeTime,
            })
              .then(() => {
                if (switchPromiseRef.current === switchPromise) {
                  console.log('✅ 源切换完成');

                  if (isEpisodeChange) {
                    if (!resumeTimeRef.current || resumeTimeRef.current <= 0) {
                      existingArt.currentTime = 0;
                      console.log('🎯 集数切换完成，重置播放时间为 0');
                    } else {
                      console.log(
                        `🎯 集数切换完成，检测到待恢复进度 ${resumeTimeRef.current}s，保留当前时间`,
                      );
                    }
                    isEpisodeChangingRef.current = false;
                  }
                }
              })
              .catch((error: unknown) => {
                if (switchPromiseRef.current === switchPromise) {
                  console.warn('⚠️ 源切换失败，将重建播放器:', error);
                  if (isEpisodeChange) {
                    isEpisodeChangingRef.current = false;
                  }
                  throw error;
                }
              });

            switchPromiseRef.current = switchPromise;
            await switchPromise;

            if (existingArt.video) {
              ensureVideoSource(
                existingArt.video as HTMLVideoElement,
                videoUrl,
              );
            }

            console.log('使用switch方法成功切换视频');
            return;
          } catch (error) {
            console.warn('Switch方法失败，将重建播放器:', error);
            isEpisodeChangingRef.current = false;
            cleanupPlayer();
          }
        }
      }
      if (artPlayerRef.current) {
        cleanupPlayer();
      }

      if (artRef.current) {
        artRef.current.innerHTML = '';
      }

      try {
        let lastDanmakuRecoverAt = 0;
        const { handleHlsError, initAdaptiveHls } = hlsRuntime;

        setupArtplayerGlobals(Artplayer);

        const customType = {
          m3u8: function (video: HTMLVideoElement, url: string) {
            const hls = initAdaptiveHls(
              video,
              url,
              {
                deviceInfo: { isMobile, isIOS, isIOS13 },
                blockAdEnabled: blockAdEnabledRef.current,
                customLoader: CustomHlsJsLoader,
              },
              memoryPressure,
              (event, data) => {
                handleHlsError(
                  event,
                  data,
                  (video as HlsMediaVideo).hls,
                  video,
                  (errorMessage: string) => {
                    setTimeout(() => {
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
                onStateChange: (state) => {
                  console.log('Chromecast state changed:', state);
                },
                onCastAvailable: (available) => {
                  console.log('Chromecast available:', available);
                },
                onCastStart: () => {
                  console.log('Chromecast started');
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
          externalDanmuEnabled,
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

        const videoElement = artPlayer.video as HTMLVideoElement;
        const clearVideoLoadingWhenRenderable = (reason: string) => {
          if (
            videoElement.readyState >= VIDEO_HAVE_CURRENT_DATA &&
            videoElement.videoWidth > 0 &&
            videoElement.videoHeight > 0
          ) {
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
          finishSourceSwitch('视频元素错误');

          handleCurrentSourceFailure(getVideoErrorMessage(error));
        };

        videoErrorHandlerRef.current = videoErrorHandler;
        videoElement.addEventListener('error', videoErrorHandler);

        const loadingTimeout = setTimeout(() => {
          if (artPlayerRef.current === artPlayer && !artPlayer.playing) {
            setLoading(false);
            setIsVideoLoading(false);
            finishSourceSwitch('视频加载超时');

            console.error('视频加载超时:', {
              url: videoUrl,
              source: currentSource,
              id: currentId,
              episodeIndex: currentEpisodeIndex,
            });

            handleCurrentSourceFailure(
              `视频加载超时 (10秒)\n地址: ${videoUrl}\n\n没有更多播放源了`,
            );
          }
        }, 10000);

        applyAllUiEnhancements(artPlayerRef);

        artPlayer.on('ready', async () => {
          clearTimeout(loadingTimeout);
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

          if ((isIOS || isSafari) && artPlayer.muted) {
            console.log('iOS设备静音自动播放，准备在播放开始后恢复音量');

            const handleFirstPlay = () => {
              setTimeout(() => {
                if (artPlayerRef.current === artPlayer && artPlayer.muted) {
                  artPlayer.muted = false;
                  artPlayer.volume = lastVolumeRef.current || 0.7;
                  console.log('iOS设备已恢复音量:', artPlayer.volume);
                }
              }, 500);

              artPlayer.off('video:play', handleFirstPlay);
            };

            artPlayer.on('video:play', handleFirstPlay);
          }

          setTimeout(async () => {
            const art = artPlayerRef.current;

            try {
              // 🔥 使用 ref.current 获取最新的弹幕加载函数，避免闭包过期
              const loadDanmuFn = loadExternalDanmuRef.current;
              if (!loadDanmuFn) {
                console.warn('⚠️ loadExternalDanmu 函数未初始化');
                return;
              }

              if (!art?.plugins?.artplayerPluginDanmuku) {
                return;
              }

              await loadAndRenderDanmaku(art, loadDanmuFn, {
                preserveHidden: false,
                showNotice: true,
              });
            } catch (error) {
              console.error('加载外部弹幕失败:', error);
              showDanmakuErrorNotice(art, error);
            }
          }, 1000);

          artPlayer.on('artplayerPluginDanmuku:show', () => {
            localStorage.setItem('danmaku_visible', 'true');
            console.log('弹幕显示状态已保存');
          });

          artPlayer.on('artplayerPluginDanmuku:hide', () => {
            localStorage.setItem('danmaku_visible', 'false');
            console.log('弹幕隐藏状态已保存');
          });

          artPlayer.on(
            'artplayerPluginDanmuku:config',
            (option: DanmakuConfigChange) => {
              try {
                if (typeof option.fontSize !== 'undefined') {
                  localStorage.setItem(
                    'danmaku_fontSize',
                    String(option.fontSize),
                  );
                }
                if (typeof option.opacity !== 'undefined') {
                  localStorage.setItem(
                    'danmaku_opacity',
                    String(option.opacity),
                  );
                }
                if (typeof option.speed !== 'undefined') {
                  localStorage.setItem('danmaku_speed', String(option.speed));
                }
                console.log('弹幕配置已保存:', option);
              } catch (error) {
                console.warn('保存弹幕配置失败:', error);
              }
            },
          );
        });

        artPlayer.on('play', () => {
          requestWakeLock();
          analytics.handlePlay(artPlayer.currentTime || 0);
        });

        artPlayer.on('pause', () => {
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

        artPlayer.on('video:ended', () => {
          releaseWakeLock();
          analytics.trackProgress(100);
        });

        if (!artPlayer.paused) {
          requestWakeLock();
        }

        artPlayer.on('video:volumechange', () => {
          lastVolumeRef.current = artPlayer.volume;
          analytics.handleVolumeChange(artPlayer.volume);
        });
        artPlayer.on('video:ratechange', () => {
          lastPlaybackRateRef.current = artPlayer.playbackRate;
          analytics.handleSpeedChange(artPlayer.playbackRate);
        });

        artPlayer.on('video:canplay', () => {
          console.log('🎬 video:canplay 事件触发', {
            resumeTime: resumeTimeRef.current,
            isRestoring: isRestoringFromRecordRef.current,
            duration: artPlayer.duration,
            currentTime: artPlayer.currentTime,
          });

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

              console.log('🎯 video:canplay 恢复进度', {
                stored: resumeTimeRef.current,
                target,
                duration: duration || '未知',
              });

              const videoElement = artPlayer.video || artPlayer.$video;
              if (videoElement) {
                videoElement.currentTime = target;
                console.log('✅ 已设置视频元素的 currentTime:', target);
              }
              artPlayer.currentTime = target;
              resetDanmakuTimeline(artPlayer);

              console.log('✅ 成功恢复播放进度到:', target);
              resumeTimeRef.current = null;
              restoredFromRecord = true;
            } catch (err) {
              console.error('❌ 恢复播放进度失败:', err);
              resumeTimeRef.current = null;
            }
          } else if (resumeTimeRef.current === null) {
            console.log('✅ 无需恢复进度（resumeTimeRef 为 null）');
          } else {
            console.log('⚠️ resumeTimeRef 值无效:', resumeTimeRef.current);
          }

          if (restoredFromRecord || !resumeTimeRef.current) {
            isRestoringFromRecordRef.current = false;
          }

          if ((isIOS || isSafari) && artPlayer.paused) {
            console.log('iOS设备检测到视频未自动播放，准备交互触发机制');

            const tryAutoPlay = async () => {
              try {
                let playAttempts = 0;
                const maxAttempts = 3;

                const attemptPlay = async (): Promise<boolean> => {
                  playAttempts++;
                  console.log(`iOS自动播放尝试 ${playAttempts}/${maxAttempts}`);

                  try {
                    await artPlayer.play();
                    console.log('iOS设备自动播放成功');
                    return true;
                  } catch (playError: unknown) {
                    const playErrorName =
                      playError instanceof Error ? playError.name : '';
                    console.log(
                      `播放尝试 ${playAttempts} 失败:`,
                      playErrorName,
                    );

                    if (playErrorName === 'NotAllowedError') {
                      if (playAttempts < maxAttempts) {
                        artPlayer.volume = 0.1;
                        await new Promise((resolve) =>
                          setTimeout(resolve, 200),
                        );
                        return attemptPlay();
                      }
                      return false;
                    } else if (playErrorName === 'AbortError') {
                      if (playAttempts < maxAttempts) {
                        await new Promise((resolve) =>
                          setTimeout(resolve, 500),
                        );
                        return attemptPlay();
                      }
                      return false;
                    }
                    return false;
                  }
                };

                const success = await attemptPlay();

                if (!success) {
                  console.log(
                    'iOS设备需要用户交互才能播放，这是正常的浏览器行为',
                  );
                  if (artPlayerRef.current === artPlayer) {
                    artPlayer.notice.show = '轻触播放按钮开始观看';

                    let hasHandledFirstInteraction = false;
                    const handleFirstUserInteraction = async () => {
                      if (hasHandledFirstInteraction) return;
                      hasHandledFirstInteraction = true;

                      try {
                        await artPlayer.play();
                        setTimeout(() => {
                          if (
                            artPlayerRef.current === artPlayer &&
                            !artPlayer.muted
                          ) {
                            artPlayer.volume = lastVolumeRef.current || 0.7;
                          }
                        }, 1000);
                      } catch (error) {
                        console.warn('用户交互播放失败:', error);
                      }

                      artPlayer.off('video:play', handleFirstUserInteraction);
                      document.removeEventListener(
                        'click',
                        handleFirstUserInteraction,
                      );
                    };

                    artPlayer.on('video:play', handleFirstUserInteraction);
                    document.addEventListener(
                      'click',
                      handleFirstUserInteraction,
                    );
                  }
                }
              } catch (error) {
                console.warn('自动播放回退机制执行失败:', error);
              }
            };

            setTimeout(tryAutoPlay, 200);
          }

          setTimeout(() => {
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
            console.log('🎯 播放器创建完成，重置集数切换标识');
          }
        });

        artPlayer.on('error', (err: unknown) => {
          console.error('播放器错误:', err);

          setIsVideoLoading(false);
          finishSourceSwitch('播放器错误');

          if (artPlayer.currentTime > 0) {
            handleCurrentSourceFailure('播放失败，请切换其他播放源', {
              allowAutoSwitch: false,
            });
            return;
          }

          handleCurrentSourceFailure('播放失败，没有更多播放源了');
        });

        artPlayer.on('video:ended', () => {
          const idx = currentEpisodeIndexRef.current;

          if (videoEndedHandledRef.current) {
            return;
          }

          if (isSkipControllerTriggeredRef.current) {
            videoEndedHandledRef.current = true;
            setTimeout(() => {
              isSkipControllerTriggeredRef.current = false;
            }, 2000);
            return;
          }

          const d = detailRef.current;
          if (d && d.episodes && idx < d.episodes.length - 1) {
            videoEndedHandledRef.current = true;
            setTimeout(() => {
              setCurrentEpisodeIndex(idx + 1);
            }, 1000);
          }
        });

        artPlayer.on('video:timeupdate', () => {
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
          resetDanmakuTimeline(artPlayer);
        });

        if (artPlayer.video) {
          ensureVideoSource(artPlayer.video as HTMLVideoElement, videoUrl);
        }
      } catch (err) {
        console.error('创建播放器失败:', err);
        finishSourceSwitch('播放器初始化失败');
        isEpisodeChangingRef.current = false;
        setIsVideoLoading(false);
        setError('播放器初始化失败');
      }
    };

    const loadAndInit = async () => {
      try {
        const [artplayerModules, hlsRuntime, hlsModule] = await Promise.all([
          loadArtplayerModules(),
          import('../utils/hlsConfig'),
          import('hls.js'),
        ]);
        await initPlayer(artplayerModules, hlsRuntime, hlsModule.default);
      } catch (error) {
        console.error('动态导入 ArtPlayer 失败:', error);
        finishSourceSwitch('播放器模块加载失败');
        setIsVideoLoading(false);
        setError('播放器加载失败');
      }
    };

    loadAndInit();
  }, [
    videoUrl,
    artRef,
    loading, // 需要loading状态来判断是否初始化播放器
    currentEpisodeIndex, // 需要集数索引来验证播放条件
    // 其他状态通过 ref 访问，避免不必要的重新初始化
  ]);
}
