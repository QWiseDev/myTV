/**
 * Microsoft Clarity 埋点工具类
 * 统一管理所有用户行为和业务事件的追踪
 */

// 事件类型定义
export interface VideoEvent {
  videoId: string;
  videoTitle: string;
  videoType?: 'movie' | 'tv' | 'episode' | 'live';
  source?: string;
  duration?: number;
  quality?: string;
  position?: number;
}

export interface UserEvent {
  userId?: string;
  userType?: 'guest' | 'registered' | 'premium';
  action: string;
  metadata?: Record<string, unknown>;
}

export interface SearchEvent {
  query: string;
  category?: string;
  resultsCount?: number;
  filters?: Record<string, unknown>;
  searchType?: 'general' | 'advanced' | 'voice';
}

export interface PerformanceEvent {
  metricName: string;
  value: number;
  unit?: string;
  page?: string;
  metadata?: Record<string, unknown>;
}

export interface BusinessEvent {
  eventName: string;
  revenue?: number;
  currency?: string;
  step?: string;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

class ClarityAnalytics {
  private isInitialized = false;
  private userId: string | null = null;
  private userType: 'guest' | 'registered' | 'premium' = 'guest';

  /**
   * 初始化 Clarity Analytics
   */
  init(userId?: string, userType?: 'guest' | 'registered' | 'premium') {
    if (typeof window === 'undefined' || !window.clarity) {
      console.warn('[Analytics] Clarity not available');
      return;
    }

    this.isInitialized = true;

    if (userId) {
      this.setUserId(userId);
    }

    if (userType) {
      this.setUserType(userType);
    }

    console.log('[Analytics] Initialized');
  }

  /**
   * 设置用户ID
   */
  setUserId(userId: string) {
    if (!this.isInitialized) return;

    this.userId = userId;
    try {
      if (window.clarity) {
        window.clarity('identify', userId, this.userType);
        window.clarity('set', 'user_id', userId);
      }
      console.log(`[Analytics] User ID set: ${userId}`);
    } catch (error) {
      console.error('[Analytics] Failed to set user ID:', error);
    }
  }

  /**
   * 设置用户类型
   */
  setUserType(userType: 'guest' | 'registered' | 'premium') {
    if (!this.isInitialized) return;

    this.userType = userType;
    try {
      if (window.clarity) {
        window.clarity('set', 'user_type', userType);
      }
      console.log(`[Analytics] User type set: ${userType}`);
    } catch (error) {
      console.error('[Analytics] Failed to set user type:', error);
    }
  }

  // ==================== 视频相关埋点 ====================

  /**
   * 追踪视频播放事件
   */
  trackVideoPlay(event: VideoEvent) {
    this.trackEvent('video_play', {
      video_id: event.videoId,
      video_title: event.videoTitle,
      video_type: event.videoType || 'unknown',
      source: event.source || 'unknown',
      duration: event.duration,
      quality: event.quality || 'unknown',
      position: event.position || 0
    });
  }

  /**
   * 追踪视频暂停事件
   */
  trackVideoPause(event: VideoEvent) {
    this.trackEvent('video_pause', {
      video_id: event.videoId,
      video_title: event.videoTitle,
      position: event.position || 0,
      watch_time: event.position || 0
    });
  }

  /**
   * 追踪视频完成事件
   */
  trackVideoComplete(event: VideoEvent) {
    this.trackEvent('video_complete', {
      video_id: event.videoId,
      video_title: event.videoTitle,
      video_type: event.videoType || 'unknown',
      total_duration: event.duration
    });
  }

  /**
   * 追踪视频收藏事件
   */
  trackVideoFavorite(event: VideoEvent) {
    this.trackEvent('video_favorite', {
      video_id: event.videoId,
      video_title: event.videoTitle,
      video_type: event.videoType || 'unknown'
    });
  }

  /**
   * 追踪视频分享事件
   */
  trackVideoShare(event: VideoEvent & { platform: string }) {
    this.trackEvent('video_share', {
      video_id: event.videoId,
      video_title: event.videoTitle,
      video_type: event.videoType || 'unknown',
      platform: event.platform
    });
  }

  /**
   * 追踪视频下载事件
   */
  trackVideoDownload(event: VideoEvent) {
    this.trackEvent('video_download', {
      video_id: event.videoId,
      video_title: event.videoTitle,
      video_type: event.videoType || 'unknown',
      quality: event.quality || 'unknown'
    });
  }

  // ==================== 用户行为埋点 ====================

  /**
   * 追踪用户注册事件
   */
  trackUserRegistration(event: UserEvent & { method: string }) {
    this.trackEvent('user_registration', {
      user_id: event.userId,
      registration_method: event.method,
      metadata: event.metadata
    });
  }

  /**
   * 追踪用户登录事件
   */
  trackUserLogin(event: UserEvent & { method: string }) {
    this.trackEvent('user_login', {
      user_id: event.userId,
      login_method: event.method,
      metadata: event.metadata
    });
  }

  /**
   * 追踪用户登出事件
   */
  trackUserLogout(event: UserEvent) {
    this.trackEvent('user_logout', {
      user_id: event.userId
    });
  }

  /**
   * 追踪搜索行为
   */
  trackSearch(event: SearchEvent) {
    this.trackEvent('search', {
      query: event.query,
      category: event.category,
      results_count: event.resultsCount,
      filters: event.filters,
      search_type: event.searchType || 'general'
    });
  }

  /**
   * 追踪页面浏览
   */
  trackPageView(page: string, title?: string, metadata?: Record<string, unknown>) {
    this.trackEvent('page_view', {
      page,
      title: title || page,
      ...metadata
    });
  }

  /**
   * 追踪分类浏览
   */
  trackCategoryView(category: string, subcategory?: string) {
    this.trackEvent('category_view', {
      category,
      subcategory
    });
  }

  // ==================== 性能监控埋点 ====================

  /**
   * 追踪页面加载性能
   */
  trackPageLoadTime(loadTime: number, page?: string) {
    this.trackEvent('performance_page_load', {
      load_time: loadTime,
      page: page || window.location.pathname,
      user_agent: navigator.userAgent
    });
  }

  /**
   * 追踪视频加载性能
   */
  trackVideoLoadTime(loadTime: number, videoId: string, quality?: string) {
    this.trackEvent('performance_video_load', {
      load_time: loadTime,
      video_id: videoId,
      quality: quality || 'unknown'
    });
  }

  /**
   * 追踪API请求性能
   */
  trackApiPerformance(apiEndpoint: string, responseTime: number, statusCode: number) {
    this.trackEvent('performance_api', {
      api_endpoint: apiEndpoint,
      response_time: responseTime,
      status_code: statusCode
    });
  }

  /**
   * 追踪错误事件
   */
  trackError(errorType: string, errorMessage: string, context?: Record<string, unknown>) {
    this.trackEvent('error', {
      error_type: errorType,
      error_message: errorMessage,
      page: window.location.pathname,
      user_agent: navigator.userAgent,
      timestamp: Date.now(),
      ...context
    });
  }

  // ==================== 业务分析埋点 ====================

  /**
   * 追踪转化事件
   */
  trackConversion(event: BusinessEvent) {
    this.trackEvent('conversion', {
      event_name: event.eventName,
      revenue: event.revenue,
      currency: event.currency || 'CNY',
      step: event.step,
      success: event.success !== false,
      ...event.metadata
    });
  }

  /**
   * 追踪用户留存
   */
  trackUserRetention(dayCount: number) {
    this.trackEvent('user_retention', {
      day_count: dayCount,
      user_id: this.userId
    });
  }

  /**
   * 追踪功能使用情况
   */
  trackFeatureUsage(featureName: string, used = true, metadata?: Record<string, unknown>) {
    this.trackEvent('feature_usage', {
      feature_name: featureName,
      used,
      ...metadata
    });
  }

  // ==================== 通用工具方法 ====================

  /**
   * 通用事件追踪方法
   */
  private trackEvent(eventName: string, properties: Record<string, unknown>) {
    // 如果未初始化，尝试初始化
    if (!this.isInitialized) {
      this.tryInit();
    }

    // 如果仍然没有clarity可用，延迟发送事件
    if (!this.isInitialized || !window.clarity) {
      // 🔧 修复：减少控制台噪音，注释掉重复的日志输出
      // console.warn(`[Analytics] Event not tracked (not initialized): ${eventName}`);
      this.queueEvent(eventName, properties);
      return;
    }

    this.sendEvent(eventName, properties);
  }

  /**
   * 尝试自动初始化
   */
  private tryInit() {
    if (typeof window !== 'undefined' && window.clarity) {
      // 从localStorage获取用户信息并初始化
      const userId = localStorage.getItem('user_id');
      const userType = localStorage.getItem('user_type') as 'guest' | 'registered' | 'premium' || 'guest';

      this.init(userId || undefined, userType);
    }
  }

  /**
   * 将事件加入队列，等待初始化后发送
   */
  private eventQueue: Array<{ eventName: string; properties: Record<string, unknown>; timestamp: number }> = [];
  private queueProcessTimer: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private maxRetries = 5; // 最多重试5次

  private queueEvent(eventName: string, properties: Record<string, unknown>) {
    // 如果已经重试次数过多，不再添加新事件到队列
    if (this.retryCount >= this.maxRetries) {
      // 静默跳过，不输出日志以减少控制台噪音
      return;
    }

    // 将事件加入队列，最多保留50个事件
    this.eventQueue.push({
      eventName,
      properties,
      timestamp: Date.now()
    });

    if (this.eventQueue.length > 50) {
      this.eventQueue.shift(); // 移除最旧的事件
    }

    // 🔧 修复：减少控制台噪音，只在调试模式下输出
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] Event queued (not initialized): ${eventName}`);
    }

    // 防抖：避免重复设置定时器
    if (this.queueProcessTimer) {
      clearTimeout(this.queueProcessTimer);
    }

    // 设置定时器尝试初始化和发送队列事件
    this.queueProcessTimer = setTimeout(() => this.processEventQueue(), 1000);
  }

  /**
   * 处理事件队列
   */
  private processEventQueue() {
    if (this.eventQueue.length === 0) return;

    this.tryInit();

    if (this.isInitialized && window.clarity) {
      // 发送所有队列中的事件
      const events = this.eventQueue.splice(0); // 清空队列
      this.retryCount = 0; // 重置重试计数
      this.queueProcessTimer = null; // 清除定时器引用

      events.forEach(({ eventName, properties, timestamp }) => {
        // 为队列事件添加延迟标记
        this.sendEvent(eventName, { ...properties, queued: true, queueTimestamp: timestamp });
      });

      console.log(`[Analytics] Processed ${events.length} queued events`);
    } else {
      // 增加重试计数
      this.retryCount++;

      // 如果重试次数超过限制，清空队列停止重试
      if (this.retryCount >= this.maxRetries) {
        console.warn(`[Analytics] Max retries (${this.maxRetries}) reached, clearing queue`);
        this.eventQueue.splice(0); // 清空队列
        this.queueProcessTimer = null;
      } else {
        // 继续重试，但增加延迟时间
        const delay = 1000 * Math.pow(2, this.retryCount); // 指数退避
        console.log(`[Analytics] Retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`);

        this.queueProcessTimer = setTimeout(() => this.processEventQueue(), delay);
      }
    }
  }

  /**
   * 实际发送事件的方法
   */
  private sendEvent(eventName: string, properties: Record<string, unknown>) {
    try {
      // 添加通用属性
      const enrichedProperties = {
        timestamp: Date.now(),
        page: window.location.pathname,
        referrer: document.referrer,
        user_type: this.userType,
        user_id: this.userId,
        ...properties
      };

      // 发送到 Clarity
      window.clarity?.('event', eventName, enrichedProperties);

      console.log(`[Analytics] Event tracked: ${eventName}`, enrichedProperties);
    } catch (error) {
      console.error(`[Analytics] Failed to track event ${eventName}:`, error);
    }
  }

  /**
   * 检查是否已初始化
   */
  isReady() {
    return this.isInitialized && typeof window !== 'undefined' && window.clarity;
  }
}

// 创建全局实例
export const analytics = new ClarityAnalytics();

// 扩展 Window 接口
declare global {
  interface Window {
    clarity?: (event: string, ...args: unknown[]) => void;
  }
}

// 类型已在顶部导出，无需重复导出