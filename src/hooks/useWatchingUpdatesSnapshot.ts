import { useCallback, useRef, useState } from 'react';

import {
  type WatchingUpdate,
  getDetailedWatchingUpdates,
} from '@/lib/watching-updates';

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
    return getDetailedWatchingUpdates();
  } catch (error) {
    debugError('读取追更缓存失败:', error);
    return null;
  }
}

export function useWatchingUpdatesSnapshot() {
  // 首屏同步读取本地/内存缓存，避免继续观看等徽章必须等 4s 网络刷新
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    () => readCachedWatchingUpdates(),
  );
  const [loadingWatchingUpdates, setLoadingWatchingUpdates] = useState(false);
  const hasLoadedRef = useRef(watchingUpdates !== null);

  const loadWatchingUpdates = useCallback(async (force = false) => {
    if (typeof window === 'undefined') return;
    if (!force && hasLoadedRef.current) return;

    try {
      // 有缓存时后台刷新，不把 loading 置 true，避免继续观看区块闪骨架
      if (!hasLoadedRef.current) {
        setLoadingWatchingUpdates(true);
      }
      setWatchingUpdates(getDetailedWatchingUpdates());
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
