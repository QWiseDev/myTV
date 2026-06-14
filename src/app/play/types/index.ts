/**
 * Play 模块类型定义
 */

import type { Celebrity } from '@/lib/types';

// ==================== 播放器状态类型 ====================

export interface PlayerState {
  loading: boolean;
  error: string | null;
  loadingStage?: 'searching' | 'preferring' | 'fetching' | 'ready';
  loadingMessage?: string;
}

// ==================== 视频信息类型 ====================

export interface VideoInfo {
  url: string;
  title: string;
  cover: string;
  source: string;
  id: string;
  doubanId?: number | null;
  year?: string;
  searchTitle?: string;
}

// ==================== 播放进度类型 ====================

export interface PlaybackInfo {
  currentEpisode: number;
  totalEpisodes: number;
  currentTime: number;
  duration: number;
  isPlaying?: boolean;
  volume?: number;
  playbackRate?: number;
}

// ==================== 弹幕配置类型 ====================

export interface DanmakuConfig {
  enabled: boolean;
  loading: boolean;
  opacity: number;
  fontSize: number;
  speed: number;
  unlimited: boolean;
  sources?: string[];
}

export interface DanmakuItem {
  text: string;
  time: number;
  color?: string;
  border?: boolean;
  mode?: 0 | 1 | 2; // 0: 滚动, 1: 顶部, 2: 底部
}

// ==================== 播放器配置类型 ====================

export interface PlayerConfig {
  autoplay: boolean;
  volume: number;
  playbackRate: number;
  subtitle: boolean;
  pip: boolean;
  miniProgressBar: boolean;
}

// ==================== 影片详情类型 ====================

export interface MovieDetails {
  rate: string;
  directors?: string[];
  casts?: string[];
  cast?: string[];
  screenwriters?: string[];
  genres?: string[];
  year: string;
  intro?: string;
  poster: string;
  countries?: string[];
  languages?: string[];
  first_aired?: string;
  episode_length?: string | number;
  episodes?: number;
  movie_duration?: string | number;
  celebrities?: Celebrity[];
  recommendations?: Array<{
    id: string;
    title: string;
    poster: string;
    rate: string;
  }>;
}

// ==================== Bangumi 详情类型 ====================

export interface BangumiDetails {
  rating: { score: string };
  tags: Array<{ name: string }>;
  summary: string;
  images: {
    large: string;
  };
  infobox?: Array<{ key: string; value: string }>;
  date?: string;
  total_episodes?: number;
}

// ==================== 测速进度类型 ====================

export interface SpeedTestProgress {
  current: number;
  total: number;
  currentSource: string;
  result?: string;
}

// ==================== 播放记录类型 ====================

export interface PlayRecord {
  currentTime: number;
  duration: number;
  episodeIndex: number;
  timestamp: number;
}

// ==================== 播放源类型 ====================

export interface PlaySource {
  name: string;
  url: string;
  quality?: string;
  type?: string;
}

export interface SourceTestResult {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  score?: number;
}

// ==================== 集数类型 ====================

export interface Episode {
  name: string;
  url: string;
  index?: number;
  duration?: number;
}

// ==================== 跳过片段类型 ====================

export interface SkipSegment {
  start: number;
  end: number;
  type: 'op' | 'ed' | 'preview';
}

export interface VideoSkipData {
  source: string;
  id: string;
  episodeIndex: number;
  segments: SkipSegment[];
  updatedAt: number;
}

// ==================== 网盘搜索类型 ====================

export interface NetDiskLink {
  url: string;
  password: string;
  note: string;
  datetime: string;
  source: string;
  images?: string[];
}

export type NetDiskResults = Record<string, NetDiskLink[]>;

// ==================== 换源测速结果类型 ====================

export interface EpisodeVideoInfo {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
  levels?: unknown;
  maxResolution?: string;
  minResolution?: string;
  maxBandwidth?: number;
  minBandwidth?: number;
}

// ==================== 播放器事件回调类型 ====================

export interface PlayerEventCallbacks {
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onVolumeChange?: (volume: number) => void;
  onRateChange?: (rate: number) => void;
  onError?: (error: Error) => void;
}

// ==================== 播放器初始化选项 ====================

export interface InitPlayerOptions {
  container: HTMLElement;
  url: string;
  poster?: string;
  title?: string;
  danmaku: DanmakuConfig;
  callbacks: PlayerEventCallbacks;
  isMobile?: boolean;
  autoplay?: boolean;
  volume?: number;
}

// ==================== 数据库相关类型 ====================

export interface FavoriteData {
  title: string;
  source_name: string;
  year?: string;
  cover?: string;
  total_episodes: number;
  save_time: number;
  search_title: string;
}

export interface PlayRecordData {
  source: string;
  id: string;
  episode_index: number;
  current_time: number;
  duration: number;
  last_update: number;
  video_title: string;
}

export interface DanmakuData {
  text: string;
  time: number;
  color: string;
  mode: number;
  created_at: number;
}
