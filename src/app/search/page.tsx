/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { ChevronUp, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useState } from 'react';

import { logAccess } from '@/lib/access-log';
import {
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { safeJsonParse } from '@/lib/safe-storage';
import { useSearchPageAnalytics } from '@/hooks/useSearchPageAnalytics';

import NetDiskSearchResults from '@/components/NetDiskSearchResults';
import PageLayout from '@/components/PageLayout';
import SearchSuggestions from '@/components/SearchSuggestions';

import { TmdbActorResults } from './_components/TmdbActorResults';
import { VideoResultsSection } from './_components/VideoResultsSection';
import {
  YouTubeDirectMode,
  YouTubeModeSwitch,
  YouTubeSearchResults,
} from './_components/YouTubeSearchResults';
import { useNetdiskSearch } from './hooks/useNetdiskSearch';
import {
  SearchFilterValues,
  useSearchFilters,
} from './hooks/useSearchFilters';
import { useTmdbActorSearch } from './hooks/useTmdbActorSearch';
import { useVideoSearch } from './hooks/useVideoSearch';
import { useYouTubeSearch } from './hooks/useYouTubeSearch';

function SearchPageClient() {
  // 📊 搜索页面分析埋点
  const analytics = useSearchPageAnalytics({
    userId: '', // 可以根据实际用户系统传入
    userType: 'guest', // 可以根据实际用户系统传入
  });

  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');

  // 网盘搜索相关状态
  const [searchType, setSearchType] = useState<
    'video' | 'netdisk' | 'youtube' | 'tmdb-actor'
  >('video');

  // YouTube模式
  const [youtubeMode, setYoutubeMode] = useState<'search' | 'direct'>('search');

  // TMDB筛选面板显示状态
  const [tmdbFilterVisible, setTmdbFilterVisible] = useState(false);

  // 过滤器：非聚合与聚合
  const [filterAll, setFilterAll] = useState<SearchFilterValues>({
    source: 'all',
    title: 'all',
    year: 'all',
    yearOrder: 'none',
  });
  const [filterAgg, setFilterAgg] = useState<SearchFilterValues>({
    source: 'all',
    title: 'all',
    year: 'all',
    yearOrder: 'none',
  });

  // 获取默认聚合设置：只读取用户本地设置，默认为 true
  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return safeJsonParse<boolean>(userSetting, true);
      }
    }
    return true; // 默认启用聚合
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() => {
    return getDefaultAggregate() ? 'agg' : 'all';
  });

  // 影视/聚合搜索：状态、流式连接与结果缓冲（拆分至 useVideoSearch）
  const {
    searchResults,
    isLoading,
    showResults,
    showSuggestions,
    totalSources,
    completedSources,
    useFluidSearch,
    setShowResults,
    setIsLoading,
    setShowSuggestions,
  } = useVideoSearch({
    viewMode,
    filterAgg,
    filterAll,
    onQueryChange: setSearchQuery,
    analytics,
  });

  // 网盘 / YouTube / TMDB演员三路搜索（各拆分至独立 hook）
  const {
    netdiskResults,
    setNetdiskResults,
    netdiskLoading,
    netdiskError,
    setNetdiskError,
    netdiskTotal,
    setNetdiskTotal,
    handleNetDiskSearch,
  } = useNetdiskSearch();
  const {
    youtubeResults,
    setYoutubeResults,
    youtubeLoading,
    youtubeError,
    setYoutubeError,
    youtubeWarning,
    setYoutubeWarning,
    youtubeContentType,
    setYoutubeContentType,
    youtubeSortOrder,
    setYoutubeSortOrder,
    handleYouTubeSearch,
  } = useYouTubeSearch();
  const {
    tmdbActorResults,
    setTmdbActorResults,
    tmdbActorLoading,
    tmdbActorError,
    setTmdbActorError,
    tmdbActorType,
    setTmdbActorType,
    tmdbFilterState,
    setTmdbFilterState,
    handleTmdbActorSearch,
  } = useTmdbActorSearch();

  // 过滤/排序与聚合分组（拆分至 useSearchFilters）
  const { filterOptions, filteredAllResults, filteredAggResults } =
    useSearchFilters({
      searchResults,
      searchQuery,
      filterAll,
      filterAgg,
    });

  useEffect(() => {
    // 📊 记录搜索页面访问
    logAccess('search_page', {
      initialQuery: searchParams.get('q') || '',
      searchType,
      hasResults: showResults,
    });

    // 无搜索参数时聚焦搜索框
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    // 初始加载搜索历史
    getSearchHistory().then(setSearchHistory);

    // 检查URL参数并处理初始搜索
    const initialQuery = searchParams.get('q');
    if (initialQuery) {
      setSearchQuery(initialQuery);
      setShowResults(true);
      // 如果当前是网盘搜索模式，触发网盘搜索
      if (searchType === 'netdisk') {
        handleNetDiskSearch(initialQuery);
      }
    }

    // 监听搜索历史更新事件
    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      },
    );

    // 获取滚动位置的函数 - 专门针对 body 滚动
    const getScrollTop = () => {
      return document.body.scrollTop || 0;
    };

    // 使用 requestAnimationFrame 持续检测滚动位置
    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;

      const scrollTop = getScrollTop();
      const shouldShow = scrollTop > 300;
      setShowBackToTop(shouldShow);

      requestAnimationFrame(checkScrollPosition);
    };

    // 启动持续检测
    isRunning = true;
    checkScrollPosition();

    // 监听 body 元素的滚动事件
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      unsubscribe();
      isRunning = false; // 停止 requestAnimationFrame 循环

      // 移除 body 滚动事件监听器
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 监听搜索类型变化，如果切换到网盘/YouTube/TMDB演员搜索且有搜索词，立即搜索
  useEffect(() => {
    if (
      (searchType === 'netdisk' ||
        searchType === 'youtube' ||
        searchType === 'tmdb-actor') &&
      showResults
    ) {
      const currentQuery = searchQuery.trim() || searchParams.get('q');
      if (currentQuery) {
        if (
          searchType === 'netdisk' &&
          !netdiskLoading &&
          !netdiskResults &&
          !netdiskError
        ) {
          handleNetDiskSearch(currentQuery);
        } else if (
          searchType === 'youtube' &&
          !youtubeLoading &&
          !youtubeResults &&
          !youtubeError
        ) {
          handleYouTubeSearch(currentQuery);
        } else if (
          searchType === 'tmdb-actor' &&
          !tmdbActorLoading &&
          !tmdbActorResults &&
          !tmdbActorError
        ) {
          handleTmdbActorSearch(currentQuery, tmdbActorType, tmdbFilterState);
        }
      }
    }
  }, [
    searchType,
    showResults,
    searchQuery,
    searchParams,
    netdiskLoading,
    netdiskResults,
    netdiskError,
    youtubeLoading,
    youtubeResults,
    youtubeError,
    tmdbActorLoading,
    tmdbActorResults,
    tmdbActorError,
  ]);



  // 输入框内容变化时触发，显示搜索建议
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (value.trim()) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  // 搜索框聚焦时触发，显示搜索建议
  const handleInputFocus = () => {
    if (searchQuery.trim()) {
      setShowSuggestions(true);
    }
  };

  // 搜索类型切换：统一清空各路搜索状态（含此前各按钮遗漏的
  // youtubeWarning / netdiskTotal），再按目标类型触发对应搜索
  const handleSearchTypeSwitch = (
    type: 'video' | 'netdisk' | 'youtube' | 'tmdb-actor',
  ) => {
    // 📊 分析埋点：搜索类型切换
    analytics.handleFilterChange('search_type', type);
    setSearchType(type);

    setNetdiskResults(null);
    setNetdiskError(null);
    setNetdiskTotal(0);
    setYoutubeResults(null);
    setYoutubeError(null);
    setYoutubeWarning(null);
    // 注意：不重置 YouTube 排序和内容类型，保持用户选择
    setTmdbActorResults(null);
    setTmdbActorError(null);

    const currentQuery = searchQuery.trim() || searchParams?.get('q');
    if (!currentQuery || !showResults) return;

    if (type === 'netdisk') {
      handleNetDiskSearch(currentQuery);
    } else if (type === 'youtube') {
      // 强制脱离当前事件批次重新搜索
      setTimeout(() => handleYouTubeSearch(currentQuery), 0);
    } else if (type === 'tmdb-actor') {
      handleTmdbActorSearch(currentQuery, tmdbActorType, tmdbFilterState);
    } else {
      // 影视搜索由 searchParams 变化的 effect 处理
      setIsLoading(true);
      router.push(`/search?q=${encodeURIComponent(currentQuery)}`);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    // 回显搜索框
    setSearchQuery(trimmed);
    setShowSuggestions(false);
    setShowResults(true);

    if (searchType === 'netdisk') {
      // 网盘搜索 - 也更新URL保持一致性
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      handleNetDiskSearch(trimmed);
    } else if (searchType === 'youtube') {
      // YouTube搜索
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      handleYouTubeSearch(trimmed);
    } else if (searchType === 'tmdb-actor') {
      // TMDB演员搜索
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      handleTmdbActorSearch(trimmed, tmdbActorType, tmdbFilterState);
    } else {
      // 原有的影视搜索逻辑
      setIsLoading(true);
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);

      // 其余由 searchParams 变化的 effect 处理
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    // 📊 分析埋点：搜索建议点击
    analytics.handleSuggestionClick(suggestion, searchQuery, 0);

    setSearchQuery(suggestion);
    setShowSuggestions(false);

    // 自动执行搜索
    setIsLoading(true);
    setShowResults(true);

    router.push(`/search?q=${encodeURIComponent(suggestion)}`);
    // 其余由 searchParams 变化的 effect 处理
  };

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据调试结果，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  // 当前搜索词：搜索框内容优先，其次 URL q 参数（各结果区组件共用）
  const currentQuery = searchQuery.trim() || searchParams?.get('q');

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        {/* 搜索框区域 - 美化版 */}
        <div className='mb-8'>
          {/* 搜索类型选项卡 - 美化版 */}
          <div className='max-w-2xl mx-auto mb-6'>
            <div className='flex items-center justify-center'>
              <div className='inline-flex items-center bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-750 dark:to-gray-800 rounded-xl p-1.5 space-x-2 shadow-lg border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm'>
                <button
                  type='button'
                  onClick={() => handleSearchTypeSwitch('video')}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 relative overflow-hidden ${
                    searchType === 'video'
                      ? 'bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30 scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  🎬 影视资源
                </button>
                <button
                  type='button'
                  onClick={() => handleSearchTypeSwitch('netdisk')}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 relative overflow-hidden ${
                    searchType === 'netdisk'
                      ? 'bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  💾 网盘资源
                </button>
                <button
                  type='button'
                  onClick={() => handleSearchTypeSwitch('youtube')}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 relative overflow-hidden ${
                    searchType === 'youtube'
                      ? 'bg-gradient-to-br from-red-400 via-red-500 to-rose-600 text-white shadow-lg shadow-red-500/30 scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  📺 YouTube
                </button>
                <button
                  type='button'
                  onClick={() => handleSearchTypeSwitch('tmdb-actor')}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 relative overflow-hidden ${
                    searchType === 'tmdb-actor'
                      ? 'bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/30 scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  🎬 TMDB演员
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleSearch} className='max-w-2xl mx-auto'>
            <div className='relative group'>
              {/* 搜索图标 - 增强动画 */}
              <Search className='absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-all duration-300 group-focus-within:text-green-500 dark:group-focus-within:text-green-400 group-focus-within:scale-110' />

              {/* 搜索框 - 美化版 */}
              <input
                id='searchInput'
                type='text'
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder={
                  searchType === 'video'
                    ? '🎬 搜索电影、电视剧...'
                    : searchType === 'netdisk'
                      ? '💾 搜索网盘资源...'
                      : searchType === 'youtube'
                        ? '📺 搜索YouTube视频...'
                        : '🎭 搜索演员姓名...'
                }
                autoComplete='off'
                className='w-full h-14 rounded-xl bg-white/90 py-4 pl-12 pr-14 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:bg-white border-2 border-gray-200/80 shadow-lg hover:shadow-xl focus:shadow-2xl focus:border-green-400 transition-all duration-300 dark:bg-gray-800/90 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-800 dark:border-gray-700 dark:focus:border-green-500 backdrop-blur-sm'
              />

              {/* 清除按钮 - 美化版 */}
              {searchQuery && (
                <button
                  type='button'
                  onClick={() => {
                    setSearchQuery('');
                    setShowSuggestions(false);
                    document.getElementById('searchInput')?.focus();
                  }}
                  className='absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-gray-200/80 hover:bg-red-500 text-gray-500 hover:text-white transition-all duration-300 hover:scale-110 hover:rotate-90 dark:bg-gray-700/80 dark:text-gray-400 dark:hover:bg-red-600 shadow-sm hover:shadow-md'
                  aria-label='清除搜索内容'
                >
                  <X className='h-4 w-4' />
                </button>
              )}

              {/* 搜索建议 */}
              <SearchSuggestions
                query={searchQuery}
                isVisible={showSuggestions}
                onSelect={handleSuggestionSelect}
                onClose={() => setShowSuggestions(false)}
                onEnterKey={() => {
                  // 当用户按回车键时，使用搜索框的实际内容进行搜索
                  const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
                  if (!trimmed) return;

                  // 回显搜索框
                  setSearchQuery(trimmed);
                  setIsLoading(true);
                  setShowResults(true);
                  setShowSuggestions(false);

                  router.push(`/search?q=${encodeURIComponent(trimmed)}`);
                }}
              />
            </div>
          </form>
        </div>

        {/* 搜索结果或搜索历史 */}
        <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
          {showResults ? (
            <section className='mb-12'>
              {searchType === 'netdisk' ? (
                /* 网盘搜索结果 */
                <>
                  <div className='mb-4'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      网盘搜索结果
                      {netdiskLoading && (
                        <span className='ml-2 inline-block align-middle'>
                          <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin'></span>
                        </span>
                      )}
                    </h2>
                  </div>
                  <NetDiskSearchResults
                    results={netdiskResults}
                    loading={netdiskLoading}
                    error={netdiskError}
                    total={netdiskTotal}
                  />
                </>
              ) : searchType === 'tmdb-actor' ? (
                /* TMDB演员搜索结果 */
                <TmdbActorResults
                  tmdbActorResults={tmdbActorResults}
                  tmdbActorLoading={tmdbActorLoading}
                  tmdbActorError={tmdbActorError}
                  tmdbActorType={tmdbActorType}
                  tmdbFilterState={tmdbFilterState}
                  tmdbFilterVisible={tmdbFilterVisible}
                  currentQuery={currentQuery}
                  setTmdbActorType={setTmdbActorType}
                  setTmdbFilterState={setTmdbFilterState}
                  setTmdbFilterVisible={setTmdbFilterVisible}
                  handleTmdbActorSearch={handleTmdbActorSearch}
                />
              ) : searchType === 'youtube' ? (
                /* YouTube搜索结果 */
                <YouTubeSearchResults
                  youtubeResults={youtubeResults}
                  youtubeLoading={youtubeLoading}
                  youtubeError={youtubeError}
                  youtubeWarning={youtubeWarning}
                  youtubeMode={youtubeMode}
                  youtubeContentType={youtubeContentType}
                  youtubeSortOrder={youtubeSortOrder}
                  currentQuery={currentQuery}
                  setYoutubeMode={setYoutubeMode}
                  setYoutubeResults={setYoutubeResults}
                  setYoutubeError={setYoutubeError}
                  setYoutubeWarning={setYoutubeWarning}
                  setYoutubeContentType={setYoutubeContentType}
                  setYoutubeSortOrder={setYoutubeSortOrder}
                  handleYouTubeSearch={handleYouTubeSearch}
                />
              ) : (
                /* 原有的影视搜索结果 */
                <VideoResultsSection
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  filterAll={filterAll}
                  setFilterAll={setFilterAll}
                  filterAgg={filterAgg}
                  setFilterAgg={setFilterAgg}
                  filterOptions={filterOptions}
                  filteredAllResults={filteredAllResults}
                  filteredAggResults={filteredAggResults}
                  searchQuery={searchQuery}
                  isLoading={isLoading}
                  totalSources={totalSources}
                  completedSources={completedSources}
                  useFluidSearch={useFluidSearch}
                />
              )}
            </section>
          ) : (
            /* 搜索历史或YouTube无搜索状态 */
            <>
              {/* 搜索历史 - 优先显示 */}
              {searchHistory.length > 0 && (
                <section className='mb-12'>
                  <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                    搜索历史
                    {searchHistory.length > 0 && (
                      <button
                        onClick={() => {
                          clearSearchHistory(); // 事件监听会自动更新界面
                        }}
                        className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                      >
                        清空
                      </button>
                    )}
                  </h2>
                  <div className='flex flex-wrap gap-2'>
                    {searchHistory.map((item) => (
                      <div key={item} className='relative group'>
                        <button
                          onClick={() => {
                            setSearchQuery(item);
                            router.push(
                              `/search?q=${encodeURIComponent(item.trim())}`,
                            );
                          }}
                          className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                        >
                          {item}
                        </button>
                        {/* 删除按钮 */}
                        <button
                          aria-label='删除搜索历史'
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            deleteSearchHistory(item); // 事件监听会自动更新界面
                          }}
                          className='absolute -top-1 -right-1 w-4 h-4 opacity-0 group-hover:opacity-100 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                        >
                          <X className='w-3 h-3' />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* YouTube特殊模式显示 - 在搜索历史之后 */}
              {searchType === 'youtube' && (
                <section className='mb-12'>
                  <div className='mb-4'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      YouTube视频
                    </h2>

                    {/* YouTube模式切换 */}
                    <YouTubeModeSwitch
                      youtubeMode={youtubeMode}
                      setYoutubeMode={setYoutubeMode}
                      setYoutubeResults={setYoutubeResults}
                      setYoutubeError={setYoutubeError}
                      setYoutubeWarning={setYoutubeWarning}
                    />
                  </div>

                  {/* YouTube内容区域 */}
                  {youtubeMode === 'direct' ? (
                    /* 直接播放模式 */
                    <YouTubeDirectMode />
                  ) : (
                    /* 搜索模式提示 */
                    <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
                      <div className='mb-4'>
                        <svg
                          className='w-16 h-16 mx-auto text-gray-300 dark:text-gray-600'
                          fill='currentColor'
                          viewBox='0 0 20 20'
                        >
                          <path
                            fillRule='evenodd'
                            d='M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z'
                            clipRule='evenodd'
                          />
                        </svg>
                      </div>
                      <p className='text-lg mb-2'>在上方搜索框输入关键词</p>
                      <p className='text-sm'>开始搜索YouTube视频</p>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center ${
          showBackToTop
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6' />
      </button>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
