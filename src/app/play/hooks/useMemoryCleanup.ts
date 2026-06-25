'use client';

import { useEffect } from 'react';

import { ClientCache } from '@/lib/client-cache';

interface UseMemoryCleanupOptions {
  isMobile: boolean;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface WindowWithGc extends Window {
  gc?: () => void;
}

export function useMemoryCleanup({ isMobile }: UseMemoryCleanupOptions) {
  useEffect(() => {
    if (!isMobile) return;

    const checkMemoryPressure = async () => {
      if (typeof performance !== 'undefined' && 'memory' in performance) {
        try {
          const memInfo = (performance as PerformanceWithMemory).memory;
          if (!memInfo) return;
          const usedJSHeapSize = memInfo.usedJSHeapSize;
          const heapLimit = memInfo.jsHeapSizeLimit;
          const memoryUsageRatio = usedJSHeapSize / heapLimit;


          if (memoryUsageRatio > 0.75) {
            console.warn('内存使用过高，清理缓存...');

            try {
              await ClientCache.clearExpired('danmu-cache');
              const oldCacheKey = 'lunatv_danmu_cache';
              localStorage.removeItem(oldCacheKey);
            } catch (e) {
              console.warn('清理弹幕缓存失败:', e);
            }

            const gc = (window as WindowWithGc).gc;
            if (typeof gc === 'function') {
              gc();
            }
          }
        } catch (error) {
          console.warn('内存检测失败:', error);
        }
      }
    };

    const interval = setInterval(() => {
      checkMemoryPressure().catch(console.error);
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [isMobile]);
}
