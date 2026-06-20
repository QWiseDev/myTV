import { useCallback, useEffect, useRef } from 'react';

import { useAnalytics } from './useAnalytics';

interface UserBehaviorOptions {
  userId?: string;
  userType?: 'guest' | 'registered' | 'premium';
}

/**
 * 用户行为分析 Hook
 */
export function useUserBehaviorAnalytics(options: UserBehaviorOptions = {}) {
  const {
    trackUserRegistration,
    trackUserLogin,
    trackUserLogout,
    trackSearch,
    trackCategoryView,
    trackConversion,
    trackFeatureUsage,
    trackError,
    setUserId,
    setUserType
  } = useAnalytics();

  const { userId, userType } = options;
  const sessionStartTimeRef = useRef<number>(Date.now());
  const lastActivityTimeRef = useRef<number>(Date.now());

  // 设置用户信息
  useEffect(() => {
    if (userId) {
      setUserId(userId);
    }
    if (userType) {
      setUserType(userType);
    }
  }, [userId, userType, setUserId, setUserType]);

  // 追踪用户注册
  const trackRegistration = useCallback((method: 'email' | 'phone' | 'social' | 'guest', metadata?: Record<string, unknown>) => {
    trackUserRegistration({
      userId,
      action: 'registration',
      userType: userType || 'registered',
      method,
      metadata
    });
  }, [userId, userType, trackUserRegistration]);

  // 追踪用户登录
  const trackLogin = useCallback((method: 'email' | 'phone' | 'social' | 'auto', metadata?: Record<string, unknown>) => {
    trackUserLogin({
      userId,
      action: 'login',
      userType: userType || 'registered',
      method,
      metadata
    });
  }, [userId, userType, trackUserLogin]);

  // 追踪用户登出
  const trackLogout = useCallback(() => {
    trackUserLogout({
      userId,
      action: 'logout'
    });
  }, [userId, trackUserLogout]);

  // 追踪搜索行为
  const trackSearchBehavior = useCallback((query: string, options?: {
    category?: string;
    resultsCount?: number;
    filters?: Record<string, unknown>;
    searchType?: 'general' | 'advanced' | 'voice';
    searchFrom?: string;
  }) => {
    trackSearch({
      query,
      category: options?.category,
      resultsCount: options?.resultsCount,
      filters: options?.filters,
      searchType: options?.searchType || 'general'
    });

    // 更新活动时间
    lastActivityTimeRef.current = Date.now();
  }, [trackSearch]);

  // 追踪分类浏览
  const trackCategoryBrowse = useCallback((category: string, subcategory?: string, itemCount?: number) => {
    trackCategoryView(category, subcategory);

    // 追踪分类浏览深度
    trackFeatureUsage('category_browse', true, {
      category,
      subcategory,
      item_count: itemCount
    });
  }, [trackCategoryView, trackFeatureUsage]);

  // 追踪内容点击
  const trackContentClick = useCallback((contentType: 'movie' | 'tv' | 'episode' | 'live', contentId: string, contentTitle: string, source?: string) => {
    trackFeatureUsage('content_click', true, {
      content_type: contentType,
      content_id: contentId,
      content_title: contentTitle,
      source: source || 'unknown'
    });
  }, [trackFeatureUsage]);

  // 追踪收藏行为
  const trackFavoriteAction = useCallback((action: 'add' | 'remove', contentType: 'movie' | 'tv' | 'episode', contentId: string, contentTitle: string) => {
    trackFeatureUsage('favorite_action', true, {
      action,
      content_type: contentType,
      content_id: contentId,
      content_title: contentTitle
    });
  }, [trackFeatureUsage]);

  // 追踪观看历史
  const trackWatchHistory = useCallback((contentId: string, contentTitle: string, progress: number, duration?: number) => {
    trackFeatureUsage('watch_history', true, {
      content_id: contentId,
      content_title: contentTitle,
      progress_percentage: duration ? (progress / duration) * 100 : 0,
      watch_time_seconds: progress
    });
  }, [trackFeatureUsage]);

  // 追踪转化事件
  const trackConversionEvent = useCallback((eventName: string, options?: {
    revenue?: number;
    currency?: string;
    step?: string;
    success?: boolean;
    metadata?: Record<string, unknown>;
  }) => {
    trackConversion({
      eventName,
      revenue: options?.revenue,
      currency: options?.currency,
      step: options?.step,
      success: options?.success,
      metadata: options?.metadata
    });
  }, [trackConversion]);

  // 追踪功能使用
  const trackFeatureUse = useCallback((featureName: string, used = true, metadata?: Record<string, unknown>) => {
    trackFeatureUsage(featureName, used, metadata);

    // 更新活动时间
    if (used) {
      lastActivityTimeRef.current = Date.now();
    }
  }, [trackFeatureUsage]);

  // 追踪错误
  const trackUserError = useCallback((errorType: string, errorMessage: string, context?: Record<string, unknown>) => {
    trackError(errorType, errorMessage, {
      user_id: userId,
      user_type: userType,
      session_duration: Date.now() - sessionStartTimeRef.current,
      ...context
    });
  }, [userId, userType, trackError]);

  // 追踪会话时长
  const getSessionDuration = useCallback(() => {
    return Date.now() - sessionStartTimeRef.current;
  }, []);

  // 追踪活跃时长
  const getActiveDuration = useCallback(() => {
    return Date.now() - lastActivityTimeRef.current;
  }, []);

  // 追踪用户留存（需要在适当的时候调用）
  const trackUserRetention = useCallback((dayCount: number) => {
    trackConversionEvent('user_retention', {
      step: `day_${dayCount}`,
      success: true
    });
  }, [trackConversionEvent]);

  return {
    // 用户行为追踪
    trackRegistration,
    trackLogin,
    trackLogout,
    trackSearchBehavior,
    trackCategoryBrowse,
    trackContentClick,
    trackFavoriteAction,
    trackWatchHistory,

    // 转化和功能使用
    trackConversionEvent,
    trackFeatureUse,
    trackUserRetention,

    // 错误追踪
    trackUserError,

    // 会话统计
    getSessionDuration,
    getActiveDuration
  };
}

/**
 * 用户路径分析 Hook
 */
export function useUserJourneyAnalytics() {
  const { trackFeatureUsage } = useAnalytics();
  const journeyStepsRef = useRef<Array<{
    step: string;
    timestamp: number;
    page?: string;
    metadata?: Record<string, unknown>;
  }>>([]);

  // 追踪用户路径步骤
  const trackJourneyStep = useCallback((step: string, metadata?: Record<string, unknown>) => {
    const journeyStep = {
      step,
      timestamp: Date.now(),
      page: window.location.pathname,
      metadata
    };

    journeyStepsRef.current.push(journeyStep);

    // 追踪路径步骤
    trackFeatureUsage('user_journey_step', true, {
      step,
      page: window.location.pathname,
      step_index: journeyStepsRef.current.length - 1,
      ...metadata
    });
  }, [trackFeatureUsage]);

  // 追踪路径完成
  const trackJourneyComplete = useCallback((journeyName: string, success = true) => {
    trackFeatureUsage('user_journey_complete', true, {
      journey_name: journeyName,
      success,
      total_steps: journeyStepsRef.current.length,
      total_duration: journeyStepsRef.current.length > 0
        ? Date.now() - journeyStepsRef.current[0].timestamp
        : 0
    });

    // 清空路径记录
    journeyStepsRef.current = [];
  }, [trackFeatureUsage]);

  // 获取当前路径
  const getCurrentJourney = useCallback(() => {
    return [...journeyStepsRef.current];
  }, []);

  return {
    trackJourneyStep,
    trackJourneyComplete,
    getCurrentJourney
  };
}

/**
 * 搜索行为分析 Hook
 */
export function useSearchAnalytics() {
  const { trackSearchBehavior, trackUserError, trackFeatureUse } = useUserBehaviorAnalytics();

  const trackSearchQuery = useCallback((query: string, resultsCount: number, searchTime: number, options?: {
    category?: string;
    filters?: Record<string, unknown>;
    searchType?: 'general' | 'advanced' | 'voice';
    searchFrom?: string;
  }) => {
    trackSearchBehavior(query, {
      category: options?.category,
      resultsCount,
      filters: options?.filters,
      searchType: options?.searchType
    });

    // 追踪搜索性能
    trackFeatureUse('search_performance', true, {
      search_time: searchTime,
      results_count: resultsCount,
      query_length: query.length,
      search_from: options?.searchFrom || 'search_bar'
    });

    // 追踪无结果搜索
    if (resultsCount === 0) {
      trackUserError('no_search_results', `No results found for query: ${query}`, {
        query,
        search_type: options?.searchType,
        filters: options?.filters
      });
    }
  }, [trackSearchBehavior, trackUserError, trackFeatureUse]);

  const trackSearchFilter = useCallback((filterType: string, filterValue: string) => {
    trackFeatureUse('search_filter', true, {
      filter_type: filterType,
      filter_value: filterValue
    });
  }, [trackFeatureUse]);

  const trackSearchSuggestion = useCallback((originalQuery: string, suggestedQuery: string, applied: boolean) => {
    trackFeatureUse('search_suggestion', true, {
      original_query: originalQuery,
      suggested_query: suggestedQuery,
      applied
    });
  }, [trackFeatureUse]);

  return {
    trackSearchQuery,
    trackSearchFilter,
    trackSearchSuggestion
  };
}