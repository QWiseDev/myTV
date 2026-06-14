# JSX 组件拆分示例

## 重构前后对比

### 重构前 (4786 行)

```typescript
// page.tsx - 所有逻辑和 JSX 都在一个文件
export default function PlayPage() {
  // 200+ 行状态和 hooks
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // ... 更多状态

  // 1500+ 行业务逻辑函数
  const handlePlayVideo = useCallback(async () => {
    // 400 行播放逻辑
  }, []);

  const handleSourceChange = useCallback(async () => {
    // 300 行换源逻辑
  }, []);

  // ... 更多函数

  // 2000+ 行 useEffect
  useEffect(() => {
    // 初始化逻辑
  }, []);

  // ... 更多 effects

  // 3863 行 JSX
  return (
    <PageLayout>
      <div>
        {/* 播放器区域 - 200 行 */}
        <div className='...'>
          <VideoPlayer />
          <CoverImage />
          <FavoriteButton />
        </div>

        {/* 集数选择器 - 150 行 */}
        <div className='...'>
          <EpisodeSelector />
        </div>

        {/* 详情信息 - 200 行 */}
        <div className='...'>
          <MovieDetails />
          <BangumiDetails />
        </div>

        {/* ... 更多 JSX */}
      </div>
    </PageLayout>
  );
}
```

### 重构后 (~500 行)

```typescript
// page.tsx - 只负责组合
export default function PlayPage() {
  const player = useVideoPlayer();
  const sources = useSourceManager();
  const episodes = useEpisodeManager();

  return (
    <PageLayout>
      <div className='flex flex-col gap-3 py-4 px-5'>
        <VideoTitle title={player.title} episode={episodes.current} />

        <div className='grid gap-4 md:grid-cols-4'>
          <PlayerContainer
            loading={player.loading}
            error={player.error}
            onRetry={player.retry}
          />

          <EpisodePanel
            episodes={episodes.list}
            current={episodes.current}
            onChange={episodes.change}
          />
        </div>

        <DetailsSection details={player.details} />
        <SourceSection sources={sources.list} onChange={sources.change} />
      </div>
    </PageLayout>
  );
}
```

## 已创建的组件

### 1. PlayerContainer.tsx (~40 行)

封装播放器相关 UI：
- VideoPlayer
- CoverImage
- FavoriteButton
- 重试按钮

### 2. EpisodePanel.tsx (~60 行)

封装集数选择器：
- 折叠/展开控制
- EpisodeSelector
- 响应式布局

## 下一步拆分

### 3. DetailsSection (~150 行)

```typescript
// components/play/DetailsSection.tsx
export default function DetailsSection({ movieDetails, bangumiDetails }) {
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {movieDetails && <MovieInfo details={movieDetails} />}
      {bangumiDetails && <BangumiInfo details={bangumiDetails} />}
    </div>
  );
}
```

### 4. SourceSection (~100 行)

```typescript
// components/play/SourceSection.tsx
export default function SourceSection({ sources, current, onChange }) {
  return (
    <div className='space-y-2'>
      <h3>播放源</h3>
      <div className='grid gap-2'>
        {sources.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            active={source.id === current}
            onClick={() => onChange(source)}
          />
        ))}
      </div>
    </div>
  );
}
```

### 5. NetdiskSection (~80 行)

```typescript
// components/play/NetdiskSection.tsx
export default function NetdiskSection({ results, loading, onSearch }) {
  return (
    <div className='space-y-2'>
      <SearchInput onSearch={onSearch} />
      {loading ? <Spinner /> : <ResultsList results={results} />}
    </div>
  );
}
```

## 预期效果

```
重构前:
page.tsx: 4786 行 (100%)

重构后:
page.tsx:              ~500 行 (10%)
PlayerContainer:        ~40 行
EpisodePanel:           ~60 行
DetailsSection:        ~150 行
SourceSection:         ~100 行
NetdiskSection:         ~80 行
其他小组件:            ~200 行
────────────────────────────────
总计:                 ~1130 行 (24%)

减少: 3656 行 (76%)
```

## 关键原则

1. **单一职责**: 每个组件只做一件事
2. **最小化 props**: 只传必要的数据
3. **保持简洁**: 每个组件 < 100 行
4. **易于测试**: 组件独立可测试
