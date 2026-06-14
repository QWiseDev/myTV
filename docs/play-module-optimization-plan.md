# Play 模块优化方案详细设计

## 文档信息
- **创建日期**: 2025-11-01
- **目标模块**: src/app/play
- **优化目标**: 提升代码质量、性能和可维护性

---

## 📋 目录
- [高优先级优化](#高优先级优化)
  - [1. 拆分 page.tsx 大文件](#1-拆分-pagetsx-大文件)
  - [2. 统一状态管理](#2-统一状态管理)
  - [3. 提取重复的弹幕加载逻辑](#3-提取重复的弹幕加载逻辑)
- [中优先级优化](#中优先级优化)
  - [4. 性能优化](#4-性能优化)
  - [5. 增强类型安全](#5-增强类型安全)
  - [6. 统一错误处理](#6-统一错误处理)

---

## 高优先级优化

### 1. 拆分 page.tsx 大文件

#### 问题分析
- **当前状态**: page.tsx 有 4690 行代码
- **影响**:
  - 难以理解和维护
  - 代码审查困难
  - 违反单一职责原则
  - IDE 性能下降

#### 优化目标
将 page.tsx 拆分为多个职责清晰的模块，每个文件不超过 500 行

#### 实施步骤

##### 1.1 创建类型定义文件 (30 分钟)
**文件**: `src/app/play/types/index.ts`

**内容**:
```typescript
// 播放器状态类型
export interface PlayerState {
  loading: boolean;
  error: string | null;
  loadingStage?: 'searching' | 'preferring' | 'fetching' | 'ready';
  loadingMessage?: string;
}

// 视频信息类型
export interface VideoInfo {
  url: string;
  title: string;
  cover: string;
  source: string;
  id: string;
  doubanId?: number;
  year?: string;
}

// 播放进度类型
export interface PlaybackInfo {
  currentEpisode: number;
  totalEpisodes: number;
  currentTime: number;
  duration: number;
}

// 弹幕配置类型
export interface DanmakuConfig {
  enabled: boolean;
  loading: boolean;
  opacity: number;
  fontSize: number;
  speed: number;
  unlimited: boolean;
}

// 播放器配置类型
export interface PlayerConfig {
  autoplay: boolean;
  volume: number;
  playbackRate: number;
  subtitle: boolean;
  pip: boolean;
  miniProgressBar: boolean;
}

// 影片详情类型
export interface MovieDetails {
  rate: string;
  directors: string[];
  casts: string[];
  genres: string[];
  year: string;
  intro: string;
  poster: string;
}

// Bangumi 详情类型
export interface BangumiDetails {
  rating: { score: string };
  tags: Array<{ name: string }>;
  summary: string;
  images: {
    large: string;
  };
}

// 测速进度类型
export interface SpeedTestProgress {
  current: number;
  total: number;
  currentSource: string;
  result?: string;
}

// 播放记录类型
export interface PlayRecord {
  currentTime: number;
  duration: number;
  episodeIndex: number;
  timestamp: number;
}
```

**验收标准**:
- ✅ 所有类型定义清晰准确
- ✅ 无 any 类型
- ✅ 导出所有必要的类型

##### 1.2 提取状态管理逻辑 (45 分钟)
**文件**: `src/app/play/hooks/usePlayerState.ts`

**功能**: 使用 useReducer 统一管理播放器状态

**内容结构**:
```typescript
// State 类型定义
interface PlayPageState {
  video: VideoInfo;
  playback: PlaybackInfo;
  player: PlayerState;
  danmaku: DanmakuConfig;
  ui: {
    isSkipSettingOpen: boolean;
    showBackToTop: boolean;
    selectedTab: string;
  };
}

// Action 类型定义
type PlayPageAction =
  | { type: 'SET_VIDEO_INFO'; payload: Partial<VideoInfo> }
  | { type: 'SET_PLAYBACK_INFO'; payload: Partial<PlaybackInfo> }
  | { type: 'SET_PLAYER_STATE'; payload: Partial<PlayerState> }
  | { type: 'SET_DANMAKU_CONFIG'; payload: Partial<DanmakuConfig> }
  | { type: 'TOGGLE_SKIP_SETTING' }
  | { type: 'SET_SELECTED_TAB'; payload: string }
  | { type: 'RESET_STATE' };

// Reducer 函数
function playPageReducer(state: PlayPageState, action: PlayPageAction): PlayPageState;

// Hook
export const usePlayerState = (initialState: Partial<PlayPageState>) => {
  const [state, dispatch] = useReducer(playPageReducer, initialState);

  // 提供便捷的更新函数
  const actions = {
    setVideoInfo: (info: Partial<VideoInfo>) =>
      dispatch({ type: 'SET_VIDEO_INFO', payload: info }),
    setPlaybackInfo: (info: Partial<PlaybackInfo>) =>
      dispatch({ type: 'SET_PLAYBACK_INFO', payload: info }),
    // ... 其他 actions
  };

  return { state, actions };
};
```

**验收标准**:
- ✅ 所有分散的 useState 合并到 useReducer
- ✅ 提供类型安全的 dispatch actions
- ✅ 状态更新逻辑清晰

##### 1.3 提取播放器初始化逻辑 (60 分钟)
**文件**: `src/app/play/core/initPlayer.ts`

**功能**: 封装播放器初始化的核心逻辑

**拆分子函数**:
```typescript
// 1. 创建 HLS 配置
export const createHlsConfig = (options: {
  danmuEnabled: boolean;
  filterAds: boolean;
}) => HlsConfig;

// 2. 创建播放器配置
export const createPlayerConfig = (options: {
  container: HTMLElement;
  url: string;
  poster: string;
  settings: PlayerSettings;
}) => ArtPlayerOptions;

// 3. 设置弹幕插件
export const setupDanmakuPlugin = (
  player: Artplayer,
  config: DanmakuConfig
) => void;

// 4. 设置播放器事件监听
export const setupPlayerEvents = (
  player: Artplayer,
  callbacks: PlayerEventCallbacks
) => void;

// 5. 移动端优化
export const setupMobileOptimizations = (
  player: Artplayer,
  isMobile: boolean
) => void;

// 6. 主初始化函数
export const initializePlayer = async (options: InitPlayerOptions) => {
  const hlsConfig = createHlsConfig(options);
  const playerConfig = createPlayerConfig(options);
  const player = new Artplayer(playerConfig);

  setupDanmakuPlugin(player, options.danmaku);
  setupPlayerEvents(player, options.callbacks);
  setupMobileOptimizations(player, options.isMobile);

  return player;
};
```

**验收标准**:
- ✅ initPlayer 函数不超过 200 行
- ✅ 每个子函数职责单一
- ✅ 所有参数类型化

##### 1.4 提取换源逻辑 (45 分钟)
**文件**: `src/app/play/core/sourceManager.ts`

**功能**: 管理播放源切换逻辑

**内容结构**:
```typescript
export interface SourceTestResult {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  score: number;
}

export class SourceManager {
  private sources: PlaySource[];
  private currentIndex: number;
  private testResults: Map<string, SourceTestResult>;

  constructor(sources: PlaySource[]) {
    this.sources = sources;
    this.currentIndex = 0;
    this.testResults = new Map();
  }

  // 测试单个播放源
  async testSource(source: PlaySource): Promise<SourceTestResult>;

  // 批量测试所有播放源
  async testAllSources(
    onProgress?: (current: number, total: number) => void
  ): Promise<SourceTestResult[]>;

  // 获取最佳播放源
  getBestSource(): PlaySource;

  // 切换到指定播放源
  switchToSource(index: number): PlaySource;

  // 获取下一个播放源
  getNextSource(): PlaySource;
}

export const useSourceManager = (sources: PlaySource[]) => {
  const managerRef = useRef<SourceManager>();

  useEffect(() => {
    managerRef.current = new SourceManager(sources);
  }, [sources]);

  return managerRef.current;
};
```

**验收标准**:
- ✅ 换源逻辑独立封装
- ✅ 支持测速和评分
- ✅ 提供清晰的 API

##### 1.5 提取集数选择逻辑 (30 分钟)
**文件**: `src/app/play/components/EpisodeManager.tsx`

**功能**: 独立的集数管理组件

**内容结构**:
```typescript
interface EpisodeManagerProps {
  episodes: Episode[];
  currentEpisode: number;
  onEpisodeChange: (index: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export const EpisodeManager: React.FC<EpisodeManagerProps> = ({
  episodes,
  currentEpisode,
  onEpisodeChange,
  onPrevious,
  onNext,
}) => {
  return (
    <div className="episode-manager">
      {/* 集数选择器 UI */}
    </div>
  );
};
```

**验收标准**:
- ✅ 组件独立可复用
- ✅ Props 类型清晰
- ✅ UI 与逻辑分离

##### 1.6 重构主页面 (60 分钟)
**文件**: `src/app/play/page.tsx` (重构后)

**目标**: 主页面只负责协调各模块，不超过 300 行

**结构**:
```typescript
export default function PlayPage() {
  // 1. 使用统一的状态管理
  const { state, actions } = usePlayerState(initialState);

  // 2. 使用各个功能 hook
  const danmaku = useDanmakuManager({ ... });
  const favorite = useFavorite({ ... });
  const playRecord = usePlayRecordSync({ ... });
  const sourceManager = useSourceManager(sources);

  // 3. 播放器初始化
  const initPlayer = useCallback(async () => {
    const player = await initializePlayer({
      container: playerRef.current,
      url: state.video.url,
      danmaku: state.danmaku,
      callbacks: {
        onTimeUpdate: handleTimeUpdate,
        onEnded: handleVideoEnded,
        // ...
      },
    });
    playerInstanceRef.current = player;
  }, [state]);

  // 4. 页面渲染
  return (
    <div>
      <VideoPlayer ref={playerRef} {...playerState} />
      <EpisodeManager {...episodeProps} />
      <SourceSelector {...sourceProps} />
      <DanmakuControls {...danmakuProps} />
      <VideoInfo {...infoProps} />
    </div>
  );
}
```

**验收标准**:
- ✅ 主文件不超过 300 行
- ✅ 逻辑清晰易读
- ✅ 功能完整无缺失

---

### 2. 统一状态管理

#### 问题分析
- **当前状态**: 30+ 个 useState/useRef 分散各处
- **影响**:
  - 状态更新逻辑混乱
  - 难以追踪状态变化
  - 容易产生状态不一致

#### 优化目标
使用 useReducer 统一管理相关状态，提供清晰的状态更新接口

#### 实施步骤

##### 2.1 设计状态结构 (30 分钟)
**文件**: `src/app/play/hooks/usePlayerState.ts`

**状态树设计**:
```typescript
interface PlayPageState {
  // 视频信息
  video: {
    url: string;
    title: string;
    cover: string;
    source: string;
    id: string;
    doubanId: number | null;
    year: string;
    searchTitle: string;
  };

  // 播放状态
  playback: {
    currentEpisode: number;
    totalEpisodes: number;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    volume: number;
    playbackRate: number;
  };

  // 播放器 UI 状态
  player: {
    loading: boolean;
    error: string | null;
    loadingStage?: 'searching' | 'preferring' | 'fetching' | 'ready';
    loadingMessage?: string;
    speedTestProgress: SpeedTestProgress | null;
  };

  // 弹幕状态
  danmaku: {
    enabled: boolean;
    loading: boolean;
    opacity: number;
    fontSize: number;
    speed: number;
    unlimited: boolean;
    sources: string[];
  };

  // 播放源状态
  sources: {
    list: PlaySource[];
    currentIndex: number;
    testResults: Map<string, SourceTestResult>;
    isTesting: boolean;
  };

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

  // 收藏状态
  favorite: {
    isFavorited: boolean;
    loading: boolean;
  };
}
```

**验收标准**:
- ✅ 状态结构清晰合理
- ✅ 所有状态都有明确类型
- ✅ 避免嵌套过深

##### 2.2 实现 Reducer (45 分钟)
**文件**: `src/app/play/hooks/usePlayerState.ts`

**Action 类型定义**:
```typescript
type PlayPageAction =
  // 视频信息更新
  | { type: 'SET_VIDEO_INFO'; payload: Partial<PlayPageState['video']> }
  | { type: 'SET_VIDEO_URL'; payload: string }

  // 播放状态更新
  | { type: 'SET_PLAYBACK_INFO'; payload: Partial<PlayPageState['playback']> }
  | { type: 'SET_CURRENT_TIME'; payload: number }
  | { type: 'SET_EPISODE'; payload: number }

  // 播放器状态更新
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING_STAGE'; payload: PlayPageState['player']['loadingStage'] }
  | { type: 'SET_SPEED_TEST_PROGRESS'; payload: SpeedTestProgress | null }

  // 弹幕状态更新
  | { type: 'SET_DANMAKU_CONFIG'; payload: Partial<PlayPageState['danmaku']> }
  | { type: 'TOGGLE_DANMAKU' }

  // 播放源更新
  | { type: 'SET_SOURCES'; payload: PlaySource[] }
  | { type: 'SET_CURRENT_SOURCE'; payload: number }
  | { type: 'SET_SOURCE_TEST_RESULT'; payload: { index: number; result: SourceTestResult } }

  // UI 状态更新
  | { type: 'TOGGLE_SKIP_SETTING' }
  | { type: 'SET_SELECTED_TAB'; payload: string }
  | { type: 'TOGGLE_BACK_TO_TOP'; payload: boolean }

  // 详情数据更新
  | { type: 'SET_MOVIE_DETAILS'; payload: MovieDetails | null }
  | { type: 'SET_BANGUMI_DETAILS'; payload: BangumiDetails | null }

  // 收藏状态更新
  | { type: 'SET_FAVORITED'; payload: boolean }

  // 批量更新
  | { type: 'BATCH_UPDATE'; payload: Partial<PlayPageState> }

  // 重置状态
  | { type: 'RESET_STATE' };
```

**Reducer 实现**:
```typescript
function playPageReducer(
  state: PlayPageState,
  action: PlayPageAction
): PlayPageState {
  switch (action.type) {
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

    case 'SET_PLAYBACK_INFO':
      return {
        ...state,
        playback: { ...state.playback, ...action.payload },
      };

    case 'SET_EPISODE':
      return {
        ...state,
        playback: { ...state.playback, currentEpisode: action.payload },
      };

    case 'TOGGLE_DANMAKU':
      return {
        ...state,
        danmaku: { ...state.danmaku, enabled: !state.danmaku.enabled },
      };

    case 'BATCH_UPDATE':
      return { ...state, ...action.payload };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}
```

**验收标准**:
- ✅ 所有 action 都有对应处理
- ✅ 状态更新不可变
- ✅ 类型安全

##### 2.3 创建便捷的 Hook API (30 分钟)
**文件**: `src/app/play/hooks/usePlayerState.ts`

```typescript
export const usePlayerState = (initialState?: Partial<PlayPageState>) => {
  const [state, dispatch] = useReducer(
    playPageReducer,
    { ...defaultInitialState, ...initialState }
  );

  // 提供便捷的 actions
  const actions = useMemo(() => ({
    // 视频相关
    setVideoInfo: (info: Partial<PlayPageState['video']>) =>
      dispatch({ type: 'SET_VIDEO_INFO', payload: info }),
    setVideoUrl: (url: string) =>
      dispatch({ type: 'SET_VIDEO_URL', payload: url }),

    // 播放相关
    setPlaybackInfo: (info: Partial<PlayPageState['playback']>) =>
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

    // 弹幕
    setDanmakuConfig: (config: Partial<PlayPageState['danmaku']>) =>
      dispatch({ type: 'SET_DANMAKU_CONFIG', payload: config }),
    toggleDanmaku: () =>
      dispatch({ type: 'TOGGLE_DANMAKU' }),

    // UI
    toggleSkipSetting: () =>
      dispatch({ type: 'TOGGLE_SKIP_SETTING' }),
    setSelectedTab: (tab: string) =>
      dispatch({ type: 'SET_SELECTED_TAB', payload: tab }),

    // 批量更新
    batchUpdate: (updates: Partial<PlayPageState>) =>
      dispatch({ type: 'BATCH_UPDATE', payload: updates }),

    // 重置
    reset: () =>
      dispatch({ type: 'RESET_STATE' }),
  }), []);

  return { state, actions, dispatch };
};
```

**验收标准**:
- ✅ API 简洁易用
- ✅ 提供类型提示
- ✅ 性能优化（useMemo）

---

### 3. 提取重复的弹幕加载逻辑

#### 问题分析
- **当前状态**: 弹幕加载逻辑在 4 处重复
- **影响**:
  - 代码冗余
  - 维护困难
  - 行为不一致风险

#### 优化目标
创建统一的弹幕管理 Hook，封装所有弹幕相关逻辑

#### 实施步骤

##### 3.1 创建弹幕管理 Hook (60 分钟)
**文件**: `src/app/play/hooks/useDanmakuManager.ts`

**功能清单**:
- 弹幕加载（外部 + 本地）
- 弹幕缓存管理
- 弹幕发送
- 弹幕配置管理

**实现**:
```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { loadDanmuFromCache, saveDanmuToCache } from '../utils/danmuCache';

interface DanmakuManagerOptions {
  videoTitle: string;
  videoYear: string;
  videoDoubanId: number | null;
  currentEpisodeIndex: number;
  enabled: boolean;
  player: Artplayer | null;
}

export interface DanmakuItem {
  text: string;
  time: number;
  color: string;
  type: number;
}

export const useDanmakuManager = ({
  videoTitle,
  videoYear,
  videoDoubanId,
  currentEpisodeIndex,
  enabled,
  player,
}: DanmakuManagerOptions) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [danmakuCount, setDanmakuCount] = useState(0);
  const loadingRef = useRef(false);
  const currentLoadKeyRef = useRef('');

  // 生成弹幕加载键
  const generateLoadKey = useCallback(() => {
    return `${videoTitle}_${videoYear}_${videoDoubanId}_${currentEpisodeIndex + 1}`;
  }, [videoTitle, videoYear, videoDoubanId, currentEpisodeIndex]);

  // 从缓存加载弹幕
  const loadFromCache = useCallback(async () => {
    const key = generateLoadKey();
    const cached = await loadDanmuFromCache(key);
    return cached;
  }, [generateLoadKey]);

  // 从外部 API 加载弹幕
  const loadFromAPI = useCallback(async () => {
    if (!videoTitle || !videoDoubanId) return null;

    try {
      const response = await fetch('/api/danmu/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anime: videoTitle,
          episode: currentEpisodeIndex + 1,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.success && data.danmu) {
        return data.danmu;
      }

      return null;
    } catch (err) {
      console.error('加载外部弹幕失败:', err);
      return null;
    }
  }, [videoTitle, videoDoubanId, currentEpisodeIndex]);

  // 从本地数据库加载弹幕
  const loadFromLocal = useCallback(async () => {
    // 实现本地弹幕加载逻辑
    return [];
  }, []);

  // 加载弹幕（主函数）
  const loadDanmaku = useCallback(async () => {
    if (!enabled || !player || loadingRef.current) return;

    const loadKey = generateLoadKey();
    if (currentLoadKeyRef.current === loadKey) return;

    loadingRef.current = true;
    currentLoadKeyRef.current = loadKey;
    setLoading(true);
    setError(null);

    try {
      // 1. 先尝试从缓存加载
      const cached = await loadFromCache();
      if (cached && cached.length > 0) {
        player.plugins.artplayerPluginDanmuku.load(cached);
        setDanmakuCount(cached.length);
        console.log(`从缓存加载弹幕: ${cached.length} 条`);
        return;
      }

      // 2. 从外部 API 加载
      const externalDanmu = await loadFromAPI();
      if (externalDanmu && externalDanmu.length > 0) {
        player.plugins.artplayerPluginDanmuku.load(externalDanmu);
        setDanmakuCount(externalDanmu.length);

        // 缓存弹幕
        await saveDanmuToCache(loadKey, externalDanmu);
        console.log(`加载外部弹幕: ${externalDanmu.length} 条`);
        return;
      }

      // 3. 从本地数据库加载
      const localDanmu = await loadFromLocal();
      if (localDanmu.length > 0) {
        player.plugins.artplayerPluginDanmuku.load(localDanmu);
        setDanmakuCount(localDanmu.length);
        console.log(`加载本地弹幕: ${localDanmu.length} 条`);
      } else {
        console.log('未找到弹幕');
      }
    } catch (err) {
      console.error('加载弹幕失败:', err);
      setError('加载弹幕失败');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [enabled, player, generateLoadKey, loadFromCache, loadFromAPI, loadFromLocal]);

  // 清除弹幕
  const clearDanmaku = useCallback(() => {
    if (player?.plugins?.artplayerPluginDanmuku) {
      player.plugins.artplayerPluginDanmuku.load([]);
      setDanmakuCount(0);
    }
    currentLoadKeyRef.current = '';
  }, [player]);

  // 发送弹幕
  const sendDanmaku = useCallback((text: string, color: string, type: number) => {
    if (!player?.plugins?.artplayerPluginDanmuku) return;

    const danmu: DanmakuItem = {
      text,
      color,
      type,
      time: player.currentTime,
    };

    player.plugins.artplayerPluginDanmuku.emit(danmu);

    // TODO: 保存到本地数据库
  }, [player]);

  // 更新弹幕配置
  const updateConfig = useCallback((config: Partial<DanmakuConfig>) => {
    if (!player?.plugins?.artplayerPluginDanmuku) return;

    const plugin = player.plugins.artplayerPluginDanmuku;

    if (config.opacity !== undefined) {
      plugin.option.opacity = config.opacity;
    }
    if (config.fontSize !== undefined) {
      plugin.option.fontSize = config.fontSize;
    }
    if (config.speed !== undefined) {
      plugin.option.speed = config.speed;
    }
    if (config.unlimited !== undefined) {
      plugin.option.unlimited = config.unlimited;
    }
  }, [player]);

  // 当视频或集数变化时，重新加载弹幕
  useEffect(() => {
    if (enabled && player) {
      loadDanmaku();
    }
  }, [enabled, player, videoTitle, videoDoubanId, currentEpisodeIndex, loadDanmaku]);

  return {
    loading,
    error,
    danmakuCount,
    loadDanmaku,
    clearDanmaku,
    sendDanmaku,
    updateConfig,
  };
};
```

**验收标准**:
- ✅ 统一弹幕加载逻辑
- ✅ 支持缓存机制
- ✅ 错误处理完善
- ✅ API 清晰易用

---

## 中优先级优化

### 4. 性能优化

#### 问题分析
- **当前状态**:
  - useEffect 依赖不当导致重复渲染
  - 未使用 useMemo/useCallback 优化
  - timeupdate 事件处理频率过高

#### 优化目标
减少不必要的渲染和计算，提升页面流畅度

#### 实施步骤

##### 4.1 优化 useEffect 依赖 (30 分钟)
**目标**: 精确控制副作用执行时机

**优化点**:
1. 移除不必要的依赖
2. 使用 useCallback 稳定回调函数
3. 使用 useRef 存储不需要触发渲染的值

**示例**:
```typescript
// ❌ 之前：依赖过多导致频繁执行
useEffect(() => {
  loadDanmaku();
}, [videoTitle, videoYear, videoDoubanId, currentEpisodeIndex, player, enabled]);

// ✅ 之后：使用 useCallback + 精确依赖
const loadDanmaku = useCallback(async () => {
  // 使用 ref 获取最新值，避免依赖
  const currentPlayer = playerRef.current;
  if (!currentPlayer) return;

  // 加载逻辑
}, [videoTitle, videoDoubanId, currentEpisodeIndex]); // 只依赖真正变化的值

useEffect(() => {
  if (enabled) {
    loadDanmaku();
  }
}, [enabled, loadDanmaku]);
```

**验收标准**:
- ✅ 移除所有 eslint-disable 注释
- ✅ 依赖数组精确
- ✅ 无不必要的重复执行

##### 4.2 使用 useMemo 缓存计算结果 (30 分钟)
**目标**: 避免重复计算

**优化点**:
```typescript
// 1. 缓存弹幕加载键
const danmuLoadKey = useMemo(
  () => `${videoTitle}_${videoYear}_${videoDoubanId}_${currentEpisodeIndex + 1}`,
  [videoTitle, videoYear, videoDoubanId, currentEpisodeIndex]
);

// 2. 缓存播放源列表
const sortedSources = useMemo(
  () => sources.sort((a, b) => (b.score || 0) - (a.score || 0)),
  [sources]
);

// 3. 缓存集数分组
const episodeGroups = useMemo(() => {
  const groups = [];
  for (let i = 0; i < episodes.length; i += 50) {
    groups.push(episodes.slice(i, i + 50));
  }
  return groups;
}, [episodes]);

// 4. 缓存设备信息
const deviceInfo = useMemo(() => ({
  isMobile: /Mobile|Android|iPhone/i.test(navigator.userAgent),
  isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
  isAndroid: /Android/i.test(navigator.userAgent),
}), []);
```

**验收标准**:
- ✅ 所有昂贵计算都使用 useMemo
- ✅ 依赖数组准确
- ✅ 性能提升可测量

##### 4.3 使用 useCallback 稳定函数引用 (30 分钟)
**目标**: 避免子组件不必要的重渲染

**优化点**:
```typescript
// 1. 集数切换回调
const handleEpisodeChange = useCallback((index: number) => {
  setCurrentEpisodeIndex(index);
  // 其他逻辑
}, []); // 使用 setState 函数形式，不依赖外部变量

// 2. 换源回调
const handleSourceChange = useCallback((index: number) => {
  switchToSource(index);
}, [switchToSource]);

// 3. 播放器事件回调
const handleTimeUpdate = useCallback((currentTime: number) => {
  timeRef.current = currentTime;
  // 使用 ref 避免依赖
}, []);

const handleVideoEnded = useCallback(() => {
  // 自动播放下一集
  setCurrentEpisodeIndex(prev => prev + 1);
}, []);
```

**验收标准**:
- ✅ 所有传给子组件的函数都使用 useCallback
- ✅ 依赖数组最小化
- ✅ 子组件重渲染次数减少

##### 4.4 节流 timeupdate 事件 (30 分钟)
**文件**: `src/app/play/hooks/useThrottle.ts`

**实现节流 Hook**:
```typescript
import { useRef, useCallback, useEffect } from 'react';

export const useThrottle = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const lastRun = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRun.current;

      if (timeSinceLastRun >= delay) {
        callback(...args);
        lastRun.current = now;
      } else {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          callback(...args);
          lastRun.current = Date.now();
        }, delay - timeSinceLastRun);
      }
    },
    [callback, delay]
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback;
};
```

**使用节流**:
```typescript
// 在播放器事件中使用
const throttledTimeUpdate = useThrottle((currentTime: number) => {
  // 更新进度条
  setCurrentTime(currentTime);

  // 保存播放记录
  savePlayRecord(currentTime);
}, 1000); // 每秒执行一次

// 设置播放器事件
player.on('video:timeupdate', () => {
  throttledTimeUpdate(player.currentTime);
});
```

**验收标准**:
- ✅ timeupdate 执行频率降低到 1 次/秒
- ✅ UI 更新流畅
- ✅ 性能指标改善

##### 4.5 懒加载组件 (20 分钟)
**目标**: 减少初始加载时间

**实现**:
```typescript
import dynamic from 'next/dynamic';

// 懒加载非关键组件
const DanmakuSettings = dynamic(() => import('./components/DanmakuSettings'), {
  loading: () => <div>加载中...</div>,
});

const NetdiskSearch = dynamic(() => import('./components/NetdiskSearch'), {
  loading: () => <div>加载中...</div>,
});

const SkipSettings = dynamic(() => import('./components/SkipSettings'), {
  ssr: false, // 纯客户端组件
});
```

**验收标准**:
- ✅ 初始包体积减小
- ✅ 首屏加载时间缩短
- ✅ 懒加载组件正常工作

---

### 5. 增强类型安全

#### 问题分析
- **当前状态**: 大量使用 any 类型
- **影响**:
  - 失去类型检查保护
  - IDE 提示不准确
  - 运行时错误风险高

#### 优化目标
消除所有 any 类型，提供完整的类型定义

#### 实施步骤

##### 5.1 定义 Artplayer 类型 (30 分钟)
**文件**: `src/types/artplayer.d.ts`

```typescript
declare module 'artplayer' {
  export interface ArtplayerOptions {
    container: HTMLElement | string;
    url: string;
    poster?: string;
    title?: string;
    volume?: number;
    autoplay?: boolean;
    autoSize?: boolean;
    autoMini?: boolean;
    loop?: boolean;
    flip?: boolean;
    playbackRate?: boolean;
    aspectRatio?: boolean;
    screenshot?: boolean;
    setting?: boolean;
    hotkey?: boolean;
    pip?: boolean;
    mutex?: boolean;
    fullscreen?: boolean;
    fullscreenWeb?: boolean;
    subtitleOffset?: boolean;
    miniProgressBar?: boolean;
    playsInline?: boolean;
    layers?: any[];
    controls?: any[];
    settings?: any[];
    contextmenu?: any[];
    plugins?: any[];
    customType?: Record<string, (video: HTMLVideoElement, url: string) => void>;
  }

  export interface ArtplayerPlugin {
    name: string;
    [key: string]: any;
  }

  export default class Artplayer {
    constructor(options: ArtplayerOptions);

    // Properties
    video: HTMLVideoElement;
    currentTime: number;
    duration: number;
    volume: number;
    url: string;
    playing: boolean;
    plugins: Record<string, any>;

    // Methods
    play(): Promise<void>;
    pause(): void;
    toggle(): void;
    seek(time: number): void;
    forward(time: number): void;
    backward(time: number): void;
    switchUrl(url: string): Promise<void>;
    destroy(removeHtml?: boolean): void;
    on(event: string, callback: (...args: any[]) => void): void;
    once(event: string, callback: (...args: any[]) => void): void;
    off(event: string, callback?: (...args: any[]) => void): void;
  }
}
```

**验收标准**:
- ✅ Artplayer 相关代码无 any
- ✅ IDE 提供准确提示
- ✅ 类型检查通过

##### 5.2 定义弹幕插件类型 (20 分钟)
**文件**: `src/types/danmaku.d.ts`

```typescript
declare module 'artplayer-plugin-danmuku' {
  import Artplayer from 'artplayer';

  export interface DanmakuItem {
    text: string;
    time: number;
    color?: string;
    border?: boolean;
    mode?: 0 | 1 | 2; // 0: 滚动, 1: 顶部, 2: 底部
  }

  export interface DanmakuOptions {
    danmuku?: DanmakuItem[];
    speed?: number;
    opacity?: number;
    fontSize?: number;
    color?: string;
    mode?: 0 | 1 | 2;
    margin?: [number, number];
    antiOverlap?: boolean;
    useWorker?: boolean;
    synchronousPlayback?: boolean;
    filter?: (danmu: DanmakuItem) => boolean;
    lockTime?: number;
    maxLength?: number;
    minWidth?: number;
    maxWidth?: number;
    theme?: 'dark' | 'light';
    beforeVisible?: (danmu: DanmakuItem) => void;
    beforeEmit?: (danmu: DanmakuItem) => void;
    hls?: any;
    unlimited?: boolean;
  }

  export interface DanmakuPlugin {
    name: 'artplayerPluginDanmuku';
    load: (danmaku: DanmakuItem[]) => void;
    emit: (danmu: DanmakuItem) => void;
    config: (options: Partial<DanmakuOptions>) => void;
    hide: () => void;
    show: () => void;
    isHide: boolean;
    option: DanmakuOptions;
  }

  export default function artplayerPluginDanmuku(
    options: DanmakuOptions
  ): (art: Artplayer) => DanmakuPlugin;
}
```

**验收标准**:
- ✅ 弹幕相关代码无 any
- ✅ 弹幕配置类型安全
- ✅ 类型检查通过

##### 5.3 定义数据库类型 (20 分钟)
**文件**: `src/types/database.d.ts`

```typescript
// IndexedDB 相关类型
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

export interface SkipSegment {
  start: number;
  end: number;
  type: 'op' | 'ed' | 'preview';
}

export interface VideoSkipData {
  source: string;
  id: string;
  episode_index: number;
  segments: SkipSegment[];
  updated_at: number;
}
```

**验收标准**:
- ✅ 数据库操作类型安全
- ✅ 所有数据模型有类型定义
- ✅ 类型检查通过

##### 5.4 更新组件 Props 类型 (30 分钟)
**目标**: 为所有组件定义精确的 Props 类型

**示例**:
```typescript
// VideoPlayer.tsx
interface VideoPlayerProps {
  loading: boolean;
  error: string | null;
  loadingStage?: 'searching' | 'preferring' | 'fetching' | 'ready';
  loadingMessage?: string;
  speedTestProgress?: {
    current: number;
    total: number;
    currentSource: string;
    result?: string;
  } | null;
}

// EpisodeSelector.tsx
interface EpisodeSelectorProps {
  episodes: Episode[];
  currentEpisode: number;
  onEpisodeChange: (index: number) => void;
  disabled?: boolean;
}

// SourceSelector.tsx
interface SourceSelectorProps {
  sources: PlaySource[];
  currentIndex: number;
  testResults: Map<string, SourceTestResult>;
  onSourceChange: (index: number) => void;
  onTestSources?: () => void;
}
```

**验收标准**:
- ✅ 所有组件有明确的 Props 类型
- ✅ 可选属性标记正确
- ✅ 无 any 类型

---

### 6. 统一错误处理

#### 问题分析
- **当前状态**: 错误处理逻辑分散
- **影响**:
  - 错误信息不统一
  - 难以调试和监控
  - 用户体验不一致

#### 优化目标
创建统一的错误处理机制，提供一致的错误体验

#### 实施步骤

##### 6.1 定义错误类型 (20 分钟)
**文件**: `src/app/play/utils/errors.ts`

```typescript
export enum PlayErrorCode {
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',

  // 播放源错误
  SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND',
  SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE',
  SOURCE_PARSE_ERROR = 'SOURCE_PARSE_ERROR',

  // 播放器错误
  PLAYER_INIT_ERROR = 'PLAYER_INIT_ERROR',
  PLAYER_LOAD_ERROR = 'PLAYER_LOAD_ERROR',
  PLAYER_DECODE_ERROR = 'PLAYER_DECODE_ERROR',

  // 弹幕错误
  DANMAKU_LOAD_ERROR = 'DANMAKU_LOAD_ERROR',
  DANMAKU_SEND_ERROR = 'DANMAKU_SEND_ERROR',

  // 数据库错误
  DB_READ_ERROR = 'DB_READ_ERROR',
  DB_WRITE_ERROR = 'DB_WRITE_ERROR',

  // 未知错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class PlayError extends Error {
  constructor(
    public code: PlayErrorCode,
    message: string,
    public details?: unknown,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'PlayError';
  }

  // 获取用户友好的错误消息
  getUserMessage(): string {
    switch (this.code) {
      case PlayErrorCode.NETWORK_ERROR:
        return '网络连接失败，请检查您的网络设置';
      case PlayErrorCode.SOURCE_NOT_FOUND:
        return '未找到播放源，请尝试其他来源';
      case PlayErrorCode.SOURCE_UNAVAILABLE:
        return '当前播放源不可用，正在切换到备用源...';
      case PlayErrorCode.PLAYER_LOAD_ERROR:
        return '视频加载失败，请刷新页面重试';
      case PlayErrorCode.DANMAKU_LOAD_ERROR:
        return '弹幕加载失败，不影响视频播放';
      default:
        return '发生未知错误，请稍后重试';
    }
  }

  // 判断是否需要上报
  shouldReport(): boolean {
    return this.code !== PlayErrorCode.DANMAKU_LOAD_ERROR;
  }
}
```

**验收标准**:
- ✅ 错误类型完整
- ✅ 错误消息友好
- ✅ 支持错误分类

##### 6.2 创建错误处理 Hook (30 分钟)
**文件**: `src/app/play/hooks/useErrorHandler.ts`

```typescript
import { useState, useCallback } from 'react';
import { PlayError, PlayErrorCode } from '../utils/errors';

interface ErrorState {
  error: PlayError | null;
  hasError: boolean;
  errorCount: number;
}

export const useErrorHandler = () => {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    hasError: false,
    errorCount: 0,
  });

  // 处理错误
  const handleError = useCallback((error: unknown) => {
    let playError: PlayError;

    if (error instanceof PlayError) {
      playError = error;
    } else if (error instanceof Error) {
      playError = new PlayError(
        PlayErrorCode.UNKNOWN_ERROR,
        error.message,
        error
      );
    } else {
      playError = new PlayError(
        PlayErrorCode.UNKNOWN_ERROR,
        String(error)
      );
    }

    // 更新错误状态
    setErrorState(prev => ({
      error: playError,
      hasError: true,
      errorCount: prev.errorCount + 1,
    }));

    // 控制台输出详细错误信息
    console.error(
      `[${playError.code}] ${playError.message}`,
      playError.details
    );

    // 错误上报（可选）
    if (playError.shouldReport()) {
      reportError(playError);
    }

    return playError;
  }, []);

  // 清除错误
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      hasError: false,
      errorCount: 0,
    });
  }, []);

  // 重试机制
  const retry = useCallback(async <T,>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> => {
    let lastError: unknown;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }

    throw lastError;
  }, []);

  return {
    error: errorState.error,
    hasError: errorState.hasError,
    errorCount: errorState.errorCount,
    handleError,
    clearError,
    retry,
  };
};

// 错误上报函数（可扩展）
function reportError(error: PlayError) {
  // 可以发送到监控系统
  // 例如：Sentry, LogRocket 等
  if (process.env.NODE_ENV === 'production') {
    // 实现错误上报逻辑
  }
}
```

**验收标准**:
- ✅ 统一错误处理接口
- ✅ 支持重试机制
- ✅ 错误上报可配置

##### 6.3 在播放器中集成错误处理 (30 分钟)
**目标**: 在关键流程中使用统一错误处理

**示例**:
```typescript
const PlayPage = () => {
  const { error, handleError, clearError, retry } = useErrorHandler();

  // 初始化播放器（带错误处理）
  const initPlayer = useCallback(async () => {
    try {
      clearError();

      const player = await retry(async () => {
        return await initializePlayer({
          container: playerRef.current!,
          url: videoUrl,
          // ...
        });
      });

      playerInstanceRef.current = player;
    } catch (err) {
      handleError(new PlayError(
        PlayErrorCode.PLAYER_INIT_ERROR,
        '播放器初始化失败',
        err
      ));
    }
  }, [videoUrl, clearError, handleError, retry]);

  // 加载播放源（带错误处理）
  const loadVideoSource = useCallback(async () => {
    try {
      clearError();

      const url = await retry(async () => {
        return await fetchVideoUrl(source, id);
      });

      if (!url) {
        throw new PlayError(
          PlayErrorCode.SOURCE_NOT_FOUND,
          '未找到可用的播放源'
        );
      }

      setVideoUrl(url);
    } catch (err) {
      handleError(err);

      // 尝试切换到下一个播放源
      if (hasNextSource()) {
        switchToNextSource();
      }
    }
  }, [source, id, clearError, handleError, retry]);

  // 显示错误 UI
  return (
    <div>
      {error && (
        <ErrorAlert
          message={error.getUserMessage()}
          onRetry={error.recoverable ? () => window.location.reload() : undefined}
          onDismiss={clearError}
        />
      )}
      <VideoPlayer error={error?.getUserMessage() || null} {...otherProps} />
    </div>
  );
};
```

**验收标准**:
- ✅ 所有异步操作都有错误处理
- ✅ 错误消息统一友好
- ✅ 支持错误恢复

---

## 实施计划

### 第一阶段（高优先级）- 预计 5-6 小时
1. ✅ 创建类型定义文件 (30 分钟)
2. ✅ 实现统一状态管理 (2 小时)
3. ✅ 提取弹幕管理逻辑 (1 小时)
4. ✅ 拆分播放器初始化逻辑 (1.5 小时)
5. ✅ 重构主页面 (1 小时)

### 第二阶段（中优先级）- 预计 3-4 小时
6. ✅ 性能优化（useMemo/useCallback/节流）(2 小时)
7. ✅ 增强类型安全 (1 小时)
8. ✅ 统一错误处理 (1 小时)

### 验收标准

#### 代码质量
- [ ] 单个文件不超过 500 行
- [ ] 无 eslint 警告
- [ ] 无 TypeScript any 类型
- [ ] 测试覆盖率 > 70%

#### 性能指标
- [ ] 首屏加载时间 < 2s
- [ ] 播放器初始化时间 < 1s
- [ ] 换源响应时间 < 500ms
- [ ] 页面渲染帧率 > 30fps

#### 功能完整性
- [ ] 所有原有功能正常工作
- [ ] 无回归 bug
- [ ] 错误处理完善
- [ ] 用户体验提升

---

## 备注

- 优化过程中保持功能完整性，避免引入新 bug
- 每个阶段完成后进行充分测试
- 及时提交代码，避免改动过大
- 记录优化前后的性能对比数据
