/**
 * 内存监控 Hook
 * 监控设备内存使用情况并提供性能优化建议
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type MemoryPressure = 'low' | 'medium' | 'high' | 'critical';

export interface MemoryInfo {
  usedJSHeapSize: number; // 已使用的堆内存
  totalJSHeapSize: number; // 总堆内存
  jsHeapSizeLimit: number; // 堆内存限制
  usage: number; // 使用率 (0-1)
  pressure: MemoryPressure; // 内存压力等级
}

export interface MemoryMonitorOptions {
  checkInterval?: number; // 检查间隔 (毫秒)
  enableAutoCleanup?: boolean; // 启用自动清理
  onPressureChange?: (pressure: MemoryPressure, info: MemoryInfo) => void;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

interface WindowWithGc extends Window {
  gc?: () => void;
}

export function useMemoryMonitor(options: MemoryMonitorOptions = {}) {
  const {
    checkInterval = 10000, // 默认10秒检查一次
    enableAutoCleanup = true,
    onPressureChange,
  } = options;

  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [autoCleanupTriggered, setAutoCleanupTriggered] = useState(false);

  // 使用 Ref 保存 callback，避免依赖变动导致 effect 重启
  const onPressureChangeRef = useRef(onPressureChange);
  useEffect(() => {
    onPressureChangeRef.current = onPressureChange;
  }, [onPressureChange]);

  // 使用 Ref 保存上一次的压力状态，避免 checkMemory 依赖 memoryInfo 状态
  const previousPressureRef = useRef<MemoryPressure>('low');

  // 计算内存压力等级
  const calculateMemoryPressure = useCallback(
    (usage: number): MemoryPressure => {
      // ✅ 提高阈值，减少误报
      if (usage >= 0.92) return 'critical'; // 从 0.9 提高到 0.92
      if (usage >= 0.8) return 'high'; // 从 0.75 提高到 0.80
      if (usage >= 0.6) return 'medium'; // 从 0.5 提高到 0.60
      return 'low';
    },
    [],
  );

  // 获取内存信息
  const getMemoryInfo = useCallback((): MemoryInfo | null => {
    if (typeof window === 'undefined' || !('memory' in performance)) {
      return null;
    }

    const mem = (performance as PerformanceWithMemory).memory;
    if (!mem) return null;
    const usedJSHeapSize = mem.usedJSHeapSize || 0;
    const totalJSHeapSize = mem.totalJSHeapSize || 0;
    const jsHeapSizeLimit = mem.jsHeapSizeLimit || 0;

    const usage = jsHeapSizeLimit > 0 ? usedJSHeapSize / jsHeapSizeLimit : 0;
    const pressure = calculateMemoryPressure(usage);

    return {
      usedJSHeapSize,
      totalJSHeapSize,
      jsHeapSizeLimit,
      usage,
      pressure,
    };
  }, [calculateMemoryPressure]);

  // 触发内存清理
  const triggerMemoryCleanup = useCallback(() => {
    console.log('🧹 触发内存清理...');

    // 清理缓存
    try {
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            caches.delete(name);
          });
          console.log('✅ 清理了 Service Worker 缓存');
        });
      }
    } catch (error) {
      console.warn('清理缓存失败:', error);
    }

    // 强制垃圾回收（如果支持）
    try {
      const gc = (window as WindowWithGc).gc;
      if (gc) {
        gc();
        console.log('✅ 触发了垃圾回收');
      }
    } catch (error) {
      // 忽略错误，因为大多数浏览器不支持
    }

    setAutoCleanupTriggered(true);
    setTimeout(() => setAutoCleanupTriggered(false), 3000);

    // 清理定时器以释放内存
    for (let i = 1; i < 99999; i++) {
      const timerKey = `timer${i}` as keyof typeof window;
      const timer = window[timerKey];
      if (typeof timer === 'number') {
        window.clearTimeout(timer);
        Reflect.set(window, timerKey, undefined);
      }
    }

    console.log('✅ 内存清理完成');
  }, []);

  // 检查内存状态
  const checkMemory = useCallback(() => {
    const info = getMemoryInfo();
    if (!info) return;

    const previousPressure = previousPressureRef.current;

    // 更新状态
    setMemoryInfo(info);

    // 检测压力变化
    if (previousPressure !== info.pressure) {
      previousPressureRef.current = info.pressure;
      if (onPressureChangeRef.current) {
        onPressureChangeRef.current(info.pressure, info);
      }
    }

    // 自动清理机制
    if (
      enableAutoCleanup &&
      info.pressure === 'critical' &&
      !autoCleanupTriggered
    ) {
      console.warn('⚠️ 内存压力达到临界值，触发自动清理');
      triggerMemoryCleanup();
    }

    // 性能警告
    if (info.pressure === 'critical') {
      console.warn('🚨 内存压力过高:', {
        usage: `${(info.usage * 100).toFixed(1)}%`,
        used: `${(info.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        limit: `${(info.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`,
      });
    }
  }, [
    getMemoryInfo,
    enableAutoCleanup,
    autoCleanupTriggered,
    triggerMemoryCleanup,
  ]);

  // 获取优化建议
  const getOptimizations = useCallback((): string[] => {
    if (!memoryInfo) return [];

    const suggestions: string[] = [];
    const { pressure } = memoryInfo;

    switch (pressure) {
      case 'critical':
        suggestions.push('关闭弹幕功能');
        suggestions.push('降低视频缓冲区大小');
        suggestions.push('减少同时打开的标签页');
        suggestions.push('刷新页面以释放内存');
        break;
      case 'high':
        suggestions.push('减少弹幕密度');
        suggestions.push('使用较低的清晰度');
        suggestions.push('关闭非必要的功能');
        break;
      case 'medium':
        suggestions.push('考虑使用中等清晰度');
        suggestions.push('注意内存使用情况');
        break;
      case 'low':
        suggestions.push('当前内存使用正常');
        break;
    }

    return suggestions;
  }, [memoryInfo]);

  // 获取适配配置
  const getAdaptiveConfig = useCallback(() => {
    if (!memoryInfo) return null;

    const { pressure } = memoryInfo;

    return {
      video: {
        maxBufferLength:
          pressure === 'critical'
            ? 3
            : pressure === 'high'
              ? 5
              : pressure === 'medium'
                ? 10
                : 15,
        backBufferLength:
          pressure === 'critical'
            ? 1
            : pressure === 'high'
              ? 3
              : pressure === 'medium'
                ? 5
                : Infinity,
        maxBufferSize:
          pressure === 'critical'
            ? 10 * 1000 * 1000
            : pressure === 'high'
              ? 20 * 1000 * 1000
              : pressure === 'medium'
                ? 30 * 1000 * 1000
                : 60 * 1000 * 1000,
      },
      danmaku: {
        maxCount:
          pressure === 'critical'
            ? 500
            : pressure === 'high'
              ? 800
              : pressure === 'medium'
                ? 1200
                : 2000,
        opacity:
          pressure === 'critical' ? 0.6 : pressure === 'high' ? 0.7 : 1.0,
        fontSize: pressure === 'critical' ? 20 : pressure === 'high' ? 22 : 25,
        filterRate:
          pressure === 'critical' ? 0.5 : pressure === 'high' ? 0.7 : 1.0, // 弹幕过滤比例
      },
      ui: {
        enableAnimations: pressure !== 'critical',
        enableShadows: pressure !== 'critical',
        enableBlur: pressure === 'low',
      },
      cache: {
        maxSize:
          pressure === 'critical'
            ? 20
            : pressure === 'high'
              ? 30
              : pressure === 'medium'
                ? 40
                : 50,
        ttl:
          pressure === 'critical'
            ? 5 * 60 * 1000
            : pressure === 'high'
              ? 10 * 60 * 1000
              : pressure === 'medium'
                ? 15 * 60 * 1000
                : 30 * 60 * 1000,
      },
    };
  }, [memoryInfo]);

  // 检查支持性
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'memory' in performance;
    setIsSupported(supported);

    if (!supported) {
      console.warn('⚠️ 当前浏览器不支持内存监控 API');
    }
  }, []);

  // 启动监控
  useEffect(() => {
    if (!isSupported || checkInterval <= 0) return;

    // 立即检查一次
    checkMemory();

    const interval = setInterval(checkMemory, checkInterval);

    return () => clearInterval(interval);
  }, [isSupported, checkInterval, checkMemory]);

  // 返回结果
  return {
    memoryInfo,
    isSupported,
    pressure: memoryInfo?.pressure || 'low',
    usage: memoryInfo?.usage || 0,
    optimizations: getOptimizations(),
    adaptiveConfig: getAdaptiveConfig(),
    triggerCleanup: triggerMemoryCleanup,
    autoCleanupTriggered,
  };
}
