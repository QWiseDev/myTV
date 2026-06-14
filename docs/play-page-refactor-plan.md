# Play Page 重构计划

## 现状分析

**当前代码量**: 4786 行

### 代码分布（估算）

```
📦 page.tsx (4786 行)
├── 导入语句           ~70 行
├── 状态管理           ~120 行
├── 业务逻辑函数       ~1600 行
│   ├── 播放逻辑       ~400 行
│   ├── 换源逻辑       ~300 行
│   ├── 搜索逻辑       ~200 行
│   ├── 测速逻辑       ~200 行
│   ├── 初始化逻辑     ~300 行
│   └── 其他工具函数   ~200 行
├── useEffect 副作用   ~2000 行
└── JSX 渲染           ~1000 行
```

## 问题诊断

### 1. 巨型组件问题
- 单个组件承担太多职责
- 难以测试和维护
- 代码复用性差

### 2. 逻辑耦合严重
- 播放、换源、搜索、测速逻辑混在一起
- 状态管理分散
- 副作用过多且复杂

### 3. JSX 过于复杂
- 1000+ 行 JSX
- 嵌套层级深
- 条件渲染多

## 重构方案

### 阶段 1: 业务逻辑抽离 (优先级: 高)

#### 1.1 播放逻辑 → useVideoPlayer Hook

```typescript
// src/app/play/hooks/useVideoPlayer.ts
export function useVideoPlayer() {
  const handlePlayVideo = useCallback(async (url: string) => {
    // 播放逻辑
  }, []);

  const handleRetry = useCallback(() => {
    // 重试逻辑
  }, []);

  return { handlePlayVideo, handleRetry };
}
```

**预计减少**: ~400 行

#### 1.2 换源逻辑 → useSourceManager Hook

```typescript
// src/app/play/hooks/useSourceManager.ts
export function useSourceManager() {
  const handleSourceChange = useCallback(async (source: SearchResult) => {
    // 换源逻辑
  }, []);

  const searchAvailableSources = useCallback(async () => {
    // 搜索可用源
  }, []);

  return { handleSourceChange, availableSources };
}
```

**预计减少**: ~300 行

#### 1.3 测速逻辑 → useSourceSpeedTest Hook

```typescript
// src/app/play/hooks/useSourceSpeedTest.ts
export function useSourceSpeedTest() {
  const testSourceSpeed = useCallback(async (sources: SearchResult[]) => {
    // 测速逻辑
  }, []);

  const preferSource = useCallback(async () => {
    // 优选逻辑
  }, []);

  return { testSourceSpeed, preferSource, speedTestProgress };
}
```

**预计减少**: ~400 行

#### 1.4 搜索逻辑 → useVideoSearch Hook

```typescript
// src/app/play/hooks/useVideoSearch.ts
export function useVideoSearch() {
  const searchAndPlay = useCallback(async (title: string) => {
    // 搜索逻辑
  }, []);

  return { searchAndPlay, searchResults };
}
```

**预计减少**: ~200 行

### 阶段 2: 组件拆分 (优先级: 高)

#### 2.1 播放器区域

```typescript
// src/components/play/PlayerSection.tsx
export function PlayerSection({
  loading,
  error,
  onRetry
}) {
  return (
    <div>
      <VideoPlayer />
      <PlayerControls />
    </div>
  );
}
```

**预计减少**: ~200 行

#### 2.2 集数选择器区域

```typescript
// src/components/play/EpisodeSection.tsx
export function EpisodeSection({
  episodes,
  currentIndex,
  onChange
}) {
  return <EpisodeSelector />;
}
```

**预计减少**: ~150 行

#### 2.3 详情信息区域

```typescript
// src/components/play/DetailsSection.tsx
export function DetailsSection({
  movieDetails,
  bangumiDetails
}) {
  return (
    <div>
      <MovieInfo />
      <BangumiInfo />
    </div>
  );
}
```

**预计减少**: ~200 行

#### 2.4 换源区域

```typescript
// src/components/play/SourceSection.tsx
export function SourceSection({
  sources,
  currentSource,
  onSourceChange
}) {
  return <SourceSelector />;
}
```

**预计减少**: ~150 行

### 阶段 3: 状态管理优化 (优先级: 中)

#### 3.1 使用 Context 减少 prop drilling

```typescript
// src/contexts/PlayContext.tsx
export const PlayContext = createContext<PlayContextValue>(null);

export function PlayProvider({ children }) {
  const player = useVideoPlayer();
  const sources = useSourceManager();
  const speedTest = useSourceSpeedTest();

  return (
    <PlayContext.Provider value={{ player, sources, speedTest }}>
      {children}
    </PlayContext.Provider>
  );
}
```

**预计减少**: ~100 行

### 阶段 4: 副作用整理 (优先级: 中)

#### 4.1 合并相关的 useEffect

```typescript
// 播放器初始化相关的 effect 合并
useEffect(() => {
  // 初始化播放器
  // 加载播放记录
  // 设置事件监听
}, [player]);
```

**预计减少**: ~300 行

## 重构后预期结构

```
src/app/play/
├── page.tsx                    (~800 行) ⬇️ 83%
│   └── 主要负责组合和布局
├── hooks/
│   ├── useVideoPlayer.ts       (~200 行)
│   ├── useSourceManager.ts     (~150 行)
│   ├── useSourceSpeedTest.ts   (~200 行)
│   ├── useVideoSearch.ts       (~100 行)
│   └── useDanmakuManager.v2.ts (已完成)
└── components/
    ├── PlayerSection.tsx       (~150 行)
    ├── EpisodeSection.tsx      (~100 行)
    ├── DetailsSection.tsx      (~150 行)
    └── SourceSection.tsx       (~100 行)
```

## 预期收益

| 指标 | 当前 | 重构后 | 改善 |
|------|------|--------|------|
| page.tsx 行数 | 4786 | ~800 | ⬇️ 83% |
| 单个文件最大行数 | 4786 | ~200 | ⬇️ 96% |
| 可测试性 | ❌ | ✅ | - |
| 可维护性 | ⚠️ | ✅ | - |
| 代码复用 | ❌ | ✅ | - |

## 实施计划

### Week 1: 业务逻辑抽离
- [ ] Day 1-2: useVideoPlayer
- [ ] Day 3: useSourceManager
- [ ] Day 4: useSourceSpeedTest
- [ ] Day 5: useVideoSearch

### Week 2: 组件拆分
- [ ] Day 1: PlayerSection
- [ ] Day 2: EpisodeSection
- [ ] Day 3: DetailsSection
- [ ] Day 4: SourceSection
- [ ] Day 5: 集成测试

### Week 3: 优化和清理
- [ ] Day 1-2: Context 优化
- [ ] Day 3: useEffect 整理
- [ ] Day 4-5: 测试和文档

## 风险控制

1. **渐进式重构**: 每次只重构一个模块
2. **保持功能**: 确保重构不影响现有功能
3. **充分测试**: 每个模块都要测试
4. **可回滚**: 保留旧代码，出问题可快速回滚
