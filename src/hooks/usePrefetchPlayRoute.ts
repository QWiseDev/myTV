'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type NetworkNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
  };
};

let hasPrefetchedPlayRoute = false;

export function resetPrefetchPlayRouteForTests(): void {
  hasPrefetchedPlayRoute = false;
}

/**
 * 在首页/搜索页浏览器空闲时预取一次 `/play` 路由分包：
 * 所有影片共用同一套 `/play` JS bundle，单次预取即可避免点击卡片时现场等待拉取路由脚本。
 */
export function usePrefetchPlayRoute(): void {
  const router = useRouter();

  useEffect(() => {
    if (hasPrefetchedPlayRoute || typeof window === 'undefined') {
      return;
    }

    const nav = navigator as NetworkNavigator;
    if (nav.connection?.saveData) {
      return;
    }

    const runPrefetch = () => {
      if (hasPrefetchedPlayRoute) return;
      hasPrefetchedPlayRoute = true;
      try {
        router.prefetch?.('/play');
      } catch {
        // ignore prefetch failure
      }
    };

    const idleWin = window as IdleWindow;
    if (typeof idleWin.requestIdleCallback === 'function') {
      const handle = idleWin.requestIdleCallback(runPrefetch, {
        timeout: 2000,
      });
      return () => {
        idleWin.cancelIdleCallback?.(handle);
      };
    }

    const timer = window.setTimeout(runPrefetch, 800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [router]);
}
