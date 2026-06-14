import { useCallback, useEffect, useRef } from 'react';

import { useAnalytics } from './useAnalytics';

/**
 * 性能分析 Hook
 */
export function usePerformanceAnalytics() {
  const {
    trackPageLoadTime,
    trackVideoLoadTime,
    trackApiPerformance,
    trackError,
    trackFeatureUsage
  } = useAnalytics();

  // 追踪 API 请求性能
  const trackApiRequest = useCallback((
    apiEndpoint: string,
    startTime: number,
    endTime: number,
    statusCode: number,
    error?: string
  ) => {
    const responseTime = endTime - startTime;

    trackApiPerformance(apiEndpoint, responseTime, statusCode);

    // 如果有错误，记录错误事件
    if (error) {
      trackError('api_error', error, {
        api_endpoint: apiEndpoint,
        response_time: responseTime,
        status_code: statusCode
      });
    }

    // 如果响应时间过长，记录性能警告
    if (responseTime > 5000) { // 5秒
      trackError('slow_api_response', `Slow API response: ${responseTime}ms`, {
        api_endpoint: apiEndpoint,
        response_time: responseTime,
        status_code: statusCode
      });
    }

    return responseTime;
  }, [trackApiPerformance, trackError]);

  // 追踪资源加载性能
  const trackResourceLoad = useCallback((resourceType: string, resourceUrl: string, loadTime: number, success: boolean) => {
    trackFeatureUsage('resource_load', true, {
      resource_type: resourceType,
      resource_url: resourceUrl,
      load_time: loadTime,
      success
    });

    if (!success) {
      trackError('resource_load_failed', `Failed to load ${resourceType}: ${resourceUrl}`, {
        resource_type: resourceType,
        resource_url: resourceUrl,
        load_time: loadTime
      });
    }
  }, [trackFeatureUsage, trackError]);

  // 追踪用户交互性能
  const trackInteractionPerformance = useCallback((interactionType: string, startTime: number, endTime: number, target?: string) => {
    const interactionTime = endTime - startTime;

    trackFeatureUsage('user_interaction', true, {
      interaction_type: interactionType,
      interaction_time: interactionTime,
      target: target || 'unknown'
    });

    // 如果交互响应慢，记录性能问题
    if (interactionTime > 100) { // 100ms
      trackError('slow_interaction', `Slow interaction: ${interactionTime}ms`, {
        interaction_type: interactionType,
        interaction_time: interactionTime,
        target
      });
    }
  }, [trackFeatureUsage, trackError]);

  return {
    trackApiRequest,
    trackResourceLoad,
    trackInteractionPerformance,
    trackPageLoadTime,
    trackVideoLoadTime
  };
}

/**
 * 自动性能监控 Hook
 */
export function useAutoPerformanceMonitoring() {
  const { trackApiRequest, trackResourceLoad } = usePerformanceAnalytics();
  const apiRequestsRef = useRef<Map<string, number>>(new Map());
  const interactionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 监控 fetch 请求
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
      const startTime = performance.now();

      try {
        const response = await originalFetch(input, init);
        const endTime = performance.now();

        trackApiRequest(url, startTime, endTime, response.status);

        return response;
      } catch (error) {
        const endTime = performance.now();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        trackApiRequest(url, startTime, endTime, 0, errorMessage);

        throw error;
      }
    };

    // 简化性能监控 - 只监控 fetch 请求
    // XMLHttpRequest 监控由于复杂的类型问题暂时跳过

    // 监控资源加载
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.entryType === 'resource') {
          const resource = entry as PerformanceResourceTiming;
          const loadTime = resource.responseEnd - resource.startTime;
          const success = resource.transferSize > 0 || resource.decodedBodySize > 0;

          trackResourceLoad(
            getResourceType(resource.name),
            resource.name,
            loadTime,
            success
          );
        }
      });
    });

    observer.observe({ entryTypes: ['resource'] });

    return () => {
      window.fetch = originalFetch;
      observer.disconnect();
    };
  }, [trackApiRequest, trackResourceLoad]);

  // 监控用户交互
  const startInteractionTiming = useCallback((interactionId: string) => {
    interactionsRef.current.set(interactionId, performance.now());
  }, []);

  const endInteractionTiming = useCallback((interactionId: string, interactionType: string, target?: string) => {
    const startTime = interactionsRef.current.get(interactionId);
    if (startTime) {
      const endTime = performance.now();
      const interactionTime = endTime - startTime;

      if (interactionTime > 100) {
        console.warn(`Slow interaction detected: ${interactionType} took ${interactionTime.toFixed(2)}ms`);
      }

      interactionsRef.current.delete(interactionId);
      return interactionTime;
    }
    return 0;
  }, []);

  return {
    startInteractionTiming,
    endInteractionTiming
  };
}

/**
 * 网络状态监控 Hook
 */
export function useNetworkAnalytics() {
  const { trackError, trackFeatureUsage } = useAnalytics();

  useEffect(() => {
    if (typeof window === 'undefined' || !('navigator' in window)) return;

    // 监控网络状态变化
    const handleOnline = () => {
      trackFeatureUsage('network_status_change', true, {
        status: 'online',
        connection_type: getConnectionType()
      });
    };

    const handleOffline = () => {
      trackError('network_offline', 'Network connection lost', {
        connection_type: getConnectionType()
      });
    };

    const handleConnectionChange = () => {
      const connectionInfo = getConnectionInfo();
      trackFeatureUsage('network_connection_change', true, connectionInfo);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 监控网络连接信息（如果支持）
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [trackError, trackFeatureUsage]);

  return {};
}

// 辅助函数
function getResourceType(url: string): string {
  if (url.includes('.js')) return 'javascript';
  if (url.includes('.css')) return 'stylesheet';
  if (url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) return 'image';
  if (url.match(/\.(mp4|webm|ogg|avi)$/i)) return 'video';
  if (url.match(/\.(mp3|wav|ogg|aac)$/i)) return 'audio';
  if (url.includes('/api/')) return 'api';
  return 'other';
}

function getConnectionType(): string {
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    return connection.effectiveType || 'unknown';
  }
  return 'unknown';
}

function getConnectionInfo(): Record<string, any> {
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    return {
      effective_type: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      save_data: connection.saveData
    };
  }
  return { effective_type: 'unknown' };
}