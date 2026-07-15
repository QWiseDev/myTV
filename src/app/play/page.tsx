'use client';

import dynamic from 'next/dynamic';
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
import { generateStorageKey } from '@/lib/db.client';
import { getDoubanComments } from '@/lib/douban.client';
import type { DoubanComment, SearchResult } from '@/lib/types';
import { usePlayPageAnalytics } from '@/hooks/usePlayPageAnalytics';

import PageLayout from '@/components/PageLayout';
import PlayDetailsSection from '@/components/play/PlayDetailsSection';
import PlayerAndEpisodeSection from '@/components/play/PlayerAndEpisodeSection';

import {
  PlaybackDataProvider,
  usePlaybackData,
} from '@/contexts/PlayPageContext';

import { useBackToTopController } from './hooks/useBackToTopController';
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
import { useSourceSwitcher } from './hooks/useSourceSwitcher';
import type { EpisodeVideoInfo } from './types';
import { preloadArtplayerModules } from './utils/artplayerLoader';
import type {
  DanmakuItemLike,
  DanmakuPluginLike,
} from './utils/danmakuRuntime';
import { readExternalDanmuPref } from './utils/danmuPreference';
import { detectDevice } from './utils/deviceDetection';
import type { PlayerMediaSwitchResult } from './utils/playerSwitch';

// 🚀 性能优化：基于内存压力的动态组件导入
// 非关键组件 - 完全动态导入
const BackToTopButton = dynamic(
  () => import('@/components/play/BackToTopButton'),
  { ssr: false },
);
const LoadingScreen = dynamic(() => import('@/components/play/LoadingScreen'), {
  ssr: false,
});
const ErrorScreen = dynamic(() => import('@/components/play/ErrorScreen'), {
  ssr: false,
});

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

  // 🚀 内存监控 - 集成性能优化
  const { pressure: memoryPressure }: { pressure: MemoryPressure } =
    useMemoryMonitor({
      checkInterval: 30000, // ✅ 从 15s 改为 30s，减少检查频率降低 CPU 占用
      enableAutoCleanup: true,
      onPressureChange: (_pressure, _info) => {
        // 根据内存压力调整弹幕配置
      },
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
      totalEpisodes: 0,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      volume: 0.7,
      playbackRate: 1,
    },
    ui: {
      isSkipSettingOpen: false,
      showBackToTop: false,
      selectedTab: 'episodes',
      isMobile: false,
    },
    details: {
      movie: null,
      bangumi: null,
      loadingMovie: false,
      loadingBangumi: false,
    },
    favorite: {
      isFavorited: false,
      loading: false,
    },
    danmaku: {
      enabled: initialExternalDanmuEnabled,
      loading: false,
      opacity: 0.5,
      fontSize: 20,
      speed: 5,
      unlimited: false,
      sources: [],
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
  // 📊 播放页面分析埋点
  // -----------------------------------------------------------------------------
  const analytics = usePlayPageAnalytics({
    videoId: currentId,
    videoTitle: videoTitle,
    videoType: 'movie', // 可以根据实际内容动态设置
    source: currentSource,
    duration: state.playback.duration,
  });
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
  const videoDurationRef = useRef(videoDuration);
  useEffect(() => {
    videoDurationRef.current = videoDuration;
  }, [videoDuration]);

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

  // 去广告开关（从 localStorage 继承，默认 true）
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const blockAdEnabledRef = useRef(blockAdEnabled);
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);

  // 外部弹幕开关 - 需要从 localStorage 加载初始值
  useEffect(() => {
    const pref = readExternalDanmuPref();
    if (pref !== null) {
      actions.setDanmakuConfig({ enabled: pref });
    }
  }, [actions]);
  const externalDanmuEnabledRef = useRef(externalDanmuEnabled);
  useEffect(() => {
    externalDanmuEnabledRef.current = externalDanmuEnabled;
  }, [externalDanmuEnabled]);

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

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(routeParams.needPrefer);
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    setNeedPrefer(routeParams.needPrefer);
  }, [
    routeParams.id,
    routeParams.needPrefer,
    routeParams.searchTitle,
    routeParams.source,
    routeParams.title,
  ]);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const availableSourcesRef = useRef<SearchResult[]>([]);

  // 网盘搜索
  const {
    netdiskResults,
    netdiskLoading,
    netdiskError,
    netdiskTotal,
    handleNetDiskSearch,
  } = useNetdiskSearch();

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoUrlRef = useRef(videoUrl);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const videoDoubanIdRef = useRef(videoDoubanId);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);
  const videoUrlRequestIdRef = useRef(0);

  // 同步最新值到 refs - 修复无限循环问题，但保持关键状态的同步
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    videoUrlRef.current = videoUrl;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
    videoDoubanIdRef.current = videoDoubanId;
  }, [
    currentSource,
    currentId,
    videoUrl,
    videoTitle,
    videoYear,
    videoDoubanId,
  ]); // 只同步基本信息，避免循环

  // 单独同步 currentEpisodeIndex，确保播放进度保存时使用正确的集数
  useEffect(() => {
    currentEpisodeIndexRef.current = currentEpisodeIndex;
  }, [currentEpisodeIndex]); // 必须同步集数变化

  // 单独处理 detail 和 availableSources，使用深比较避免无限循环
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  // 🩹 兜底同步：部分流程下 detail 已带 douban_id，但状态中的 videoDoubanId 仍为 0，
  // 会导致演员阵容 / 豆瓣短评不触发加载；此处补一次同步避免漏掉。
  useEffect(() => {
    const doubanIdFromDetail = detail?.douban_id;
    if (
      doubanIdFromDetail &&
      doubanIdFromDetail > 0 &&
      (!videoDoubanId || videoDoubanId === 0)
    ) {
      actions.setVideoInfo({ doubanId: doubanIdFromDetail });
    }
  }, [detail?.douban_id, videoDoubanId, actions]);

  useEffect(() => {
    availableSourcesRef.current = availableSources;
  }, [availableSources]);

  useBangumiDetails({
    videoDoubanId,
    bangumiDetails,
    setBangumiDetails,
    setLoadingBangumiDetails,
    movieDetails,
    setMovieDetails,
    setLoadingMovieDetails,
  });

  // 豆瓣短评状态
  const [movieComments, setMovieComments] = useState<DoubanComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const commentsLoadedRef = useRef<number | null>(null);
  const isLoadingCommentsRef = useRef(false);

  // 加载豆瓣短评
  useEffect(() => {
    const loadComments = async () => {
      if (!videoDoubanId || videoDoubanId === 0) {
        return;
      }

      // 如果已经为当前豆瓣ID加载过短评，不重复加载
      if (commentsLoadedRef.current === videoDoubanId) {
        return;
      }

      // 如果正在加载中，不重复请求
      if (isLoadingCommentsRef.current) {
        return;
      }

      isLoadingCommentsRef.current = true;
      commentsLoadedRef.current = videoDoubanId;
      setLoadingComments(true);
      setCommentsError(null);
      try {
        const response = await getDoubanComments({
          id: videoDoubanId.toString(),
          start: 0,
          limit: 10,
          sort: 'new_score',
        });

        if (response.code === 200 && response.data) {
          setMovieComments(response.data.comments);
        } else {
          setCommentsError(response.message);
        }
      } catch (err) {
        console.error('Failed to load comments:', err);
        setCommentsError('加载短评失败');
      } finally {
        setLoadingComments(false);
        isLoadingCommentsRef.current = false;
      }
    };

    loadComments();
  }, [videoDoubanId]);

  // 收藏逻辑
  const { favorited, handleToggleFavorite } = useFavorite({
    currentSource,
    currentId,
    videoTitle,
    detail,
    searchTitle,
  });

  // 包装收藏功能以添加分析埋点
  const handleFavoriteWithAnalytics = useCallback(() => {
    handleToggleFavorite();
    // 📊 分析埋点：收藏/取消收藏事件
    if (favorited) {
      analytics.trackShare('other'); // 使用share函数来取消收藏
    } else {
      analytics.trackFavorite(); // 添加收藏
    }
  }, [handleToggleFavorite, favorited, analytics]);

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

  // 🎯 弹幕集数偏移（用户手动调整弹幕对应的集数）
  const [danmuEpisodeOffset, setDanmuEpisodeOffset] = useState<number>(0);
  const danmuEpisodeOffsetRef = useRef<number>(0);

  // 🎯 弹幕集数 = 当前集数 + 用户偏移量
  const danmuEpisodeNum = currentEpisodeIndex + 1 + danmuEpisodeOffset;

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

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo] = useState<Map<string, EpisodeVideoInfo>>(
    new Map(),
  );

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
  const isEpisodeChangingRef = useRef<boolean>(false); // 标记是否正在切换集数
  const isSkipControllerTriggeredRef = useRef<boolean>(false); // 标记是否通过 SkipController 触发了下一集
  const videoEndedHandledRef = useRef<boolean>(false); // 🔥 标记当前视频的 video:ended 事件是否已经被处理过（防止多个监听器重复触发）

  // 连续切换源的异步任务管理
  const switchPromiseRef =
    useRef<Promise<PlayerMediaSwitchResult> | null>(null);

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
    [setVideoUrl],
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
    fallbackCover: routeParams.poster,
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

  const { handleDanmuOperationOptimized, loadExternalDanmu } =
    useDanmuController({
      artPlayerRef,
      danmuOperationTimeoutRef,
      externalDanmuEnabledRef,
      setExternalDanmuEnabled,
      videoTitleRef,
      videoYearRef,
      videoDoubanIdRef,
      videoUrlRef,
      danmuLoadingRef,
      lastDanmuLoadKeyRef,
      currentSourceRef,
      currentEpisodeIndexRef, // 🔧 传递 ref 确保使用最新集数
      danmuEpisodeOffsetRef, // 🔧 传递 ref 确保使用最新偏移
    });
  // 🔥 同步 loadExternalDanmu 到 ref，确保播放器回调中使用最新版本
  loadExternalDanmuRef.current = loadExternalDanmu;
  const requestWakeLock = useCallback(async () => {
    try {
      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (wakeLock) {
        wakeLockRef.current = await wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock 请求失败:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.warn('Wake Lock 释放失败:', err);
    }
  }, []);

  // 清理播放器资源的统一函数（添加更完善的清理逻辑）
  const cleanupPlayer = useCallback(() => {
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

        // 1. 清理弹幕插件的WebWorker
        if (artPlayerRef.current.plugins?.artplayerPluginDanmuku) {
          const danmukuPlugin =
            artPlayerRef.current.plugins.artplayerPluginDanmuku;

          // 尝试获取并清理WebWorker
          if (
            danmukuPlugin.worker &&
            typeof danmukuPlugin.worker.terminate === 'function'
          ) {
            danmukuPlugin.worker.terminate();
          }

          // 清空弹幕数据
          if (typeof danmukuPlugin.reset === 'function') {
            danmukuPlugin.reset();
          }
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
  }, []);

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
    loadExternalDanmu,
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

  const { handleSourceChange } = useSourceSwitcher({
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
    setError,
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
    externalDanmuEnabledRef,
    loadExternalDanmu,
  });

  // 🚀 组件卸载时清理所有定时器和状态
  useEffect(() => {
    return () => {
      clearPendingSwitchTimers();

      // 重置状态
      isSourceChangingRef.current = false;
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

  const handleDanmuEpisodeChange = useCallback(
    (offset: number) => {
      setDanmuEpisodeOffset((prev) => prev + offset);
      danmuEpisodeOffsetRef.current = danmuEpisodeOffsetRef.current + offset;
    },
    [],
  );

  usePlayerInitializer({
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
    externalDanmuEnabled,
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
    isEpisodeChangingRef,
    isSkipControllerTriggeredRef,
    videoEndedHandledRef,
    isRestoringFromRecordRef,
    videoErrorHandlerRef,
    cleanupPlayer,
    danmuEpisodeNum, // 🎯 新增：弹幕对应的集数
    onDanmuEpisodeChange: handleDanmuEpisodeChange,
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

  // 🚀 新增：提前预加载播放器资源
  useEffect(() => {
    preloadArtplayerModules();
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
    <PageLayout activePath='/play' fullWidth>
      <div className='px-0 xl:px-6'>
        <div className='mx-auto flex max-w-full flex-col gap-3 pt-2 pb-4 xl:max-w-7xl'>
          <PlayerAndEpisodeSection
            playerRef={artRef}
            playerProps={{
              isVideoLoading,
              videoLoadingStage,
              currentSource,
              currentId,
              detailTitle: detail?.title,
              episodeIndex: currentEpisodeIndex,
              artPlayerRef,
              duration: videoDuration,
              isSkipSettingOpen,
              onSkipSettingChange: setIsSkipSettingOpen,
              onNextEpisode: handleNextEpisode,
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
              precomputedVideoInfo,
            }}
          />

          <PlayDetailsSection
            detail={detail}
            videoTitle={videoTitle}
            videoYear={videoYear}
            bangumiDetails={bangumiDetails}
            movieDetails={movieDetails}
            loadingBangumiDetails={loadingBangumiDetails}
            loadingMovieDetails={loadingMovieDetails}
            favorited={favorited}
            onToggleFavorite={handleFavoriteWithAnalytics}
            netdiskResults={netdiskResults}
            netdiskLoading={netdiskLoading}
            netdiskError={netdiskError}
            netdiskTotal={netdiskTotal}
            onNetDiskSearch={handleNetDiskSearch}
            videoCover={videoCover}
            videoDoubanId={videoDoubanId || 0}
            movieComments={movieComments}
            loadingComments={loadingComments}
            commentsError={commentsError}
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
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageDataBoundary />
    </Suspense>
  );
}

function PlayPageDataBoundary() {
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const includePlayRecordKeys = useMemo(() => {
    const params = new URLSearchParams(routeQuery);
    const source = params.get('source');
    const id = params.get('id');

    return source && id ? [generateStorageKey(source, id)] : [];
  }, [routeQuery]);

  return (
    <PlaybackDataProvider includePlayRecordKeys={includePlayRecordKeys}>
      <PlayPageClient />
    </PlaybackDataProvider>
  );
}
