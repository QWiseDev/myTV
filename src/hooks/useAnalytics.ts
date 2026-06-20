import { useCallback,useEffect } from 'react';

import { analytics, BusinessEvent, SearchEvent, UserEvent, VideoEvent } from '@/lib/analytics';

/**
 * React Hook for Analytics
 * 提供便捷的埋点方法
 */
export function useAnalytics() {
  // 初始化 Analytics - 增强版
  useEffect(() => {
    // 只在客户端执行
    if (typeof window === 'undefined') return;

    // 检查是否有用户信息
    const userId = localStorage.getItem('user_id');
    const userType = localStorage.getItem('user_type') as 'guest' | 'registered' | 'premium' || 'guest';

    // 立即尝试初始化
    if (analytics.isReady()) {
      analytics.init(userId || undefined, userType);
    } else {
      // 增强的等待机制：检查Clarity是否加载
      let attempts = 0;
      const maxAttempts = 50; // 5秒超时

      const checkInterval = setInterval(() => {
        attempts++;

        // 检查Analytics是否就绪
        if (analytics.isReady()) {
          analytics.init(userId || undefined, userType);
          clearInterval(checkInterval);
          return;
        }

        // 超时处理
        if (attempts >= maxAttempts) {
          console.warn('[Analytics] 初始化超时，将使用队列模式');
          clearInterval(checkInterval);

          // 即使超时也要尝试初始化（可能会自动进入队列模式）
          analytics.init(userId || undefined, userType);
        }
      }, 100);

      return () => clearInterval(checkInterval);
    }
  }, []);

  // ==================== 视频相关埋点 ====================

  const trackVideoPlay = useCallback((event: VideoEvent) => {
    analytics.trackVideoPlay(event);
  }, []);

  const trackVideoPause = useCallback((event: VideoEvent) => {
    analytics.trackVideoPause(event);
  }, []);

  const trackVideoComplete = useCallback((event: VideoEvent) => {
    analytics.trackVideoComplete(event);
  }, []);

  const trackVideoFavorite = useCallback((event: VideoEvent) => {
    analytics.trackVideoFavorite(event);
  }, []);

  const trackVideoShare = useCallback((event: VideoEvent & { platform: string }) => {
    analytics.trackVideoShare(event);
  }, []);

  const trackVideoDownload = useCallback((event: VideoEvent) => {
    analytics.trackVideoDownload(event);
  }, []);

  // ==================== 用户行为埋点 ====================

  const trackUserRegistration = useCallback((event: UserEvent & { method: string }) => {
    analytics.trackUserRegistration(event);
  }, []);

  const trackUserLogin = useCallback((event: UserEvent & { method: string }) => {
    analytics.trackUserLogin(event);
  }, []);

  const trackUserLogout = useCallback((event: UserEvent) => {
    analytics.trackUserLogout(event);
  }, []);

  const trackSearch = useCallback((event: SearchEvent) => {
    analytics.trackSearch(event);
  }, []);

  const trackPageView = useCallback((page: string, title?: string, metadata?: Record<string, unknown>) => {
    analytics.trackPageView(page, title, metadata);
  }, []);

  const trackCategoryView = useCallback((category: string, subcategory?: string) => {
    analytics.trackCategoryView(category, subcategory);
  }, []);

  // ==================== 性能监控埋点 ====================

  const trackPageLoadTime = useCallback((loadTime: number, page?: string) => {
    analytics.trackPageLoadTime(loadTime, page);
  }, []);

  const trackVideoLoadTime = useCallback((loadTime: number, videoId: string, quality?: string) => {
    analytics.trackVideoLoadTime(loadTime, videoId, quality);
  }, []);

  const trackApiPerformance = useCallback((apiEndpoint: string, responseTime: number, statusCode: number) => {
    analytics.trackApiPerformance(apiEndpoint, responseTime, statusCode);
  }, []);

  const trackError = useCallback((errorType: string, errorMessage: string, context?: Record<string, unknown>) => {
    analytics.trackError(errorType, errorMessage, context);
  }, []);

  // ==================== 业务分析埋点 ====================

  const trackConversion = useCallback((event: BusinessEvent) => {
    analytics.trackConversion(event);
  }, []);

  const trackUserRetention = useCallback((dayCount: number) => {
    analytics.trackUserRetention(dayCount);
  }, []);

  const trackFeatureUsage = useCallback((featureName: string, used = true, metadata?: Record<string, unknown>) => {
    analytics.trackFeatureUsage(featureName, used, metadata);
  }, []);

  // ==================== 用户管理 ====================

  const setUserId = useCallback((userId: string) => {
    analytics.setUserId(userId);
    localStorage.setItem('user_id', userId);
  }, []);

  const setUserType = useCallback((userType: 'guest' | 'registered' | 'premium') => {
    analytics.setUserType(userType);
    localStorage.setItem('user_type', userType);
  }, []);

  return {
    // 视频相关
    trackVideoPlay,
    trackVideoPause,
    trackVideoComplete,
    trackVideoFavorite,
    trackVideoShare,
    trackVideoDownload,

    // 用户行为
    trackUserRegistration,
    trackUserLogin,
    trackUserLogout,
    trackSearch,
    trackPageView,
    trackCategoryView,

    // 性能监控
    trackPageLoadTime,
    trackVideoLoadTime,
    trackApiPerformance,
    trackError,

    // 业务分析
    trackConversion,
    trackUserRetention,
    trackFeatureUsage,

    // 用户管理
    setUserId,
    setUserType,

    // 工具方法
    isReady: () => analytics.isReady()
  };
}

/**
 * 页面性能监控 Hook
 */
export function usePagePerformance(pageName?: string) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const startTime = performance.now();

    // 监听页面加载完成
    const handleLoad = () => {
      const loadTime = performance.now() - startTime;
      analytics.trackPageLoadTime(Math.round(loadTime), pageName);
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
    }

    return () => {
      window.removeEventListener('load', handleLoad);
    };
  }, [pageName]);
}

/**
 * 错误监控 Hook
 */
export function useErrorMonitoring() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 监听 JavaScript 错误
    const handleError = (event: ErrorEvent) => {
      analytics.trackError('javascript_error', event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    };

    // 监听 Promise 拒绝
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      analytics.trackError('unhandled_promise_rejection', String(event.reason), {
        stack: event.reason?.stack
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
}