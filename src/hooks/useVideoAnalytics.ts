import { useCallback, useEffect,useRef } from 'react';

import { useAnalytics } from './useAnalytics';

interface VideoAnalyticsOptions {
  videoId: string;
  videoTitle: string;
  videoType?: 'movie' | 'tv' | 'episode' | 'live';
  source?: string;
  duration?: number;
}

/**
 * 视频分析 Hook
 * 自动追踪视频播放相关事件
 */
export function useVideoAnalytics(options: VideoAnalyticsOptions) {
  const {
    trackVideoPlay,
    trackVideoPause,
    trackVideoComplete,
    trackVideoFavorite,
    trackVideoShare,
    trackVideoDownload,
    trackPageView,
    trackError,
    trackVideoLoadTime
  } = useAnalytics();

  const startTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const hasTrackedCompleteRef = useRef<boolean>(false);
  const totalWatchTimeRef = useRef<number>(0);
  const sessionStartTimeRef = useRef<number>(0);

  const { videoId, videoTitle, videoType, source, duration } = options;

  // 追踪页面访问
  useEffect(() => {
    trackPageView('video_play', videoTitle, {
      video_id: videoId,
      video_type: videoType,
      source
    });
  }, [videoId, videoTitle, videoType, source, trackPageView]);

  // 追踪视频开始播放
  const trackPlay = useCallback((position = 0, quality?: string) => {
    if (!isPlayingRef.current) {
      startTimeRef.current = Date.now();
      sessionStartTimeRef.current = Date.now();
      isPlayingRef.current = true;

      trackVideoPlay({
        videoId,
        videoTitle,
        videoType,
        source,
        duration,
        position,
        quality
      });
    }
  }, [videoId, videoTitle, videoType, source, duration, trackVideoPlay]);

  // 追踪视频暂停
  const trackPause = useCallback((position = 0) => {
    if (isPlayingRef.current) {
      const watchTime = Date.now() - startTimeRef.current;
      totalWatchTimeRef.current += watchTime;
      isPlayingRef.current = false;

      trackVideoPause({
        videoId,
        videoTitle,
        videoType,
        position,
        duration: totalWatchTimeRef.current
      });
    }
  }, [videoId, videoTitle, videoType, trackVideoPause]);

  // 追踪视频完成
  const trackComplete = useCallback(() => {
    if (!hasTrackedCompleteRef.current) {
      hasTrackedCompleteRef.current = true;

      trackVideoComplete({
        videoId,
        videoTitle,
        videoType,
        duration: totalWatchTimeRef.current + (Date.now() - startTimeRef.current)
      });
    }
  }, [videoId, videoTitle, videoType, trackVideoComplete]);

  // 追踪视频收藏
  const trackFavorite = useCallback(() => {
    trackVideoFavorite({
      videoId,
      videoTitle,
      videoType
    });
  }, [videoId, videoTitle, videoType, trackVideoFavorite]);

  // 追踪视频分享
  const trackShare = useCallback((platform: 'wechat' | 'weibo' | 'qq' | 'link' | 'other') => {
    trackVideoShare({
      videoId,
      videoTitle,
      videoType,
      platform
    });
  }, [videoId, videoTitle, videoType, trackVideoShare]);

  // 追踪视频下载
  const trackDownload = useCallback((quality: string) => {
    trackVideoDownload({
      videoId,
      videoTitle,
      videoType,
      quality
    });
  }, [videoId, videoTitle, videoType, trackVideoDownload]);

  // 追踪视频加载时间
  const trackLoadTime = useCallback((loadTime: number, quality?: string) => {
    trackVideoLoadTime(loadTime, videoId, quality);
  }, [videoId, trackVideoLoadTime]);

  // 追踪播放错误
  const trackPlaybackError = useCallback((errorType: string, errorMessage: string, context?: Record<string, unknown>) => {
    trackError('video_playback_error', errorMessage, {
      error_type: errorType,
      video_id: videoId,
      video_title: videoTitle,
      video_type: videoType,
      position: context?.position || 0,
      quality: context?.quality,
      source,
      ...context
    });
  }, [videoId, videoTitle, videoType, source, trackError]);

  // 监听视频进度（用于自动完成检测）
  const trackProgress = useCallback((currentTime: number) => {
    // 如果视频时长未知或为0，跳过完成检测
    if (!duration || duration <= 0) return;

    // 播放到95%时认为是完成
    const progressPercentage = currentTime / duration;
    if (progressPercentage >= 0.95 && !hasTrackedCompleteRef.current) {
      trackComplete();
    }
  }, [duration, trackComplete]);

  // 清理函数
  useEffect(() => {
    return () => {
      // 组件卸载时如果还在播放，记录暂停事件
      if (isPlayingRef.current) {
        trackPause();
      }
    };
  }, [trackPause]);

  return {
    trackPlay,
    trackPause,
    trackComplete,
    trackFavorite,
    trackShare,
    trackDownload,
    trackLoadTime,
    trackPlaybackError,
    trackProgress,

    // 统计信息
    getTotalWatchTime: () => totalWatchTimeRef.current + (isPlayingRef.current ? Date.now() - startTimeRef.current : 0),
    getCurrentSessionTime: () => isPlayingRef.current ? Date.now() - sessionStartTimeRef.current : 0,
    isPlaying: () => isPlayingRef.current
  };
}

/**
 * 视频质量分析 Hook
 */
export function useVideoQualityAnalytics(videoId: string, videoTitle: string) {
  const { trackError, trackFeatureUsage } = useAnalytics();

  const trackQualityChange = useCallback((fromQuality: string, toQuality: string, auto = false) => {
    trackFeatureUsage('video_quality_change', true, {
      video_id: videoId,
      video_title: videoTitle,
      from_quality: fromQuality,
      to_quality: toQuality,
      auto_switch: auto
    });
  }, [videoId, videoTitle, trackFeatureUsage]);

  const trackQualityIssue = useCallback((quality: string, issue: string) => {
    trackError('video_quality_issue', issue, {
      video_id: videoId,
      video_title: videoTitle,
      quality
    });
  }, [videoId, videoTitle, trackError]);

  return {
    trackQualityChange,
    trackQualityIssue
  };
}

/**
 * 弹幕分析 Hook
 */
export function useDanmuAnalytics(videoId: string, videoTitle: string) {
  const { trackFeatureUsage, trackSearch } = useAnalytics();

  const trackDanmuSend = useCallback((content: string, position: number) => {
    trackFeatureUsage('danmu_send', true, {
      video_id: videoId,
      video_title: videoTitle,
      content_length: content.length,
      position
    });
  }, [videoId, videoTitle, trackFeatureUsage]);

  const trackDanmuToggle = useCallback((enabled: boolean) => {
    trackFeatureUsage('danmu_toggle', true, {
      video_id: videoId,
      video_title: videoTitle,
      enabled
    });
  }, [videoId, videoTitle, trackFeatureUsage]);

  const trackDanmuSearch = useCallback((keyword: string) => {
    trackSearch({
      query: keyword,
      category: 'danmu',
      searchType: 'general'
    });
  }, [trackSearch]);

  return {
    trackDanmuSend,
    trackDanmuToggle,
    trackDanmuSearch
  };
}