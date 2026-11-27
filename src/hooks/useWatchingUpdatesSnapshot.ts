import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  type WatchingUpdate,
  getDetailedWatchingUpdates,
} from '@/lib/watching-updates';

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
    return getDetailedWatchingUpdates();
  } catch (error) {
    debugError('读取追更缓存失败:', error);
    return null;
  }
}

export function useWatchingUpdatesSnapshot() {
  // 初始值与 SSR 保持一致为 null，避免水合首帧读 localStorage 引发 Hydration Mismatch；
  // 随后在 layoutEffect（首绘前）同步回填本地缓存，既无水合冲突也不闪烁。
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    null,
  );
  const [loadingWatchingUpdates, setLoadingWatchingUpdates] = useState(false);
  const hasLoadedRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const cached = readCachedWatchingUpdates();
    if (cached !== null) {
      hasLoadedRef.current = true;
      setWatchingUpdates(cached);
    }
  }, []);

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
