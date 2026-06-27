import { useCallback, useEffect, useRef, useState } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import type { PlayRecord } from '@/lib/types';

function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(...args);
  }
}

export function usePlaybackRecords(
  refreshWatchingUpdates: () => Promise<void>,
) {
  const [playRecords, setPlayRecords] = useState<Record<
    string,
    PlayRecord
  > | null>(null);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPlayRecords = useCallback(async () => {
    try {
      setLoadingPlayRecords(true);
      const { getRecentPlayRecords } = await import('@/lib/db.client');
      const records = await getRecentPlayRecords(60);
      setPlayRecords(records);
    } catch (error) {
      debugError('加载播放记录失败:', error);
      setPlayRecords(null);
    } finally {
      setLoadingPlayRecords(false);
    }
  }, []);

  const refreshPlayRecords = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      void (async () => {
        await loadPlayRecords();
        await refreshWatchingUpdates();
      })();
    }, 500);
  }, [loadPlayRecords, refreshWatchingUpdates]);

  useEffect(() => {
    const cancelLoad = scheduleIdleTask(
      () => {
        void loadPlayRecords();
      },
      {
        delayMs: 200,
        timeoutMs: 1000,
      },
    );

    return () => {
      cancelLoad();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [loadPlayRecords]);

  return {
    loadingPlayRecords,
    playRecords,
    refreshPlayRecords,
    setPlayRecords,
  };
}
