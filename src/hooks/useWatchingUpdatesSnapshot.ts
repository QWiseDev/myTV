import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { WatchingUpdate } from '@/lib/watching-updates';
import * as watchingUpdatesLib from '@/lib/watching-updates';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(...args);
  }
}

function readCachedWatchingUpdates(): WatchingUpdate | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return watchingUpdatesLib.getDetailedWatchingUpdates();
  } catch (error) {
    debugError('读取追更缓存失败:', error);
    return null;
  }
}

export function useWatchingUpdatesSnapshot(
  initialWatchingUpdates?: WatchingUpdate | null,
) {
  // 若 SSR 已传入初始快照，首帧直接与服务端一致渲染，零闪烁且无水合冲突；
  // 否则保持 null 并在 layoutEffect 首绘前同步回填客户端内存缓存。
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    initialWatchingUpdates ?? null,
  );
  const [loadingWatchingUpdates, setLoadingWatchingUpdates] = useState(false);
  const hasLoadedRef = useRef(Boolean(initialWatchingUpdates));

  useIsomorphicLayoutEffect(() => {
    if (initialWatchingUpdates) {
      hasLoadedRef.current = true;
      if (typeof watchingUpdatesLib.seedWatchingUpdatesCache === 'function') {
        watchingUpdatesLib.seedWatchingUpdatesCache(initialWatchingUpdates);
      }
      const cached = readCachedWatchingUpdates();
      if (cached && cached.timestamp > initialWatchingUpdates.timestamp) {
        setWatchingUpdates(cached);
      }
      return;
    }

    const cached = readCachedWatchingUpdates();
    if (cached !== null) {
      hasLoadedRef.current = true;
      setWatchingUpdates(cached);
    }
  }, [initialWatchingUpdates]);

  const loadWatchingUpdates = useCallback(async (force = false) => {
    if (typeof window === 'undefined') return;
    if (!force && hasLoadedRef.current) return;

    try {
      // 有缓存时后台刷新，不把 loading 置 true，避免继续观看区块闪骨架
      if (!hasLoadedRef.current) {
        setLoadingWatchingUpdates(true);
      }
      setWatchingUpdates(watchingUpdatesLib.getDetailedWatchingUpdates());
      hasLoadedRef.current = true;
    } catch (error) {
      debugError('加载观看更新失败:', error);
      if (!hasLoadedRef.current) {
        setWatchingUpdates(null);
      }
    } finally {
      setLoadingWatchingUpdates(false);
    }
  }, []);

  const refreshWatchingUpdates = useCallback(async () => {
    hasLoadedRef.current = false;
    await loadWatchingUpdates(true);
  }, [loadWatchingUpdates]);

  return {
    loadingWatchingUpdates,
    refreshWatchingUpdates,
    setWatchingUpdates,
    watchingUpdates,
  };
}
