/**
 * 统一状态管理 Hook
 * 使用 useReducer 管理播放页面的所有状态
 */

import { Dispatch, useMemo, useReducer } from 'react';

import type {
  BangumiDetails,
  DanmakuConfig,
  MovieDetails,
  PlaybackInfo,
  PlayerState,
  SpeedTestProgress,
  VideoInfo,
} from '../types';

// ==================== State 定义 ====================

export interface PlayPageState {
  // 视频信息
  video: VideoInfo;

  // 播放状态
  playback: PlaybackInfo;

  // 播放器 UI 状态
  player: PlayerState & {
    speedTestProgress: SpeedTestProgress | null;
  };

  // 弹幕状态
  danmaku: DanmakuConfig;

  // UI 状态
  ui: {
    isSkipSettingOpen: boolean;
    showBackToTop: boolean;
    selectedTab: string;
    isMobile: boolean;
  };

  // 详情数据
  details: {
    movie: MovieDetails | null;
    bangumi: BangumiDetails | null;
    loadingMovie: boolean;
    loadingBangumi: boolean;
  };
}

// ==================== Action 定义 ====================

export type PlayPageAction =
  // 视频信息更新
  | { type: 'SET_VIDEO_INFO'; payload: Partial<VideoInfo> }
  | { type: 'SET_VIDEO_URL'; payload: string }

  // 播放状态更新
  | { type: 'SET_PLAYBACK_INFO'; payload: Partial<PlaybackInfo> }
  | { type: 'SET_CURRENT_TIME'; payload: number }
  | { type: 'SET_EPISODE'; payload: number }

  // 播放器状态更新
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | {
      type: 'SET_LOADING_STAGE';
      payload: PlayerState['loadingStage'];
    }
  | { type: 'SET_LOADING_MESSAGE'; payload: string }
  | { type: 'SET_SPEED_TEST_PROGRESS'; payload: SpeedTestProgress | null }

  // 弹幕状态更新
  | { type: 'SET_DANMAKU_CONFIG'; payload: Partial<DanmakuConfig> }
  | { type: 'TOGGLE_DANMAKU' }
  | { type: 'SET_DANMAKU_LOADING'; payload: boolean }

  // UI 状态更新
  | { type: 'TOGGLE_SKIP_SETTING' }
  | { type: 'SET_SELECTED_TAB'; payload: string }
  | { type: 'TOGGLE_BACK_TO_TOP'; payload: boolean }

  // 详情数据更新
  | { type: 'SET_MOVIE_DETAILS'; payload: MovieDetails | null }
  | { type: 'SET_BANGUMI_DETAILS'; payload: BangumiDetails | null }
  | { type: 'SET_LOADING_MOVIE'; payload: boolean }
  | { type: 'SET_LOADING_BANGUMI'; payload: boolean }

  // 批量更新
  | { type: 'BATCH_UPDATE'; payload: Partial<PlayPageState> }

  // 重置状态
  | { type: 'RESET_STATE' };

// ==================== 默认初始状态 ====================

const defaultInitialState: PlayPageState = {
  video: {
    url: '',
    title: '',
    cover: '',
    source: '',
    id: '',
    doubanId: null,
    year: '',
    searchTitle: '',
  },
  playback: {
    currentEpisode: 0,
    totalEpisodes: 0,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    volume: 0.8,
    playbackRate: 1,
  },
  player: {
    loading: false,
    error: null,
    loadingStage: undefined,
    loadingMessage: undefined,
    speedTestProgress: null,
  },
  danmaku: {
    enabled: true,
    loading: false,
    opacity: 0.5,
    fontSize: 20,
    speed: 5,
    unlimited: false,
    sources: [],
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
};

// ==================== Reducer ====================

function playPageReducer(
  state: PlayPageState,
  action: PlayPageAction
): PlayPageState {
  switch (action.type) {
    // 视频信息
    case 'SET_VIDEO_INFO':
      return {
        ...state,
        video: { ...state.video, ...action.payload },
      };

    case 'SET_VIDEO_URL':
      return {
        ...state,
        video: { ...state.video, url: action.payload },
      };

    // 播放状态
    case 'SET_PLAYBACK_INFO':
      return {
        ...state,
        playback: { ...state.playback, ...action.payload },
      };

    case 'SET_CURRENT_TIME':
      return {
        ...state,
        playback: { ...state.playback, currentTime: action.payload },
      };

    case 'SET_EPISODE':
      return {
        ...state,
        playback: { ...state.playback, currentEpisode: action.payload },
      };

    // 播放器状态
    case 'SET_LOADING':
      return {
        ...state,
        player: { ...state.player, loading: action.payload },
      };

    case 'SET_ERROR':
      return {
        ...state,
        player: { ...state.player, error: action.payload },
      };

    case 'SET_LOADING_STAGE':
      return {
        ...state,
        player: { ...state.player, loadingStage: action.payload },
      };

    case 'SET_LOADING_MESSAGE':
      return {
        ...state,
        player: { ...state.player, loadingMessage: action.payload },
      };

    case 'SET_SPEED_TEST_PROGRESS':
      return {
        ...state,
        player: { ...state.player, speedTestProgress: action.payload },
      };

    // 弹幕状态
    case 'SET_DANMAKU_CONFIG':
      return {
        ...state,
        danmaku: { ...state.danmaku, ...action.payload },
      };

    case 'TOGGLE_DANMAKU':
      return {
        ...state,
        danmaku: { ...state.danmaku, enabled: !state.danmaku.enabled },
      };

    case 'SET_DANMAKU_LOADING':
      return {
        ...state,
        danmaku: { ...state.danmaku, loading: action.payload },
      };

    // UI 状态
    case 'TOGGLE_SKIP_SETTING':
      return {
        ...state,
        ui: {
          ...state.ui,
          isSkipSettingOpen: !state.ui.isSkipSettingOpen,
        },
      };

    case 'SET_SELECTED_TAB':
      return {
        ...state,
        ui: { ...state.ui, selectedTab: action.payload },
      };

    case 'TOGGLE_BACK_TO_TOP':
      if (state.ui.showBackToTop === action.payload) return state;
      return {
        ...state,
        ui: { ...state.ui, showBackToTop: action.payload },
      };

    // 详情数据
    case 'SET_MOVIE_DETAILS':
      return {
        ...state,
        details: { ...state.details, movie: action.payload },
      };

    case 'SET_BANGUMI_DETAILS':
      return {
        ...state,
        details: { ...state.details, bangumi: action.payload },
      };

    case 'SET_LOADING_MOVIE':
      return {
        ...state,
        details: { ...state.details, loadingMovie: action.payload },
      };

    case 'SET_LOADING_BANGUMI':
      return {
        ...state,
        details: { ...state.details, loadingBangumi: action.payload },
      };

    // 批量更新
    case 'BATCH_UPDATE':
      return { ...state, ...action.payload };

    // 重置状态
    case 'RESET_STATE':
      return defaultInitialState;

    default:
      return state;
  }
}

// ==================== Hook ====================

export interface UsePlayerStateReturn {
  state: PlayPageState;
  dispatch: Dispatch<PlayPageAction>;
  actions: {
    // 视频相关
    setVideoInfo: (info: Partial<VideoInfo>) => void;
    setVideoUrl: (url: string) => void;

    // 播放相关
    setPlaybackInfo: (info: Partial<PlaybackInfo>) => void;
    setCurrentTime: (time: number) => void;
    setEpisode: (index: number) => void;

    // 播放器状态
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setLoadingStage: (stage: PlayerState['loadingStage']) => void;
    setLoadingMessage: (message: string) => void;
    setSpeedTestProgress: (progress: SpeedTestProgress | null) => void;

    // 弹幕
    setDanmakuConfig: (config: Partial<DanmakuConfig>) => void;
    toggleDanmaku: () => void;
    setDanmakuLoading: (loading: boolean) => void;

    // UI
    toggleSkipSetting: () => void;
    setSelectedTab: (tab: string) => void;
    toggleBackToTop: (show: boolean) => void;

    // 详情
    setMovieDetails: (details: MovieDetails | null) => void;
    setBangumiDetails: (details: BangumiDetails | null) => void;
    setLoadingMovie: (loading: boolean) => void;
    setLoadingBangumi: (loading: boolean) => void;

    // 批量更新
    batchUpdate: (updates: Partial<PlayPageState>) => void;

    // 重置
    reset: () => void;
  };
}

export const usePlayerState = (
  initialState?: Partial<PlayPageState>
): UsePlayerStateReturn => {
  const [state, dispatch] = useReducer(playPageReducer, {
    ...defaultInitialState,
    ...initialState,
  });

  // 提供便捷的 actions
  const actions = useMemo(() => ({
      // 视频相关
      setVideoInfo: (info: Partial<VideoInfo>) =>
        dispatch({ type: 'SET_VIDEO_INFO', payload: info }),
      setVideoUrl: (url: string) =>
        dispatch({ type: 'SET_VIDEO_URL', payload: url }),

      // 播放相关
      setPlaybackInfo: (info: Partial<PlaybackInfo>) =>
        dispatch({ type: 'SET_PLAYBACK_INFO', payload: info }),
      setCurrentTime: (time: number) =>
        dispatch({ type: 'SET_CURRENT_TIME', payload: time }),
      setEpisode: (index: number) =>
        dispatch({ type: 'SET_EPISODE', payload: index }),

      // 播放器状态
      setLoading: (loading: boolean) =>
        dispatch({ type: 'SET_LOADING', payload: loading }),
      setError: (error: string | null) =>
        dispatch({ type: 'SET_ERROR', payload: error }),
      setLoadingStage: (stage: PlayerState['loadingStage']) =>
        dispatch({ type: 'SET_LOADING_STAGE', payload: stage }),
      setLoadingMessage: (message: string) =>
        dispatch({ type: 'SET_LOADING_MESSAGE', payload: message }),
      setSpeedTestProgress: (progress: SpeedTestProgress | null) =>
        dispatch({ type: 'SET_SPEED_TEST_PROGRESS', payload: progress }),

      // 弹幕
      setDanmakuConfig: (config: Partial<DanmakuConfig>) =>
        dispatch({ type: 'SET_DANMAKU_CONFIG', payload: config }),
      toggleDanmaku: () => dispatch({ type: 'TOGGLE_DANMAKU' }),
      setDanmakuLoading: (loading: boolean) =>
        dispatch({ type: 'SET_DANMAKU_LOADING', payload: loading }),

      // UI
      toggleSkipSetting: () => dispatch({ type: 'TOGGLE_SKIP_SETTING' }),
      setSelectedTab: (tab: string) =>
        dispatch({ type: 'SET_SELECTED_TAB', payload: tab }),
      toggleBackToTop: (show: boolean) =>
        dispatch({ type: 'TOGGLE_BACK_TO_TOP', payload: show }),

      // 详情
      setMovieDetails: (details: MovieDetails | null) =>
        dispatch({ type: 'SET_MOVIE_DETAILS', payload: details }),
      setBangumiDetails: (details: BangumiDetails | null) =>
        dispatch({ type: 'SET_BANGUMI_DETAILS', payload: details }),
      setLoadingMovie: (loading: boolean) =>
        dispatch({ type: 'SET_LOADING_MOVIE', payload: loading }),
      setLoadingBangumi: (loading: boolean) =>
        dispatch({ type: 'SET_LOADING_BANGUMI', payload: loading }),

      // 批量更新
      batchUpdate: (updates: Partial<PlayPageState>) =>
        dispatch({ type: 'BATCH_UPDATE', payload: updates }),

      // 重置
      reset: () => dispatch({ type: 'RESET_STATE' }),
    }), [dispatch]);

  return { state, dispatch, actions };
};
