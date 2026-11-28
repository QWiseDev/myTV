'use client';

import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { logAccess } from '@/lib/access-log';
import { danmakuMediaKey } from '@/lib/danmaku';
import { computeVariantOrdinal } from '@/lib/danmu/episode-match';
import { generateStorageKey } from '@/lib/db.client';
import { isInternalPlayUrlSync } from '@/lib/play-navigation';
import type { SearchResult } from '@/lib/types';
import { isUsableImageUrl, selectUsableImageUrl } from '@/lib/utils';
import { useBackToTopController } from '@/hooks/useBackToTopController';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';
import { usePlayPageAnalytics } from '@/hooks/usePlayPageAnalytics';
import { useSyncedRef } from '@/hooks/useSyncedRef';

import PageLayout from '@/components/PageLayout';
import BackToTopButton from '@/components/play/BackToTopButton';
import ErrorScreen from '@/components/play/ErrorScreen';
import LoadingScreen from '@/components/play/LoadingScreen';
import PlayerAndEpisodeSection from '@/components/play/PlayerAndEpisodeSection';

import {
  PlaybackDataProvider,
  usePlaybackData,
} from '@/contexts/PlayPageContext';

import { useBangumiDetails } from './hooks/useBangumiDetails';
import { useDanmuController } from './hooks/useDanmuController';
import { useEpisodeControls } from './hooks/useEpisodeControls';
import { useEpisodeDanmuSync } from './hooks/useEpisodeDanmuSync';
import { useErrorHandler } from './hooks/useErrorHandler';
import { useFavorite } from './hooks/useFavorite';
import { MemoryPressure, useMemoryMonitor } from './hooks/useMemoryMonitor';
import { useNetdiskSearch } from './hooks/useNetdiskSearch';
import { useThrottle } from './hooks/usePerformance';
import {
  type PlayArtplayer,
  usePlayerInitializer,
} from './hooks/usePlayerInitializer';
import { usePlayerState } from './hooks/usePlayerState';
import { usePlayProgress } from './hooks/usePlayProgress';
import { usePlayRecordSync } from './hooks/usePlayRecordSync';
import { useSourceInitialization } from './hooks/useSourceInitialization';
import {
  type SourceChangeOwner,
  useSourceSwitcher,
} from './hooks/useSourceSwitcher';
import { preloadPlayerModules } from './utils/artplayerLoader';
import type {
  DanmakuItemLike,
  DanmakuPluginLike,
} from './utils/danmakuRuntime';
import { readExternalDanmuPref } from './utils/danmuPreference';
import { detectDevice } from './utils/deviceDetection';
import type { PlayerMediaSwitchResult } from './utils/playerSwitch';

const VIDEO_HAVE_CURRENT_DATA = 2;

// Wake Lock API 类型声明
interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockNavigator extends Navigator {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}

type DanmakuPluginStateSnapshot = Pick<
  DanmakuPluginLike,
  'isHide' | 'isStop' | 'option'
>;

function PlayPageClient() {
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const routeParams = useMemo(() => {
    const params = new URLSearchParams(routeQuery);
    const doubanId = parseInt(params.get('douban_id') || '0', 10) || 0;

    return {
      source: params.get('source') || '',
      id: params.get('id') || '',
      title: params.get('title') || '',
      year: params.get('year') || '',
      poster: params.get('poster') || '',
      doubanId,
      searchTitle: params.get('stitle') || '',
      searchType: params.get('stype') || '',
      needPrefer: params.get('prefer') === 'true',
    };
  }, [routeQuery]);
  const initialExternalDanmuEnabled = useMemo(() => {
    // 默认开启外部弹幕；仅当用户显式关闭过（localStorage 为 'false'）才默认关闭
    const pref = readExternalDanmuPref();
    return pref === null ? true : pref;
  }, []);

  // 使用播放数据上下文，避免重复请求
  const { playRecords } = usePlaybackData();
  // 登录态：访客隐藏换源/收藏/网盘等登录功能，也跳过需登录的共享弹幕缓存请求
  const isLoggedIn = useIsLoggedIn();
  const isLoggedInRef = useSyncedRef(isLoggedIn);

  // 🚀 内存监控 - 集成性能优化
  const { pressure: memoryPressure }: { pressure: MemoryPressure } =
    useMemoryMonitor({
      checkInterval: 30000, // ✅ 从 15s 改为 30s，减少检查频率降低 CPU 占用
      enableAutoCleanup: true,
    });

  // -----------------------------------------------------------------------------
  // 🚀 统一状态管理 (使用 usePlayerState)
  // -----------------------------------------------------------------------------
  const { state, actions } = usePlayerState({
    video: {
      title: routeParams.title,
      year: routeParams.year,
      cover: routeParams.poster,
      source: routeParams.source,
      id: routeParams.id,
      doubanId: routeParams.doubanId,
      searchTitle: routeParams.searchTitle,
      url: '',
    },
    player: {
      loading: true,
      error: null,
      loadingStage: 'searching',
      loadingMessage: '正在搜索播放源...',
      speedTestProgress: null,
    },
    playback: {
      currentEpisode: 0,
      duration: 0,
    },
    ui: {
      isSkipSettingOpen: false,
      showBackToTop: false,
    },
    details: {
      movie: null,
      bangumi: null,
      loadingMovie: false,
      loadingBangumi: false,
    },
    danmaku: {
      enabled: initialExternalDanmuEnabled,
    },
  });

  // -----------------------------------------------------------------------------
  // 🔄 状态别名 - 保留以兼容现有代码，避免大规模重构
  // 注意：新代码应直接使用 state.xxx 和 actions.xxx
  // -----------------------------------------------------------------------------
  const { loading, error, loadingStage, loadingMessage, speedTestProgress } =
    state.player;
  const {
    setLoading,
    setError,
    setLoadingStage,
    setLoadingMessage,
    setSpeedTestProgress,
  } = actions;

  const {
    title: videoTitle,
    year: videoYear,
    cover: videoCover,
    doubanId: videoDoubanId,
    source: currentSource,
    id: currentId,
    url: videoUrl,
  } = state.video;

  // -----------------------------------------------------------------------------
  // 📊 播放页面分析埋点（在 detail 声明之后，videoType 按集数推导）
  // -----------------------------------------------------------------------------
  const setVideoTitle = useCallback(
    (title: string) => actions.setVideoInfo({ title }),
    [actions],
  );
  const setVideoYear = useCallback(
    (year: string) => actions.setVideoInfo({ year }),
    [actions],
  );
  const setVideoCover = useCallback(
    (cover: string) => actions.setVideoInfo({ cover }),
    [actions],
  );
  const setVideoDoubanId = useCallback(
    (doubanId: number | null) => actions.setVideoInfo({ doubanId }),
    [actions],
  );
  const setCurrentSource = useCallback(
    (source: string) => actions.setVideoInfo({ source }),
    [actions],
  );
  const setCurrentId = useCallback(
    (id: string) => actions.setVideoInfo({ id }),
    [actions],
  );
  const { setVideoUrl } = actions;

  const { currentEpisode: currentEpisodeIndex, duration: videoDuration } =
    state.playback;
  const { setEpisode: setCurrentEpisodeIndex } = actions;
  const setVideoDuration = useCallback(
    (duration: number) => actions.setPlaybackInfo({ duration }),
    [actions],
  );
  // 🔑 用 ref 镜像 duration：timeupdate 监听器在播放器初始化时仅挂一次，
  //    直接闭包捕获的 videoDuration 会被钉死在初始值，必须通过 ref 读取最新值
  const videoDurationRef = useSyncedRef(videoDuration);

  const {
    movie: movieDetails,
    bangumi: bangumiDetails,
    loadingMovie: loadingMovieDetails,
    loadingBangumi: loadingBangumiDetails,
  } = state.details;
  const {
    setMovieDetails,
    setBangumiDetails,
    setLoadingMovie: setLoadingMovieDetails,
    setLoadingBangumi: setLoadingBangumiDetails,
  } = actions;

  const { showBackToTop, isSkipSettingOpen } = state.ui;
  const setShowBackToTop = actions.toggleBackToTop;
  const setIsSkipSettingOpen = useCallback(
    (open: boolean) => {
      if (open !== isSkipSettingOpen) actions.toggleSkipSetting();
    },
    [actions, isSkipSettingOpen],
  );
  const { scrollToTop } = useBackToTopController({ setShowBackToTop });

  const externalDanmuEnabled = state.danmaku.enabled;
  const setExternalDanmuEnabled = useCallback(
    (enabled: boolean) => actions.setDanmakuConfig({ enabled }),
    [actions],
  );

  // -----------------------------------------------------------------------------
  // 🚀 性能优化：节流高频事件处理
  // -----------------------------------------------------------------------------
  // timeupdate 事件每秒触发约 60 次，只同步页面真实需要的 duration。
  const throttledTimeUpdate = useThrottle((duration: number) => {
    // 通过 ref 读取最新 duration，确保守卫生效（监听器在播放器初始化时仅挂一次）
    if (duration > 0 && Math.abs(duration - videoDurationRef.current) > 0.5) {
      setVideoDuration(duration);
    }
  }, 1000); // 每秒最多更新一次，平衡响应性和性能

  // -----------------------------------------------------------------------------
  // 🛡️ 统一错误处理
  // -----------------------------------------------------------------------------
  const errorHandler = useErrorHandler();

  // -----------------------------------------------------------------------------
  // 状态变量（State）- 保留部分未迁移的状态
  // -----------------------------------------------------------------------------
  const [detail, setDetail] = useState<SearchResult | null>(null);

  const analytics = usePlayPageAnalytics({
    videoId: currentId,
    videoTitle: videoTitle,
    videoType: (detail?.episodes?.length || 0) > 1 ? 'tv' : 'movie',
    source: currentSource,
    duration: state.playback.duration,
  });

  // 去广告开关（从 localStorage 继承，默认 true）
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const blockAdEnabledRef = useSyncedRef(blockAdEnabled);

  const externalDanmuEnabledRef = useSyncedRef(externalDanmuEnabled);

  // 搜索所需信息
  const searchTitle = routeParams.searchTitle;
  const searchType = routeParams.searchType;
  const routePlayRecord = useMemo(() => {
    if (!routeParams.source || !routeParams.id) {
      return null;
    }
    return (
      playRecords?.[generateStorageKey(routeParams.source, routeParams.id)] ||
      null
    );
  }, [playRecords, routeParams.id, routeParams.source]);

  // 播放记录封面兜底：记录就绪而详情接口未返回时，先把记录里的封面用起来
  useEffect(() => {
    const recordCover = selectUsableImageUrl(routePlayRecord?.cover);
    if (recordCover && !isUsableImageUrl(videoCover)) {
      setVideoCover(recordCover);
    }
  }, [routePlayRecord?.cover, videoCover, setVideoCover]);

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(routeParams.needPrefer);
  const needPreferRef = useSyncedRef(needPrefer);
  useEffect(() => {
    setNeedPrefer(routeParams.needPrefer);
  }, [
    routeParams.id,
    routeParams.needPrefer,
    routeParams.searchTitle,
    routeParams.source,
    routeParams.title,
  ]);

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);

  // 网盘搜索
  const {
    netdiskResults,
    netdiskLoading,
    netdiskError,
    netdiskTotal,
    handleNetDiskSearch,
  } = useNetdiskSearch();

  const currentSourceRef = useSyncedRef(currentSource);
  const currentIdRef = useSyncedRef(currentId);
  const videoUrlRef = useSyncedRef(videoUrl);
  const videoTitleRef = useSyncedRef(videoTitle);
  const videoYearRef = useSyncedRef(videoYear);
  const videoDoubanIdRef = useSyncedRef(videoDoubanId);
  const detailRef = useSyncedRef(detail);
  const currentEpisodeIndexRef = useSyncedRef(currentEpisodeIndex);
  // 本地集名与同版式序数：弹幕智能匹配（综艺按日期/版式对齐）用。
  // 必须取 episodes_titles（集名）；episodes 存的是 m3u8 播放地址，
  // 地址里的日期目录会被 extractEpisodeDate 误解析成日期污染匹配。
  // 集名缺失时宁可不传（服务端回退 legacy 序数匹配），也不要传地址。
  const episodeTitle =
    detail?.episodes_titles?.[currentEpisodeIndex]?.trim() || '';
  const episodeTitleRef = useSyncedRef(episodeTitle);
  const variantEpisodeRef = useSyncedRef(
    computeVariantOrdinal(detail?.episodes_titles || [], currentEpisodeIndex),
  );
  const availableSourcesRef = useSyncedRef(availableSources);
  const videoUrlRequestIdRef = useRef(0);

  useBangumiDetails({
    videoDoubanId,
    bangumiDetails,
    setBangumiDetails,
    setLoadingBangumiDetails,
    movieDetails,
    setMovieDetails,
    setLoadingMovieDetails,
  });

  // 收藏逻辑
  const { favorited, handleToggleFavorite } = useFavorite({
    currentSource,
    currentId,
    videoTitle,
    detail,
    searchTitle,
  });

  // 包装收藏功能以添加分析埋点（仅在落库真实成功后上报对应事件）
  const handleFavoriteWithAnalytics = useCallback(async () => {
    const outcome = await handleToggleFavorite();
    if (outcome === 'favorited') {
      analytics.trackFavorite();
    } else if (outcome === 'unfavorited') {
      analytics.trackUnfavorite();
    }
  }, [handleToggleFavorite, analytics]);

  const initialAccessLogRef = useRef({
    source: state.video.source,
    id: state.video.id,
    title: videoTitle,
    year: videoYear,
    episode_index: currentEpisodeIndex,
    url: typeof window !== 'undefined' ? window.location.href : '',
    loadTime: Date.now(),
  });

  // 📊 记录播放页访问
  useEffect(() => {
    logAccess('playpage', initialAccessLogRef.current);
  }, []);

  // 🚀 性能优化：使用 useMemo 缓存总集数计算
  const totalEpisodes = useMemo(
    () => detail?.episodes?.length || 0,
    [detail?.episodes],
  );

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);
  // 上次使用的音量，默认 0.7
  const lastVolumeRef = useRef<number>(0.7);
  // 上次使用的播放速率，默认 1.0
  const lastPlaybackRateRef = useRef<number>(1.0);
  // 标记是否正在从播放记录恢复
  const isRestoringFromRecordRef = useRef(false);
  // 播放记录同步守卫，避免用户切换集数被回滚
  const playRecordKeyRef = useRef<string | null>(null);
  const playRecordAppliedRef = useRef(false);

  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null,
  );

  // 🚀 优选和测速开关 - 默认关闭以加速首屏加载
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    // 默认关闭优选，优先保证加载速度，用户可在设置中开启
    return false;
  });

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  // 播放进度保存相关
  const lastSaveTimeRef = useRef<number>(0);

  // 弹幕加载状态管理，防止重复加载
  const danmuLoadingRef = useRef<boolean>(false);
  const lastDanmuLoadKeyRef = useRef<string>('');
  // 🔥 新增：用 ref 存储 loadExternalDanmu 函数，避免闭包过期问题
  const loadExternalDanmuRef = useRef<
    (() => Promise<DanmakuItemLike[]>) | null
  >(null);

  // 🚀 新增：弹幕操作防抖和性能优化
  const danmuOperationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const episodeSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const danmuPluginStateRef = useRef<DanmakuPluginStateSnapshot | null>(null); // 保存弹幕插件状态
  const isSourceChangingRef = useRef<boolean>(false); // 标记是否正在换源
  // 记录进行中换源的发起方（用户手动/自动）与目标，供播放器故障处理区分：
  // 用户手动换源优先于自动换源，且不被旧播放器的故障劫持
  const sourceChangeOwnerRef = useRef<SourceChangeOwner | null>(null);
  const isEpisodeChangingRef = useRef<boolean>(false); // 标记是否正在切换集数
  const isSkipControllerTriggeredRef = useRef<boolean>(false); // 标记是否通过 SkipController 触发了下一集
  const videoEndedHandledRef = useRef<boolean>(false); // 🔥 标记当前视频的 video:ended 事件是否已经被处理过（防止多个监听器重复触发）

  // 连续切换源的异步任务管理
  const switchPromiseRef = useRef<Promise<PlayerMediaSwitchResult> | null>(
    null,
  );

  const artPlayerRef = useRef<PlayArtplayer | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);

  // Wake Lock 相关
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // 视频错误监听器引用
  const videoErrorHandlerRef = useRef<((e: Event) => void) | null>(null);

  const clearPendingSwitchTimers = useCallback(() => {
    if (danmuOperationTimeoutRef.current) {
      clearTimeout(danmuOperationTimeoutRef.current);
      danmuOperationTimeoutRef.current = null;
    }
    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
      episodeSwitchTimeoutRef.current = null;
    }
  }, []);

  // 播放源优选函数已移至 utils/sourcePreference.ts

  // 更新视频地址
  const updateVideoUrl = useCallback(
    async (detailData: SearchResult | null, episodeIndex: number) => {
      const requestId = ++videoUrlRequestIdRef.current;
      const commitVideoUrl = (url: string) => {
        if (requestId !== videoUrlRequestIdRef.current) return;
        if (url !== videoUrlRef.current) {
          setVideoUrl(url);
        }
      };

      if (
        !detailData ||
        !detailData.episodes ||
        episodeIndex >= detailData.episodes.length
      ) {
        commitVideoUrl('');
        return;
      }

      const episodeData = detailData.episodes[episodeIndex];
      commitVideoUrl(episodeData || '');
    },
    // videoUrlRef 为稳定 ref 引用（useSyncedRef 内部为 useRef）
    [setVideoUrl, videoUrlRef],
  );

  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 移除旧的 source，保持唯一
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 始终允许远程播放（AirPlay / Cast）
    video.disableRemotePlayback = false;
    // 如果曾经有禁用属性，移除之
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  // 🚀 性能优化：使用 useMemo 缓存设备检测结果（静态值，无需重新计算）
  const deviceInfo = useMemo(() => detectDevice(), []);
  const userAgent = deviceInfo.userAgent;
  const isIOSGlobal = deviceInfo.isIOS;
  const isIOS13Global = deviceInfo.isIOS13;
  const isMobileGlobal = deviceInfo.isMobile;

  const { loadAvailableSources } = useSourceInitialization({
    currentSource: routeParams.source,
    currentId: routeParams.id,
    videoTitle: routeParams.title,
    searchTitle,
    fallbackTitle: routePlayRecord?.title,
    fallbackCover: selectUsableImageUrl(
      routeParams.poster,
      routePlayRecord?.cover,
    ),
    fallbackDoubanId: routePlayRecord?.douban_id,
    searchType,
    needPreferRef,
    optimizationEnabled,
    deviceInfo,
    setNeedPrefer,
    setCurrentSource,
    setCurrentId,
    setVideoTitle,
    setVideoYear,
    setVideoCover,
    setVideoDoubanId,
    videoTitleRef,
    videoYearRef,
    videoDoubanIdRef,
    currentSourceRef,
    currentIdRef,
    detailRef,
    availableSourcesRef,
    setDetail,
    setAvailableSources,
    setCurrentEpisodeIndex,
    currentEpisodeIndexRef,
    setLoading,
    setError,
    setLoadingStage,
    setLoadingMessage,
    setSourceSearchLoading,
    setSourceSearchError,
    setSpeedTestProgress,
    errorHandler,
  });

  const {
    handleDanmuOperationOptimized,
    loadExternalDanmu,
    resetDanmuLoadState,
  } = useDanmuController({
    artPlayerRef,
    danmuOperationTimeoutRef,
    externalDanmuEnabledRef,
    setExternalDanmuEnabled,
    videoTitleRef,
    videoYearRef,
    videoDoubanIdRef,
    videoUrlRef,
    episodeTitleRef,
    variantEpisodeRef,
    danmuLoadingRef,
    lastDanmuLoadKeyRef,
    currentSourceRef,
    currentEpisodeIndexRef,
    canUseSharedCacheRef: isLoggedInRef,
  });
  // 🔥 同步 loadExternalDanmu 到 ref，确保播放器回调中使用最新版本
  loadExternalDanmuRef.current = loadExternalDanmu;
  const requestWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        return;
      }
      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (wakeLock) {
        const sentinel = await wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        const handleSentinelRelease = () => {
          sentinel.removeEventListener('release', handleSentinelRelease);
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
          }
        };
        sentinel.addEventListener('release', handleSentinelRelease);
      }
    } catch (err) {
      console.warn('Wake Lock 请求失败:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel && !sentinel.released) {
        await sentinel.release();
      }
    } catch (err) {
      console.warn('Wake Lock 释放失败:', err);
    }
  }, []);

  // 清理播放器资源的统一函数（添加更完善的清理逻辑）
  const cleanupPlayer = useCallback(() => {
    resetDanmuLoadState();
    // 🚀 新增：清理弹幕优化相关的定时器
    if (danmuOperationTimeoutRef.current) {
      clearTimeout(danmuOperationTimeoutRef.current);
      danmuOperationTimeoutRef.current = null;
    }

    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
      episodeSwitchTimeoutRef.current = null;
    }

    // 清理弹幕状态引用
    danmuPluginStateRef.current = null;

    if (artPlayerRef.current) {
      try {
        if (
          typeof artPlayerRef.current.__uiEnhancementsCleanup === 'function'
        ) {
          artPlayerRef.current.__uiEnhancementsCleanup();
        }

        // 移除视频错误监听器
        const videoElement = artPlayerRef.current.video as HTMLVideoElement;
        if (videoElement && videoErrorHandlerRef.current) {
          videoElement.removeEventListener(
            'error',
            videoErrorHandlerRef.current,
          );
          videoErrorHandlerRef.current = null;
        }

        // 1. 重置弹幕插件状态，并由下方 destroy() 触发插件内部 worker 释放
        const danmukuPlugin =
          artPlayerRef.current.plugins?.artplayerPluginDanmuku;
        if (danmukuPlugin && typeof danmukuPlugin.reset === 'function') {
          danmukuPlugin.reset();
        }

        // 2. 销毁HLS实例
        if (artPlayerRef.current.video.hls) {
          artPlayerRef.current.video.hls.destroy();
        }

        // 3. 销毁ArtPlayer实例 (使用false参数避免DOM清理冲突)
        artPlayerRef.current.destroy(false);
        artPlayerRef.current = null;
      } catch (err) {
        console.warn('清理播放器资源时出错:', err);
        // 即使出错也要确保引用被清空
        artPlayerRef.current = null;
      }
    }
  }, [resetDanmuLoadState]);

  useEpisodeDanmuSync({
    detail,
    currentEpisodeIndex,
    updateVideoUrl,
    isSourceChangingRef,
    isEpisodeChangingRef,
    isSkipControllerTriggeredRef,
    videoEndedHandledRef,
    lastDanmuLoadKeyRef,
    danmuLoadingRef,
    episodeSwitchTimeoutRef,
    artPlayerRef,
    danmuPluginStateRef,
    externalDanmuEnabledRef,
    loadExternalDanmu,
    resetDanmuLoadState,
  });

  // 播放记录处理 - 使用Context避免重复请求
  usePlayRecordSync({
    currentSource,
    currentId,
    totalEpisodes,
    playRecords,
    currentEpisodeIndexRef,
    isEpisodeChangingRef,
    isSourceChangingRef,
    setCurrentEpisodeIndex,
    resumeTimeRef,
    playRecordKeyRef,
    playRecordAppliedRef,
    artPlayerRef,
    isRestoringFromRecordRef,
  });

  const { handleSourceChange, switchingSourceKey } = useSourceSwitcher({
    setVideoLoadingStage,
    setIsVideoLoading,
    lastDanmuLoadKeyRef,
    danmuLoadingRef,
    danmuOperationTimeoutRef,
    episodeSwitchTimeoutRef,
    artPlayerRef,
    currentSourceRef,
    currentIdRef,
    availableSources,
    currentEpisodeIndex,
    resumeTimeRef,
    setVideoTitle,
    setVideoYear,
    setVideoCover,
    setVideoDoubanId,
    videoDoubanIdRef,
    setCurrentSource,
    setCurrentId,
    setDetail,
    setAvailableSources,
    setCurrentEpisodeIndex,
    isSourceChangingRef,
    sourceChangeOwnerRef,
    externalDanmuEnabledRef,
    loadExternalDanmu,
    resetDanmuLoadState,
  });

  // 🚀 组件卸载时清理所有定时器和状态
  useEffect(() => {
    return () => {
      clearPendingSwitchTimers();

      // 重置状态
      isSourceChangingRef.current = false;
      sourceChangeOwnerRef.current = null;
      switchPromiseRef.current = null;
    };
  }, [clearPendingSwitchTimers]);

  const { saveCurrentPlayProgress } = usePlayProgress({
    artPlayerRef,
    currentSourceRef,
    currentIdRef,
    videoTitleRef,
    videoCover,
    videoDoubanIdRef,
    detailRef,
    playRecords,
    availableSourcesRef,
    movieDetails,
    bangumiDetails,
    currentEpisodeIndexRef,
    searchTitle,
    lastSaveTimeRef,
    releaseWakeLock,
    cleanupPlayer,
    requestWakeLock,
  });

  const { handleEpisodeChange, handleNextEpisode } = useEpisodeControls({
    totalEpisodes,
    artPlayerRef,
    saveCurrentPlayProgress,
    setCurrentEpisodeIndex,
    detailRef,
    currentEpisodeIndexRef,
    isSkipControllerTriggeredRef,
  });

  const { playerInstanceId } = usePlayerInitializer({
    videoUrl,
    loading,
    currentEpisodeIndex,
    artRef,
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
  });

  useEffect(() => {
    if (!isVideoLoading) return;

    const clearLoadingIfVideoRenderable = () => {
      const video = artPlayerRef.current?.video as HTMLVideoElement | undefined;

      if (
        video &&
        video.readyState >= VIDEO_HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        setIsVideoLoading(false);
      }
    };

    clearLoadingIfVideoRenderable();

    const intervalId = window.setInterval(clearLoadingIfVideoRenderable, 250);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [isVideoLoading]);

  // 🚀 提前预加载播放器与 HLS 核心模块
  useEffect(() => {
    preloadPlayerModules();
  }, []);
  // 当组件卸载时清理定时器、Wake Lock 和播放器资源
  useEffect(() => {
    return () => {
      // 释放 Wake Lock
      releaseWakeLock();

      // 销毁播放器实例
      cleanupPlayer();
    };
  }, [cleanupPlayer, releaseWakeLock]);

  if (loading) {
    return (
      <LoadingScreen
        loadingStage={loadingStage}
        loadingMessage={loadingMessage}
        speedTestProgress={speedTestProgress}
      />
    );
  }

  if (error) {
    return <ErrorScreen error={error} />;
  }

  return (
    <PageLayout activePath='/play' fullWidth theater>
      {/* 剧场模式：md 及以上锁视口不滚动，播放器+右侧信息框一屏放下 */}
      <div className='px-0 xl:px-6 md:h-full'>
        {/* 剧场模式：全宽铺满，与爱奇艺一致 */}
        <div className='mx-auto flex max-w-full flex-col gap-3 pt-2 pb-4 md:h-full'>
          <PlayerAndEpisodeSection
            playerRef={artRef}
            playerProps={{
              isVideoLoading,
              videoLoadingStage,
              playerInstanceId,
              currentSource,
              currentId,
              detailTitle: detail?.title,
              episodeName: detail?.episodes_titles?.[currentEpisodeIndex],
              episodeIndex: currentEpisodeIndex,
              artPlayerRef,
              duration: videoDuration,
              isSkipSettingOpen,
              onSkipSettingChange: setIsSkipSettingOpen,
              onNextEpisode: handleNextEpisode,
              canConfigureSkip: isLoggedIn,
            }}
            episodePanelProps={{
              detail,
              currentEpisodeIndex,
              totalEpisodes,
              onEpisodeChange: handleEpisodeChange,
              onSourceChange: handleSourceChange,
              currentSource,
              currentId,
              videoTitle: searchTitle || videoTitle,
              availableSources,
              onLoadSources: loadAvailableSources,
              sourceSearchLoading,
              sourceSearchError,
              switchingSourceKey,
              isSourceSwitching:
                isVideoLoading && videoLoadingStage === 'sourceChanging',
              disableSourceSwitch: !isLoggedIn,
            }}
            infoProps={{
              detail,
              videoTitle,
              videoYear,
              bangumiDetails,
              movieDetails,
              loadingBangumiDetails,
              loadingMovieDetails,
              favorited,
              onToggleFavorite: handleFavoriteWithAnalytics,
              netdiskResults,
              netdiskLoading,
              netdiskError,
              netdiskTotal,
              onNetDiskSearch: handleNetDiskSearch,
              videoDoubanId: videoDoubanId || 0,
            }}
            danmakuProps={{
              mediaKey: danmakuMediaKey(videoTitle, videoYear, videoDoubanId),
              title: videoTitle,
              episodeIndex: currentEpisodeIndex,
              enabled: externalDanmuEnabled,
              onToggle: handleDanmuOperationOptimized,
              canUseSharedCache: isLoggedIn,
            }}
          />
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <BackToTopButton show={showBackToTop} onClick={scrollToTop} />
    </PageLayout>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PlayPageDataBoundary />
    </Suspense>
  );
}

function PlayPageDataBoundary() {
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  // 区分页内 replaceState 同步（初始化补参/换源）与外部跨影片客户端路由跳转（搜索热榜/继续观看/收藏/追更）
  const lastRouteQueryRef = useRef(routeQuery);
  const sessionKeyRef = useRef(0);
  if (lastRouteQueryRef.current !== routeQuery) {
    lastRouteQueryRef.current = routeQuery;
    if (!isInternalPlayUrlSync(routeQuery)) {
      sessionKeyRef.current += 1;
    }
  }

  const includePlayRecordKeys = useMemo(() => {
    const params = new URLSearchParams(routeQuery);
    const source = params.get('source');
    const id = params.get('id');

    return source && id ? [generateStorageKey(source, id)] : [];
  }, [routeQuery]);

  return (
    <PlaybackDataProvider includePlayRecordKeys={includePlayRecordKeys} eager>
      <PlayPageClient key={sessionKeyRef.current} />
    </PlaybackDataProvider>
  );
}
