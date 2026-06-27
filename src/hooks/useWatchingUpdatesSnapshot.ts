import { useCallback, useRef, useState } from 'react';

import { type WatchingUpdate } from '@/lib/watching-updates';

function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(...args);
  }
}

export function useWatchingUpdatesSnapshot() {
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    null,
  );
  const [loadingWatchingUpdates, setLoadingWatchingUpdates] = useState(false);
  const hasLoadedRef = useRef(false);

  const loadWatchingUpdates = useCallback(async (force = false) => {
    if (typeof window === 'undefined') return;
    if (!force && hasLoadedRef.current) return;

    try {
      setLoadingWatchingUpdates(true);
      const { getDetailedWatchingUpdates } =
        await import('@/lib/watching-updates');
      setWatchingUpdates(getDetailedWatchingUpdates());
      hasLoadedRef.current = true;
    } catch (error) {
      debugError('加载观看更新失败:', error);
      setWatchingUpdates(null);
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
