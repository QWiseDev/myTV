import { useCallback, useEffect,useRef } from 'react';

import { useAnalytics } from './useAnalytics';

interface SourceInfo {
  id: string;
  name: string;
  url: string;
  type: 'api' | 'm3u' | 'json' | 'custom';
  status: 'active' | 'inactive' | 'error' | 'testing';
  lastChecked?: Date;
  responseTime?: number;
  itemCount?: number;
  category?: string;
  language?: string;
}

interface SourceBrowserAnalyticsOptions {
  userId?: string;
  userType?: 'guest' | 'registered' | 'premium';
}

/**
 * 源浏览器专用埋点 Hook
 */
export function useSourceBrowserAnalytics(options: SourceBrowserAnalyticsOptions = {}) {
  const {
    trackPageView,
    trackFeatureUsage,
    trackError,
    trackConversion
  } = useAnalytics();

  // 暂时禁用性能监控以避免无限循环
  // const { trackApiRequest } = usePerformanceAnalytics();

  // 浏览会话 refs
  const browserSessionIdRef = useRef<string>(`browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const sourceClicksRef = useRef<number>(0);
  const filterChangesRef = useRef<number>(0);
  const viewChangesRef = useRef<number>(0);
  const searchCountRef = useRef<number>(0);
  const interactionStartTimeRef = useRef<number>(Date.now());

  // 页面访问埋点
  useEffect(() => {
    trackPageView('source_browser_page', '源浏览器', {
      browser_session_id: browserSessionIdRef.current,
      user_id: options.userId,
      user_type: options.userType,
      referrer: document.referrer
    });
  }, [options.userId, options.userType, trackPageView]);

  // 源列表操作埋点
  const handleSourceListLoad = useCallback((sourceCount: number, loadTime: number, categories: string[]) => {
    trackFeatureUsage('source_list_load', true, {
      browser_session_id: browserSessionIdRef.current,
      source_count: sourceCount,
      load_time: loadTime,
      categories_count: categories.length,
      categories: categories.slice(0, 5) // 记录前5个分类
    });
  }, [trackFeatureUsage]);

  const handleSourceRefresh = useCallback((sourceCount: number, successCount: number, errorCount: number) => {
    trackFeatureUsage('source_refresh', true, {
      browser_session_id: browserSessionIdRef.current,
      total_sources: sourceCount,
      successful_refreshes: successCount,
      failed_refreshes: errorCount,
      success_rate: sourceCount > 0 ? (successCount / sourceCount) * 100 : 0
    });
  }, [trackFeatureUsage]);

  // 源详情操作
  const handleSourceClick = useCallback((source: SourceInfo, position: number, listType: 'all' | 'category' | 'filtered' = 'all') => {
    sourceClicksRef.current++;

    trackFeatureUsage('source_click', true, {
      browser_session_id: browserSessionIdRef.current,
      source_id: source.id,
      source_name: source.name,
      source_type: source.type,
      source_status: source.status,
      position_in_list: position + 1,
      list_type: listType,
      click_number: sourceClicksRef.current,
      source_response_time: source.responseTime,
      source_item_count: source.itemCount,
      source_category: source.category,
      source_language: source.language
    });
  }, [trackFeatureUsage]);

  const handleSourceView = useCallback((source: SourceInfo, viewDuration: number) => {
    trackFeatureUsage('source_view', true, {
      browser_session_id: browserSessionIdRef.current,
      source_id: source.id,
      source_name: source.name,
      source_type: source.type,
      view_duration: viewDuration,
      source_status: source.status
    });
  }, [trackFeatureUsage]);

  // 源操作埋点
  const handleSourceTest = useCallback((source: SourceInfo, testResult: 'success' | 'failure', responseTime: number, itemCount?: number) => {
    trackFeatureUsage('source_test', true, {
      browser_session_id: browserSessionIdRef.current,
      source_id: source.id,
      source_name: source.name,
      source_type: source.type,
      test_result: testResult,
      response_time: responseTime,
      item_count: itemCount,
      source_status: source.status
    });

    // 转化事件 - 成功的源测试
    if (testResult === 'success') {
      trackConversion({
        eventName: 'source_validation',
        step: 'test_complete',
        success: true,
        metadata: {
          source_id: source.id,
          source_name: source.name,
          source_type: source.type,
          response_time: responseTime,
          item_count: itemCount
        }
      });
    }
  }, [trackFeatureUsage, trackConversion]);

  const handleSourceToggle = useCallback((source: SourceInfo, newStatus: 'active' | 'inactive', previousStatus: string) => {
    trackFeatureUsage('source_toggle', true, {
      browser_session_id: browserSessionIdRef.current,
      source_id: source.id,
      source_name: source.name,
      source_type: source.type,
      previous_status: previousStatus,
      new_status: newStatus,
      toggle_action: newStatus === 'active' ? 'enable' : 'disable'
    });
  }, [trackFeatureUsage]);

  const handleSourceEdit = useCallback((source: SourceInfo, editType: 'url' | 'name' | 'settings') => {
    trackFeatureUsage('source_edit', true, {
      browser_session_id: browserSessionIdRef.current,
      source_id: source.id,
      source_name: source.name,
      source_type: source.type,
      edit_type: editType,
      source_status: source.status
    });
  }, [trackFeatureUsage]);

  const handleSourceDelete = useCallback((source: SourceInfo, deleteReason: string) => {
    trackFeatureUsage('source_delete', true, {
      browser_session_id: browserSessionIdRef.current,
      source_id: source.id,
      source_name: source.name,
      source_type: source.type,
      source_status: source.status,
      delete_reason: deleteReason
    });
  }, [trackFeatureUsage]);

  const handleSourceAdd = useCallback((sourceType: 'api' | 'm3u' | 'json' | 'custom', sourceName: string) => {
    trackFeatureUsage('source_add', true, {
      browser_session_id: browserSessionIdRef.current,
      source_type: sourceType,
      source_name: sourceName,
      add_method: 'manual' // 可以是 'manual' | 'import' | 'auto_discovery'
    });
  }, [trackFeatureUsage]);

  // 过滤和搜索操作
  const handleFilterChange = useCallback((filterType: 'status' | 'type' | 'category' | 'language', filterValue: string) => {
    filterChangesRef.current++;

    trackFeatureUsage('source_filter_change', true, {
      browser_session_id: browserSessionIdRef.current,
      filter_type: filterType,
      filter_value: filterValue,
      filter_change_count: filterChangesRef.current,
      interaction_duration: Date.now() - interactionStartTimeRef.current
    });
  }, [trackFeatureUsage]);

  const handleSearch = useCallback((query: string, resultsCount: number, searchTime: number) => {
    searchCountRef.current++;

    trackFeatureUsage('source_search', true, {
      browser_session_id: browserSessionIdRef.current,
      search_query: query,
      results_count: resultsCount,
      search_time: searchTime,
      search_number: searchCountRef.current,
      query_length: query.length
    });
  }, [trackFeatureUsage]);

  const handleSortChange = useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    trackFeatureUsage('source_sort_change', true, {
      browser_session_id: browserSessionIdRef.current,
      sort_by: sortBy,
      sort_order: sortOrder
    });
  }, [trackFeatureUsage]);

  // 批量操作
  const handleBatchOperation = useCallback((operation: 'enable' | 'disable' | 'delete' | 'test', sourceIds: string[], sourceCount: number) => {
    trackFeatureUsage('source_batch_operation', true, {
      browser_session_id: browserSessionIdRef.current,
      operation_type: operation,
      selected_sources_count: sourceIds.length,
      total_sources_count: sourceCount,
      selection_percentage: (sourceIds.length / sourceCount) * 100
    });
  }, [trackFeatureUsage]);

  const handleImportSources = useCallback((importType: 'file' | 'url' | 'clipboard', sourceCount: number, successCount: number, errorCount: number) => {
    trackFeatureUsage('source_import', true, {
      browser_session_id: browserSessionIdRef.current,
      import_type: importType,
      imported_sources: sourceCount,
      successful_imports: successCount,
      failed_imports: errorCount,
      success_rate: sourceCount > 0 ? (successCount / sourceCount) * 100 : 0
    });

    // 转化事件 - 成功的导入
    if (successCount > 0) {
      trackConversion({
        eventName: 'source_bulk_add',
        step: 'import_complete',
        success: true,
        revenue: 0,
        metadata: {
          import_type: importType,
          imported_count: successCount,
          success_rate: (successCount / sourceCount) * 100
        }
      });
    }
  }, [trackFeatureUsage, trackConversion]);

  // 视图模式
  const handleViewModeChange = useCallback((viewMode: 'list' | 'grid' | 'cards', itemsPerPage: number) => {
    viewChangesRef.current++;

    trackFeatureUsage('source_view_mode_change', true, {
      browser_session_id: browserSessionIdRef.current,
      view_mode: viewMode,
      items_per_page: itemsPerPage,
      view_change_count: viewChangesRef.current
    });
  }, [trackFeatureUsage]);

  // 错误处理
  const handleSourceError = useCallback((errorType: 'network' | 'parse' | 'validation' | 'timeout', sourceId: string, errorMessage: string) => {
    trackError('source_error', errorMessage, {
      error_type: errorType,
      browser_session_id: browserSessionIdRef.current,
      source_id: sourceId,
      user_id: options.userId
    });
  }, [trackError, options.userId]);

  const handleBulkError = useCallback((errorType: string, affectedSources: number, operation: string) => {
    trackError('bulk_operation_error', `Bulk ${operation} failed: ${errorType}`, {
      error_type: errorType,
      browser_session_id: browserSessionIdRef.current,
      affected_sources_count: affectedSources,
      operation_type: operation,
      user_id: options.userId
    });
  }, [trackError, options.userId]);

  // 分页和加载
  const handleLoadMore = useCallback((currentPage: number, totalPages: number, loadedItems: number) => {
    trackFeatureUsage('source_load_more', true, {
      browser_session_id: browserSessionIdRef.current,
      current_page: currentPage,
      total_pages: totalPages,
      loaded_items: loadedItems,
      pagination_progress: (currentPage / totalPages) * 100
    });
  }, [trackFeatureUsage]);

  // 导出操作
  const handleExportSources = useCallback((exportFormat: 'json' | 'csv' | 'm3u', sourceCount: number) => {
    trackFeatureUsage('source_export', true, {
      browser_session_id: browserSessionIdRef.current,
      export_format: exportFormat,
      exported_sources_count: sourceCount
    });
  }, [trackFeatureUsage]);

  // 浏览会话结束
  const trackBrowserSessionEnd = useCallback(() => {
    const sessionDuration = Date.now() - interactionStartTimeRef.current;
    const interactionRate = (sourceClicksRef.current + filterChangesRef.current + searchCountRef.current) / Math.max(sessionDuration / 60000, 1); // 每分钟互动次数

    trackFeatureUsage('source_browser_session_end', true, {
      browser_session_id: browserSessionIdRef.current,
      session_duration: sessionDuration,
      total_source_clicks: sourceClicksRef.current,
      total_filter_changes: filterChangesRef.current,
      total_searches: searchCountRef.current,
      total_view_changes: viewChangesRef.current,
      interaction_rate_per_minute: interactionRate
    });

    // 转化事件 - 活跃的浏览会话
    if (sourceClicksRef.current >= 3) {
      trackConversion({
        eventName: 'engaged_source_browser',
        step: 'session_complete',
        success: true,
        metadata: {
          session_duration: sessionDuration,
          source_interactions: sourceClicksRef.current,
          searches_performed: searchCountRef.current,
          filters_applied: filterChangesRef.current
        }
      });
    }
  }, [trackFeatureUsage, trackConversion]);

  // 页面离开时追踪会话结束
  useEffect(() => {
    const handleBeforeUnload = () => {
      trackBrowserSessionEnd();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      trackBrowserSessionEnd();
    };
  }, [trackBrowserSessionEnd]);

  return {
    // 源列表操作
    handleSourceListLoad,
    handleSourceRefresh,

    // 源详情操作
    handleSourceClick,
    handleSourceView,
    handleSourceTest,
    handleSourceToggle,
    handleSourceEdit,
    handleSourceDelete,
    handleSourceAdd,

    // 过滤和搜索
    handleFilterChange,
    handleSearch,
    handleSortChange,

    // 批量操作
    handleBatchOperation,
    handleImportSources,

    // 视图和分页
    handleViewModeChange,
    handleLoadMore,

    // 导出
    handleExportSources,

    // 错误处理
    handleSourceError,
    handleBulkError,

    // 会话统计
    getBrowserSessionId: () => browserSessionIdRef.current,
    getSourceClicks: () => sourceClicksRef.current,
    getFilterChanges: () => filterChangesRef.current,
    getSearches: () => searchCountRef.current,
    trackBrowserSessionEnd
  };
}