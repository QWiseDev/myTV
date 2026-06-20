import { useCallback, useEffect,useRef } from 'react';

import { SearchResult } from '@/lib/types';

import { useAnalytics } from './useAnalytics';
import { useSearchAnalytics } from './useUserBehaviorAnalytics';

interface SearchPageAnalyticsOptions {
  userId?: string;
  userType?: 'guest' | 'registered' | 'premium';
}

/**
 * 搜索页面专用埋点 Hook
 */
export function useSearchPageAnalytics(options: SearchPageAnalyticsOptions = {}) {
  const {
    trackPageView,
    trackFeatureUsage,
    trackError,
    trackConversion
  } = useAnalytics();

  const {
    trackSearchQuery,
    trackSearchFilter,
    trackSearchSuggestion
  } = useSearchAnalytics();

  // 搜索状态 refs
  const searchSessionIdRef = useRef<string>(`search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const searchCountRef = useRef<number>(0);
  const lastSearchQueryRef = useRef<string>('');
  const filterHistoryRef = useRef<Array<{ filter: string; value: string; timestamp: number }>>([]);
  const resultClicksRef = useRef<Array<{ resultId: string; position: number; timestamp: number }>>([]);

  // 页面访问埋点
  useEffect(() => {
    trackPageView('search_page', '搜索页面', {
      search_session_id: searchSessionIdRef.current,
      user_id: options.userId,
      user_type: options.userType,
      referrer: document.referrer
    });
  }, [options.userId, options.userType, trackPageView]);

  // 搜索操作埋点
  const handleSearch = useCallback((
    query: string,
    results: SearchResult[],
    searchTime: number,
    searchOptions?: {
      category?: string;
      filters?: Record<string, unknown>;
      searchType?: 'general' | 'advanced' | 'voice';
      searchFrom?: string;
    }
  ) => {
    searchCountRef.current++;
    lastSearchQueryRef.current = query;

    // 基础搜索埋点
    trackSearchQuery(query, results.length, searchTime, {
      category: searchOptions?.category,
      filters: searchOptions?.filters,
      searchType: searchOptions?.searchType,
      searchFrom: searchOptions?.searchFrom || 'search_page'
    });

    // 搜索会话详细埋点
    trackFeatureUsage('search_session_update', true, {
      search_session_id: searchSessionIdRef.current,
      search_number: searchCountRef.current,
      query_length: query.length,
      query_type: detectQueryType(query),
      has_filters: Object.keys(searchOptions?.filters || {}).length > 0,
      results_count: results.length,
      search_time: searchTime,
      category: searchOptions?.category || 'all'
    });

    // 搜索结果分析
    if (results.length > 0) {
      const contentTypeDistribution = analyzeContentTypeDistribution(results);
      trackFeatureUsage('search_results_analysis', true, {
        search_session_id: searchSessionIdRef.current,
        content_type_distribution: contentTypeDistribution,
        year_range: getYearRange(results),
        result_types: Array.from(new Set(results.map(r => r.episodes.length > 1 ? 'tv' : 'movie')))
      });
    }

    return {
      searchId: searchSessionIdRef.current,
      searchNumber: searchCountRef.current,
      query
    };
  }, [trackSearchQuery, trackFeatureUsage]);

  // 搜索建议交互
  const handleSuggestionClick = useCallback((suggestion: string, originalQuery: string, position: number) => {
    trackSearchSuggestion(originalQuery, suggestion, true);

    trackFeatureUsage('search_suggestion_click', true, {
      search_session_id: searchSessionIdRef.current,
      suggestion,
      original_query: originalQuery,
      suggestion_position: position,
      search_number: searchCountRef.current
    });
  }, [trackSearchSuggestion, trackFeatureUsage]);

  // 自动完成搜索
  const handleAutoComplete = useCallback((query: string, suggestions: string[], selectedIndex: number) => {
    trackFeatureUsage('search_autocomplete', true, {
      search_session_id: searchSessionIdRef.current,
      query,
      suggestion_count: suggestions.length,
      selected_suggestion: suggestions[selectedIndex],
      selected_index: selectedIndex,
      has_selection: selectedIndex >= 0
    });
  }, [trackFeatureUsage]);

  // 搜索过滤埋点
  const handleFilterChange = useCallback((filterType: string, filterValue: string, multiple = false) => {
    const timestamp = Date.now();

    // 记录过滤历史
    filterHistoryRef.current.push({ filter: filterType, value: filterValue, timestamp });

    trackSearchFilter(filterType, filterValue);

    trackFeatureUsage('search_filter_change', true, {
      search_session_id: searchSessionIdRef.current,
      filter_type: filterType,
      filter_value: filterValue,
      is_multiple: multiple,
      total_filters: filterHistoryRef.current.length,
      last_search_query: lastSearchQueryRef.current
    });
  }, [trackSearchFilter, trackFeatureUsage]);

  const handleFilterRemove = useCallback((filterType: string, filterValue: string) => {
    trackFeatureUsage('search_filter_remove', true, {
      search_session_id: searchSessionIdRef.current,
      filter_type: filterType,
      filter_value: filterValue,
      remaining_filters: filterHistoryRef.current.filter(f => !(f.filter === filterType && f.value === filterValue)).length
    });
  }, [trackFeatureUsage]);

  const handleFilterClear = useCallback(() => {
    filterHistoryRef.current = [];
    trackFeatureUsage('search_filter_clear', true, {
      search_session_id: searchSessionIdRef.current,
      cleared_filters_count: filterHistoryRef.current.length
    });
  }, [trackFeatureUsage]);

  // 搜索结果点击
  const handleResultClick = useCallback((
    result: SearchResult,
    position: number,
    clickSource: 'search_results' | 'recommendations' | 'trending' = 'search_results'
  ) => {
    const timestamp = Date.now();
    resultClicksRef.current.push({
      resultId: result.id,
      position,
      timestamp
    });

    trackFeatureUsage('search_result_click', true, {
      search_session_id: searchSessionIdRef.current,
      result_id: result.id,
      result_title: result.title,
      result_type: result.episodes.length > 1 ? 'tv' : 'movie',
      position_in_results: position + 1,
      click_source: clickSource,
      search_query: lastSearchQueryRef.current,
      result_year: result.year,
      time_since_search: timestamp - (searchCountRef.current > 0 ? timestamp : 0)
    });

    // 转化追踪
    trackConversion({
      eventName: 'search_result_engagement',
      step: 'result_click',
      success: true,
      metadata: {
        search_session_id: searchSessionIdRef.current,
        search_query: lastSearchQueryRef.current,
        result_position: position + 1,
        content_type: result.episodes.length > 1 ? 'tv' : 'movie'
      }
    });
  }, [trackFeatureUsage, trackConversion]);

  // 搜索页面交互
  const handleSortChange = useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    trackFeatureUsage('search_sort_change', true, {
      search_session_id: searchSessionIdRef.current,
      sort_by: sortBy,
      sort_order: sortOrder,
      current_query: lastSearchQueryRef.current
    });
  }, [trackFeatureUsage]);

  const handleViewModeChange = useCallback((viewMode: 'grid' | 'list') => {
    trackFeatureUsage('search_view_mode_change', true, {
      search_session_id: searchSessionIdRef.current,
      view_mode: viewMode,
      results_per_page: viewMode === 'grid' ? 12 : 10
    });
  }, [trackFeatureUsage]);

  const handleLoadMore = useCallback((currentResults: number, totalResults: number) => {
    trackFeatureUsage('search_load_more', true, {
      search_session_id: searchSessionIdRef.current,
      current_results_count: currentResults,
      total_results_count: totalResults,
      load_more_percentage: (currentResults / totalResults) * 100
    });
  }, [trackFeatureUsage]);

  // 搜索失败处理
  const handleSearchError = useCallback((errorType: string, errorMessage: string, query: string) => {
    trackError('search_error', errorMessage, {
      error_type: errorType,
      search_session_id: searchSessionIdRef.current,
      search_query: query,
      search_number: searchCountRef.current,
      user_id: options.userId
    });
  }, [trackError, options.userId]);

  // 空结果处理
  const handleEmptyResults = useCallback((query: string, suggestions?: string[]) => {
    trackFeatureUsage('search_empty_results', true, {
      search_session_id: searchSessionIdRef.current,
      search_query: query,
      has_suggestions: !!suggestions && suggestions.length > 0,
      suggestion_count: suggestions?.length || 0,
      query_corrections: suggestions?.slice(0, 3) || []
    });
  }, [trackFeatureUsage]);

  // 搜索会话结束
  const trackSearchSessionEnd = useCallback(() => {
    const sessionDuration = Date.now();
    const uniqueFilters = new Set(filterHistoryRef.current.map(f => `${f.filter}:${f.value}`)).size;
    const clickThroughRate = resultClicksRef.current.length / (searchCountRef.current || 1);

    trackFeatureUsage('search_session_end', true, {
      search_session_id: searchSessionIdRef.current,
      session_duration: sessionDuration,
      total_searches: searchCountRef.current,
      unique_filters_used: uniqueFilters,
      total_result_clicks: resultClicksRef.current.length,
      click_through_rate: clickThroughRate,
      average_results_per_search: 0, // 可以通过累计计算
      final_query: lastSearchQueryRef.current
    });

    // 转化事件 - 成功的搜索会话
    if (resultClicksRef.current.length > 0) {
      trackConversion({
        eventName: 'successful_search_session',
        step: 'session_complete',
        success: true,
        revenue: 0, // 搜索通常不直接产生收入
        metadata: {
          search_session_id: searchSessionIdRef.current,
          total_searches: searchCountRef.current,
          result_clicks: resultClicksRef.current.length,
          session_duration: sessionDuration
        }
      });
    }
  }, [trackFeatureUsage, trackConversion]);

  // 页面离开时追踪会话结束
  useEffect(() => {
    const handleBeforeUnload = () => {
      trackSearchSessionEnd();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      trackSearchSessionEnd();
    };
  }, [trackSearchSessionEnd]);

  return {
    // 搜索操作
    handleSearch,
    handleSuggestionClick,
    handleAutoComplete,

    // 过滤器
    handleFilterChange,
    handleFilterRemove,
    handleFilterClear,

    // 结果互动
    handleResultClick,
    handleSortChange,
    handleViewModeChange,
    handleLoadMore,

    // 错误和空结果
    handleSearchError,
    handleEmptyResults,

    // 会话统计
    getSearchSessionId: () => searchSessionIdRef.current,
    getSearchCount: () => searchCountRef.current,
    getLastQuery: () => lastSearchQueryRef.current,
    getResultClicks: () => resultClicksRef.current.length,
    trackSearchSessionEnd
  };
}

// 辅助函数
function detectQueryType(query: string): 'title' | 'actor' | 'genre' | 'year' | 'general' {
  if (/^\d{4}$/.test(query.trim())) return 'year';
  if (query.includes('演员') || query.includes('导演')) return 'actor';
  if (query.includes('动作') || query.includes('喜剧') || query.includes('爱情')) return 'genre';
  if (query.split(' ').length > 3) return 'title';
  return 'general';
}

function analyzeContentTypeDistribution(results: SearchResult[]): Record<string, number> {
  return results.reduce((acc, result) => {
    const type = result.episodes.length > 1 ? 'tv' : 'movie';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}


function getYearRange(results: SearchResult[]): { min: number; max: number } {
  const years = results
    .filter(r => r.year)
    .map(r => parseInt(r.year!))
    .filter(year => !isNaN(year));

  if (years.length === 0) return { min: 0, max: 0 };

  return {
    min: Math.min(...years),
    max: Math.max(...years)
  };
}