import { useCallback, useEffect,useRef } from 'react';

import { useAnalytics } from './useAnalytics';
import { useVideoAnalytics } from './useVideoAnalytics';

// Network Information API（实验性，标准 DOM 类型未包含此接口）
interface NetworkInformation extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}
type NavigatorWithConnection = Navigator & { connection: NetworkInformation };

interface PlayPageAnalyticsOptions {
  videoId: string;
  videoTitle: string;
  videoType?: 'movie' | 'tv' | 'episode' | 'live';
  source?: string;
  duration?: number;
  episodeNumber?: number;
  seasonNumber?: number;
  seriesId?: string;
}

/**
 * 播放页面专用埋点 Hook
 */
export function usePlayPageAnalytics(options: PlayPageAnalyticsOptions) {
  const {
    trackPageView,
    trackFeatureUsage,
    trackError,
    trackConversion
  } = useAnalytics();

  const {
    trackPlay,
    trackPause,
    trackFavorite,
    trackShare,
    trackDownload,
    trackProgress,
    getTotalWatchTime,
    getCurrentSessionTime
  } = useVideoAnalytics(options);

  // 页面状态 refs
  const playStartTimeRef = useRef<number>(0);
  const lastQualityChangeRef = useRef<string>('');
  const bufferCountRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);
  const subtitleEnabledRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(1);
  const volumeLevelRef = useRef<number>(1);
  const isFullscreenRef = useRef<boolean>(false);

  const { videoId, videoTitle, videoType, episodeNumber, seasonNumber, seriesId } = options;

  // 页面访问埋点
  useEffect(() => {
    trackPageView('video_play_page', videoTitle, {
      video_id: videoId,
      video_type: videoType,
      episode_number: episodeNumber,
      season_number: seasonNumber,
      series_id: seriesId,
      source: options.source,
      referrer: document.referrer
    });
  }, [videoId, videoTitle, videoType, episodeNumber, seasonNumber, seriesId, options.source]);

  // 播放器控制埋点
  const trackPlayerControl = useCallback((action: string, metadata?: Record<string, unknown>) => {
    trackFeatureUsage('player_control', true, {
      action,
      video_id: videoId,
      video_title: videoTitle,
      current_position: getCurrentSessionTime(),
      ...metadata
    });
  }, [videoId, videoTitle, getCurrentSessionTime, trackFeatureUsage]);

  // 播放事件
  const handlePlay = useCallback((position = 0, quality?: string) => {
    playStartTimeRef.current = Date.now();
    trackPlay(position, quality);
    trackPlayerControl('play', { position, quality });
  }, [trackPlay, trackPlayerControl]);

  const handlePause = useCallback((position = 0, reason?: 'user' | 'buffering' | 'error') => {
    trackPause(position);
    trackPlayerControl('pause', { position, reason });
  }, [trackPause, trackPlayerControl]);

  const handleSeek = useCallback((fromPosition: number, toPosition: number) => {
    trackFeatureUsage('player_seek', true, {
      video_id: videoId,
      from_position: fromPosition,
      to_position: toPosition,
      seek_distance: Math.abs(toPosition - fromPosition),
      total_watch_time: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  const handleQualityChange = useCallback((fromQuality: string, toQuality: string, auto = false) => {
    lastQualityChangeRef.current = toQuality;
    trackFeatureUsage('quality_change', true, {
      video_id: videoId,
      from_quality: fromQuality,
      to_quality: toQuality,
      auto_switch: auto,
      user_initiated: !auto,
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  // 缓冲事件
  const handleBufferStart = useCallback(() => {
    bufferCountRef.current++;
    trackFeatureUsage('buffer_start', true, {
      video_id: videoId,
      buffer_count: bufferCountRef.current,
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  const handleBufferEnd = useCallback((duration: number) => {
    trackFeatureUsage('buffer_end', true, {
      video_id: videoId,
      buffer_duration: duration,
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  // 字幕相关
  const handleSubtitleToggle = useCallback((enabled: boolean, language?: string) => {
    subtitleEnabledRef.current = enabled;
    trackFeatureUsage('subtitle_toggle', true, {
      video_id: videoId,
      enabled,
      language: language || 'unknown',
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  const handleSubtitleChange = useCallback((language: string) => {
    trackFeatureUsage('subtitle_change', true, {
      video_id: videoId,
      language,
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  // 播放速度
  const handleSpeedChange = useCallback((newSpeed: number) => {
    playbackSpeedRef.current = newSpeed;
    trackFeatureUsage('playback_speed_change', true, {
      video_id: videoId,
      new_speed: newSpeed,
      old_speed: playbackSpeedRef.current,
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  // 音量控制
  const handleVolumeChange = useCallback((newVolume: number) => {
    volumeLevelRef.current = newVolume;
    trackFeatureUsage('volume_change', true, {
      video_id: videoId,
      new_volume: newVolume,
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  // 全屏切换
  const handleFullscreenToggle = useCallback((isFullscreen: boolean) => {
    isFullscreenRef.current = isFullscreen;
    trackFeatureUsage('fullscreen_toggle', true, {
      video_id: videoId,
      is_fullscreen: isFullscreen,
      position: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  // 错误处理
  const handlePlayerError = useCallback((errorType: string, errorMessage: string, context?: Record<string, unknown>) => {
    errorCountRef.current++;
    trackError('player_error', errorMessage, {
      error_type: errorType,
      video_id: videoId,
      video_title: videoTitle,
      position: getCurrentSessionTime(),
      error_count: errorCountRef.current,
      quality: lastQualityChangeRef.current,
      ...context
    });
  }, [videoId, videoTitle, getCurrentSessionTime, trackError]);

  const handleNetworkError = useCallback((errorType: 'network' | 'timeout' | 'server_error', details?: Record<string, unknown>) => {
    trackError('network_error', `Network error: ${errorType}`, {
      error_type: errorType,
      video_id: videoId,
      video_title: videoTitle,
      position: getCurrentSessionTime(),
      connection_type: getConnectionType(),
      ...details
    });
  }, [videoId, videoTitle, getCurrentSessionTime, trackError]);

  // 用户互动
  const handleLike = useCallback(() => {
    trackFeatureUsage('video_like', true, {
      video_id: videoId,
      video_title: videoTitle,
      position: getCurrentSessionTime()
    });
  }, [videoId, videoTitle, getCurrentSessionTime, trackFeatureUsage]);

  const handleDislike = useCallback(() => {
    trackFeatureUsage('video_dislike', true, {
      video_id: videoId,
      video_title: videoTitle,
      position: getCurrentSessionTime()
    });
  }, [videoId, videoTitle, getCurrentSessionTime, trackFeatureUsage]);

  const handleReport = useCallback((reason: string, description?: string) => {
    trackFeatureUsage('video_report', true, {
      video_id: videoId,
      video_title: videoTitle,
      reason,
      description,
      position: getCurrentSessionTime()
    });
  }, [videoId, videoTitle, getCurrentSessionTime, trackFeatureUsage]);

  // 相关内容点击
  const handleRelatedContentClick = useCallback((relatedVideoId: string, relatedVideoTitle: string, position: number) => {
    trackFeatureUsage('related_content_click', true, {
      video_id: videoId,
      related_video_id: relatedVideoId,
      related_video_title: relatedVideoTitle,
      position_in_list: position,
      watch_duration: getCurrentSessionTime()
    });
  }, [videoId, getCurrentSessionTime, trackFeatureUsage]);

  // 会话结束统计
  const trackSessionEnd = useCallback(() => {
    const totalWatchTime = getTotalWatchTime();
    const sessionDuration = Date.now() - playStartTimeRef.current;
    const completionRate = options.duration ? (totalWatchTime / options.duration) * 100 : 0;

    trackFeatureUsage('play_session_end', true, {
      video_id: videoId,
      total_watch_time: totalWatchTime,
      session_duration: sessionDuration,
      completion_rate: Math.min(completionRate, 100),
      buffer_count: bufferCountRef.current,
      error_count: errorCountRef.current,
      quality_changes_count: 1, // 可以通过 ref 追踪
      subtitles_used: subtitleEnabledRef.current,
      avg_playback_speed: playbackSpeedRef.current,
      fullscreen_used: isFullscreenRef.current
    });

    // 转化事件 - 如果观看时长超过阈值
    if (completionRate >= 50) {
      trackConversion({
        eventName: 'high_engagement_watch',
        step: 'watch_50_percent',
        success: true,
        metadata: {
          video_id: videoId,
          completion_rate: completionRate,
          watch_time: totalWatchTime
        }
      });
    }
  }, [videoId, options.duration, getTotalWatchTime, trackFeatureUsage, trackConversion]);

  // 页面离开时触发
  useEffect(() => {
    const handleBeforeUnload = () => {
      trackSessionEnd();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      trackSessionEnd();
    };
  }, [trackSessionEnd]);

  return {
    // 播放控制
    handlePlay,
    handlePause,
    handleSeek,
    handleQualityChange,

    // 缓冲和错误
    handleBufferStart,
    handleBufferEnd,
    handlePlayerError,
    handleNetworkError,

    // 用户界面
    handleSubtitleToggle,
    handleSubtitleChange,
    handleSpeedChange,
    handleVolumeChange,
    handleFullscreenToggle,

    // 用户互动
    handleLike,
    handleDislike,
    handleReport,
    handleRelatedContentClick,

    // 视频操作
    trackFavorite,
    trackShare,
    trackDownload,

    // 统计信息
    getTotalWatchTime,
    getCurrentSessionTime,
    trackProgress
  };
}

// 辅助函数
function getConnectionType(): string {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const connection = (navigator as NavigatorWithConnection).connection;
    return connection?.effectiveType || 'unknown';
  }
  return 'unknown';
}