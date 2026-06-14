# 高级埋点集成指南

本文档介绍如何为播放页面、搜索页面和源浏览器集成详细的埋点功能。

## 目录

1. [播放页面埋点](#播放页面埋点)
2. [搜索页面埋点](#搜索页面埋点)
3. [源浏览器埋点](#源浏览器埋点)
4. [最佳实践](#最佳实践)
5. [数据解读建议](#数据解读建议)

## 播放页面埋点

### 基础集成

```tsx
// src/app/play/[id]/page.tsx
'use client';

import { usePlayPageAnalytics } from '@/hooks/usePlayPageAnalytics';

interface PlayPageProps {
  params: { id: string };
  searchParams: { [key: string]: string };
}

export default function PlayPage({ params, searchParams }: PlayPageProps) {
  // 假设从API获取视频信息
  const [videoInfo, setVideoInfo] = useState(null);

  // 初始化播放页面埋点
  const analytics = usePlayPageAnalytics({
    videoId: params.id,
    videoTitle: videoInfo?.title || '未知视频',
    videoType: videoInfo?.type || 'movie',
    source: searchParams.source || 'default',
    duration: videoInfo?.duration,
    episodeNumber: videoInfo?.episodeNumber,
    seasonNumber: videoInfo?.seasonNumber,
    seriesId: videoInfo?.seriesId
  });

  return (
    <div>
      {/* 视频播放器组件 */}
      <VideoPlayer
        onPlay={(position, quality) => analytics.handlePlay(position, quality)}
        onPause={(position, reason) => analytics.handlePause(position, reason)}
        onSeek={(from, to) => analytics.handleSeek(from, to)}
        onQualityChange={(from, to, auto) => analytics.handleQualityChange(from, to, auto)}
        onBufferStart={() => analytics.handleBufferStart()}
        onBufferEnd={(duration) => analytics.handleBufferEnd(duration)}
        onError={(type, message) => analytics.handlePlayerError(type, message)}
        onSubtitleToggle={(enabled, lang) => analytics.handleSubtitleToggle(enabled, lang)}
        onSubtitleChange={(lang) => analytics.handleSubtitleChange(lang)}
        onSpeedChange={(speed) => analytics.handleSpeedChange(speed)}
        onVolumeChange={(volume) => analytics.handleVolumeChange(volume)}
        onFullscreenToggle={(isFullscreen) => analytics.handleFullscreenToggle(isFullscreen)}
      />

      {/* 用户互动按钮 */}
      <div className="flex gap-4 mt-4">
        <button onClick={() => analytics.handleLike()}>
          点赞
        </button>
        <button onClick={() => analytics.handleDislike()}>
          踩
        </button>
        <button onClick={() => analytics.trackVideoFavorite()}>
          收藏
        </button>
        <button onClick={() => analytics.trackVideoShare('wechat')}>
          分享到微信
        </button>
        <button onClick={() => analytics.handleReport('inappropriate', '内容不当')}>
          举报
        </button>
      </div>

      {/* 相关视频推荐 */}
      <div className="mt-6">
        <h3>相关推荐</h3>
        {relatedVideos.map((video, index) => (
          <VideoCard
            key={video.id}
            video={video}
            onClick={() => analytics.handleRelatedContentClick(video.id, video.title, index)}
          />
        ))}
      </div>
    </div>
  );
}
```

### 高级功能埋点

```tsx
// 视频加载性能监控
const handleVideoLoad = useCallback(async (videoUrl: string) => {
  const startTime = performance.now();

  try {
    const response = await fetch(videoUrl);
    const endTime = performance.now();

    analytics.trackVideoLoadTime(endTime - startTime, videoId, '720p');

    if (!response.ok) {
      analytics.handleNetworkError('network_error', {
        status: response.status,
        url: videoUrl
      });
    }
  } catch (error) {
    analytics.handleNetworkError('timeout', {
      timeout_duration: 10000,
      url: videoUrl
    });
  }
}, [analytics]);

// 自动播放质量调整
const handleAutoQualityAdjust = useCallback((availableQualities: string[], networkSpeed: number) => {
  const optimalQuality = selectOptimalQuality(availableQualities, networkSpeed);

  analytics.handleQualityChange(currentQuality, optimalQuality, true);
}, [analytics]);

// 弹幕系统集成
const handleDanmuInteraction = useCallback((danmuData: DanmuData[]) => {
  const {
    trackDanmuSend,
    trackDanmuToggle,
    trackDanmuSearch
  } = useDanmuAnalytics(videoId, videoTitle);

  // 发送弹幕
  const sendDanmu = (content: string, position: number) => {
    trackDanmuSend(content, position);
    // 实际发送逻辑...
  };

  // 搜索弹幕
  const searchDanmu = (keyword: string) => {
    trackDanmuSearch(keyword);
    // 实际搜索逻辑...
  };

  return { sendDanmu, searchDanmu };
}, [videoId, videoTitle]);
```

## 搜索页面埋点

### 基础集成

```tsx
// src/app/search/page.tsx
'use client';

import { useSearchPageAnalytics } from '@/hooks/useSearchPageAnalytics';
import { useState, useCallback } from 'react';

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [filters, setFilters] = useState({});

  const analytics = useSearchPageAnalytics({
    userId: getCurrentUserId(),
    userType: getCurrentUserType()
  });

  // 搜索处理
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    const startTime = performance.now();

    try {
      // 显示加载状态
      setIsLoading(true);

      // 执行搜索
      const results = await searchAPI(query, filters);
      const searchTime = performance.now() - startTime;

      // 埋点追踪
      analytics.handleSearch(query, results, searchTime, {
        category: filters.category,
        filters: filters,
        searchType: 'general',
        searchFrom: 'search_bar'
      });

      setSearchResults(results);

      if (results.length === 0) {
        const suggestions = await getSearchSuggestions(query);
        analytics.handleEmptyResults(query, suggestions);
      }

    } catch (error) {
      const searchTime = performance.now() - startTime;
      analytics.handleSearchError('api_error', error.message, query);
    } finally {
      setIsLoading(false);
    }
  }, [analytics, filters]);

  // 结果点击处理
  const handleResultClick = useCallback((result, position) => {
    analytics.handleResultClick(result, position);

    // 导航到详情页
    router.push(`/play/${result.id}`);
  }, [analytics]);

  // 过滤器处理
  const handleFilterChange = useCallback((filterType, value) => {
    const newFilters = { ...filters, [filterType]: value };
    setFilters(newFilters);
    analytics.handleFilterChange(filterType, value);

    // 如果有搜索查询，自动重新搜索
    if (searchQuery) {
      handleSearch(searchQuery);
    }
  }, [analytics, filters, searchQuery, handleSearch]);

  return (
    <div>
      {/* 搜索栏 */}
      <div className="search-container">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
          placeholder="搜索电影、电视剧..."
          className="search-input"
        />
        <button onClick={() => handleSearch(searchQuery)}>
          搜索
        </button>
      </div>

      {/* 搜索建议 */}
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => {
                analytics.handleSuggestionClick(suggestion, searchQuery, index);
                setSearchQuery(suggestion);
                handleSearch(suggestion);
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* 过滤器 */}
      <div className="filters">
        <select
          onChange={(e) => handleFilterChange('category', e.target.value)}
          value={filters.category || ''}
        >
          <option value="">全部分类</option>
          <option value="movie">电影</option>
          <option value="tv">电视剧</option>
          <option value="episode">剧集</option>
        </select>

        <select
          onChange={(e) => handleFilterChange('year', e.target.value)}
          value={filters.year || ''}
        >
          <option value="">全部年份</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="2022">2022</option>
        </select>

        <select
          onChange={(e) => handleFilterChange('quality', e.target.value)}
          value={filters.quality || ''}
        >
          <option value="">全部画质</option>
          <option value="4k">4K</option>
          <option value="1080p">1080P</option>
          <option value="720p">720P</option>
        </select>

        <button onClick={() => {
          analytics.handleFilterClear();
          setFilters({});
        }}>
          清除过滤
        </button>
      </div>

      {/* 排序选项 */}
      <div className="sort-options">
        <select
          onChange={(e) => analytics.handleSortChange(e.target.value.split('-')[0], e.target.value.split('-')[1])}
        >
          <option value="relevance-desc">相关性</option>
          <option value="rating-desc">评分最高</option>
          <option value="year-desc">最新上映</option>
          <option value="popularity-desc">最受欢迎</option>
        </select>
      </div>

      {/* 搜索结果 */}
      <div className="search-results">
        {searchResults.map((result, index) => (
          <VideoCard
            key={result.id}
            video={result}
            onClick={() => handleResultClick(result, index)}
          />
        ))}
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <button
          onClick={() => {
            analytics.handleLoadMore(searchResults.length, totalCount);
            loadMoreResults();
          }}
        >
          加载更多
        </button>
      )}
    </div>
  );
}
```

### 高级搜索功能

```tsx
// 语音搜索集成
const handleVoiceSearch = useCallback(() => {
  if (!('webkitSpeechRecognition' in window)) {
    analytics.handleSearchError('voice_not_supported', '浏览器不支持语音搜索');
    return;
  }

  const recognition = new (window as any).webkitSpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const voiceQuery = event.results[0][0].transcript;
    setSearchQuery(voiceQuery);
    analytics.handleAutoComplete(voiceQuery, [], -1);
    handleSearch(voiceQuery);
  };

  recognition.onerror = (event) => {
    analytics.handleSearchError('voice_recognition_error', event.error, searchQuery);
  };

  recognition.start();
}, [analytics, searchQuery]);

// 搜索历史管理
const handleSearchHistory = useCallback((action: 'add' | 'clear' | 'select', query?: string) => {
  switch (action) {
    case 'add':
      if (query && query.trim()) {
        analytics.trackFeatureUsage('search_history_add', true, {
          query,
          query_length: query.length
        });
        // 添加到历史记录逻辑...
      }
      break;

    case 'select':
      if (query) {
        setSearchQuery(query);
        handleSearch(query);
      }
      break;

    case 'clear':
      analytics.trackFeatureUsage('search_history_clear', true);
      // 清除历史记录逻辑...
      break;
  }
}, [analytics]);

// 热门搜索和趋势
const handleTrendingSearch = useCallback((trendingQueries: string[]) => {
  analytics.trackFeatureUsage('trending_searches_display', true, {
    trending_queries: trendingQueries.slice(0, 10),
    total_trending: trendingQueries.length
  });

  return trendingQueries.map(query => (
    <button
      key={query}
      onClick={() => {
        analytics.handleSuggestionClick(query, '', -1);
        setSearchQuery(query);
        handleSearch(query);
      }}
    >
      {query}
    </button>
  ));
}, [analytics]);
```

## 源浏览器埋点

### 基础集成

```tsx
// src/app/source-browser/page.tsx
'use client';

import { useSourceBrowserAnalytics } from '@/hooks/useSourceBrowserAnalytics';

export default function SourceBrowserPage() {
  const [sources, setSources] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [filters, setFilters] = useState({});
  const [viewMode, setViewMode] = useState('list');

  const analytics = useSourceBrowserAnalytics({
    userId: getCurrentUserId(),
    userType: getCurrentUserType()
  });

  // 加载源列表
  const loadSources = useCallback(async () => {
    const startTime = performance.now();

    try {
      const allSources = await fetchSourcesAPI();
      const loadTime = performance.now() - startTime;

      // 获取分类信息
      const categories = [...new Set(allSources.map(s => s.category).filter(Boolean))];

      analytics.handleSourceListLoad(allSources.length, loadTime, categories);
      setSources(allSources);

    } catch (error) {
      analytics.handleSourceError('network_error', '', error.message);
    }
  }, [analytics]);

  // 源点击处理
  const handleSourceClick = useCallback((source, position) => {
    analytics.handleSourceClick(source, position, 'all');

    // 导航到源详情页或显示详情
    showSourceDetails(source);
  }, [analytics]);

  // 源测试
  const handleSourceTest = useCallback(async (source) => {
    const startTime = performance.now();

    try {
      const result = await testSourceAPI(source.id);
      const responseTime = performance.now() - startTime;

      analytics.handleSourceTest(source,
        result.success ? 'success' : 'failure',
        responseTime,
        result.itemCount
      );

      // 更新源状态
      if (result.success) {
        updateSourceStatus(source.id, 'active');
      }

    } catch (error) {
      const responseTime = performance.now() - startTime;
      analytics.handleSourceTest(source, 'failure', responseTime);
    }
  }, [analytics]);

  // 过滤器处理
  const handleFilterChange = useCallback((filterType, value) => {
    const newFilters = { ...filters, [filterType]: value };
    setFilters(newFilters);
    analytics.handleFilterChange(filterType, value);

    // 应用过滤器
    applyFilters(newFilters);
  }, [analytics, filters]);

  // 批量操作
  const handleBatchOperation = useCallback(async (operation) => {
    const selectedIds = selectedSources.map(s => s.id);

    analytics.handleBatchOperation(operation, selectedIds, sources.length);

    try {
      switch (operation) {
        case 'enable':
          await enableSourcesAPI(selectedIds);
          break;
        case 'disable':
          await disableSourcesAPI(selectedIds);
          break;
        case 'delete':
          await deleteSourcesAPI(selectedIds);
          break;
        case 'test':
          await Promise.all(selectedIds.map(id =>
            testSourceAPI(id)
          ));
          break;
      }

      // 刷新源列表
      await loadSources();

    } catch (error) {
      analytics.handleBulkError(operation, selectedIds.length, error.message);
    }
  }, [selectedSources, sources.length, analytics, loadSources]);

  return (
    <div className="source-browser">
      {/* 工具栏 */}
      <div className="toolbar">
        <div className="actions">
          <button onClick={() => analytics.handleSourceAdd('api', '新API源')}>
            添加API源
          </button>
          <button onClick={() => analytics.handleSourceAdd('m3u', '新M3U源')}>
            添加M3U源
          </button>
          <button onClick={() => analytics.handleImportSources('file', 0)}>
            导入文件
          </button>
          <button onClick={() => analytics.handleExportSources('json', sources.length)}>
            导出源
          </button>
        </div>

        <div className="batch-actions">
          <button
            onClick={() => handleBatchOperation('enable')}
            disabled={selectedSources.length === 0}
          >
            批量启用
          </button>
          <button
            onClick={() => handleBatchOperation('disable')}
            disabled={selectedSources.length === 0}
          >
            批量禁用
          </button>
          <button
            onClick={() => handleBatchOperation('test')}
            disabled={selectedSources.length === 0}
          >
            批量测试
          </button>
        </div>
      </div>

      {/* 过滤器和搜索 */}
      <div className="filters-section">
        <div className="filters">
          <select
            onChange={(e) => handleFilterChange('status', e.target.value)}
            value={filters.status || ''}
          >
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="inactive">禁用</option>
            <option value="error">错误</option>
          </select>

          <select
            onChange={(e) => handleFilterChange('type', e.target.value)}
            value={filters.type || ''}
          >
            <option value="">全部类型</option>
            <option value="api">API</option>
            <option value="m3u">M3U</option>
            <option value="json">JSON</option>
          </select>

          <input
            type="text"
            placeholder="搜索源名称..."
            onChange={(e) => {
              if (e.target.value) {
                analytics.handleSearch(e.target.value, filteredSources.length, 0);
              }
            }}
          />
        </div>

        <div className="view-controls">
          <select
            onChange={(e) => {
              const mode = e.target.value;
              setViewMode(mode);
              analytics.handleViewModeChange(mode, mode === 'grid' ? 12 : 20);
            }}
            value={viewMode}
          >
            <option value="list">列表视图</option>
            <option value="grid">网格视图</option>
            <option value="cards">卡片视图</option>
          </select>

          <button onClick={() => analytics.handleSourceRefresh(sources.length, getActiveCount(), getErrorCount())}>
            刷新
          </button>
        </div>
      </div>

      {/* 源列表 */}
      <div className={`sources-list ${viewMode}`}>
        {filteredSources.map((source, index) => (
          <SourceCard
            key={source.id}
            source={source}
            selected={selectedSources.some(s => s.id === source.id)}
            onSelect={() => toggleSourceSelection(source)}
            onClick={() => handleSourceClick(source, index)}
            onTest={() => handleSourceTest(source)}
            onToggle={(newStatus) => analytics.handleSourceToggle(source, newStatus, source.status)}
            onEdit={() => analytics.handleSourceEdit(source, 'settings')}
            onDelete={() => {
              if (confirm('确定要删除这个源吗？')) {
                analytics.handleSourceDelete(source, 'user_delete');
                deleteSourceAPI(source.id);
              }
            }}
            onView={(duration) => analytics.handleSourceView(source, duration)}
          />
        ))}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => {
              analytics.handleLoadMore(currentPage, totalPages, sources.length);
              loadMoreSources();
            }}
            disabled={currentPage >= totalPages}
          >
            加载更多
          </button>
        </div>
      )}
    </div>
  );
}
```

### 高级源管理功能

```tsx
// 源性能监控
const handleSourcePerformanceMonitor = useCallback((sourceId: string) => {
  const monitorInterval = setInterval(async () => {
    try {
      const startTime = performance.now();
      const result = await testSourceAPI(sourceId);
      const responseTime = performance.now() - startTime;

      analytics.trackFeatureUsage('source_performance_monitor', true, {
        source_id: sourceId,
        response_time: responseTime,
        success: result.success,
        item_count: result.itemCount,
        timestamp: Date.now()
      });

      // 更新实时性能数据
      updateSourcePerformance(sourceId, {
        responseTime,
        success: result.success,
        lastChecked: new Date()
      });

    } catch (error) {
      analytics.handleSourceError('monitor_error', sourceId, error.message);
    }
  }, 30000); // 每30秒检查一次

  return () => clearInterval(monitorInterval);
}, [analytics]);

// 源健康检查
const performSourceHealthCheck = useCallback(async () => {
  const sources = await fetchSourcesAPI();
  const healthResults = [];

  for (const source of sources) {
    try {
      const result = await testSourceAPI(source.id);

      healthResults.push({
        sourceId: source.id,
        status: result.success ? 'healthy' : 'unhealthy',
        responseTime: result.responseTime,
        itemCount: result.itemCount,
        error: result.error
      });

      analytics.handleSourceTest(source, result.success ? 'success' : 'failure', result.responseTime, result.itemCount);

    } catch (error) {
      healthResults.push({
        sourceId: source.id,
        status: 'error',
        error: error.message
      });

      analytics.handleSourceError('health_check_error', source.id, error.message);
    }
  }

  // 生成健康报告
  const healthyCount = healthResults.filter(r => r.status === 'healthy').length;
  const unhealthyCount = healthResults.filter(r => r.status === 'unhealthy').length;
  const errorCount = healthResults.filter(r => r.status === 'error').length;

  analytics.trackConversion('source_health_check', {
    eventName: 'bulk_source_validation',
    step: 'health_check_complete',
    success: true,
    metadata: {
      total_sources: sources.length,
      healthy_sources: healthyCount,
      unhealthy_sources: unhealthyCount,
      error_sources: errorCount,
      health_rate: (healthyCount / sources.length) * 100
    }
  });

  return healthResults;
}, [analytics]);
```

## 最佳实践

### 1. 埋点命名规范

- 使用描述性强的事件名称
- 保持命名一致性
- 避免使用缩写和特殊字符

```tsx
// ✅ 好的命名
analytics.trackFeatureUsage('video_play_start', true, metadata);

// ❌ 避免的命名
analytics.trackFeatureUsage('vdoPlay', true, metadata);
```

### 2. 元数据收集

- 收集有意义的上下文信息
- 避免收集敏感数据
- 保持数据结构一致性

```tsx
// ✅ 完整的元数据
trackFeatureUsage('player_control', true, {
  action: 'play',
  video_id: videoId,
  video_type: 'movie',
  position: 120.5,
  quality: '720p',
  session_id: sessionId
});
```

### 3. 错误处理

- 捕获所有可能的异常
- 提供详细的错误信息
- 不影响主要功能

```tsx
const safeTrack = useCallback(() => {
  try {
    analytics.trackFeatureUsage('user_action', true, metadata);
  } catch (error) {
    console.warn('Analytics tracking failed:', error);
  }
}, [analytics, metadata]);
```

### 4. 性能考虑

- 避免在高频事件中过度埋点
- 使用防抖和节流
- 批量发送数据

```tsx
// 使用防抖的搜索埋点
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    analytics.handleSearch(query, results, searchTime);
  }, 300),
  [analytics]
);
```

## 数据解读建议

### 播放页面分析指标

1. **视频完成率** - 追踪用户观看完整视频的比例
2. **缓冲频率** - 监控视频播放流畅度
3. **质量切换次数** - 了解网络状况和用户偏好
4. **字幕使用率** - 了解无障碍功能使用情况

### 搜索页面分析指标

1. **搜索成功率** - 有结果搜索的比例
2. **结果点击率** - 搜索结果转化效果
3. **过滤器使用率** - 用户精细化搜索需求
4. **搜索会话深度** - 用户搜索行为复杂度

### 源浏览器分析指标

1. **源健康度** - 源的可用性和性能
2. **用户操作模式** - 用户如何管理和配置源
3. **导入导出频率** - 批量操作的使用情况
4. **源测试行为** - 用户验证源的习惯

通过这些详细的埋点，你可以获得深入的用户行为洞察，优化用户体验和产品功能。