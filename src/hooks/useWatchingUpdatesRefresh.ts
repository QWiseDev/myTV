import { useCallback, useEffect, useRef } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { DELAYS } from '@/lib/constants/home';

interface UseWatchingUpdatesRefreshOptions {
  activeTab: 'home' | 'favorites';
  refreshWatchingUpdates: () => void;
}

function reportWatchingUpdatesError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error);
  }
}

export function useWatchingUpdatesRefresh({
  activeTab,
  refreshWatchingUpdates,
}: UseWatchingUpdatesRefreshOptions) {
  const isCheckingRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  const visibilityCheckThrottleRef = useRef(0);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const checkWatchingUpdates = useCallback(async () => {
    if (isCheckingRef.current) return;
    if (activeTabRef.current !== 'home') return;
    if (typeof document !== 'undefined' && document.hidden) return;

    try {
      isCheckingRef.current = true;
      const { fetchWatchingUpdatesFromServer } =
        await import('@/lib/watching-updates');
      await fetchWatchingUpdatesFromServer();
    } catch (error) {
      reportWatchingUpdatesError('追更缓存拉取失败:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  const scheduleWatchingUpdatesCheck = useCallback(() => {
    if (typeof window === 'undefined') return;

    const runCheck = () => {
      if (document.hidden || activeTabRef.current !== 'home') return;
      void checkWatchingUpdates();
    };

    const delay = Math.max(DELAYS.WATCHING_UPDATES_CHECK, 4000);

    scheduleIdleTask(runCheck, {
      delayMs: delay,
      timeoutMs: delay + 1500,
    });
  }, [checkWatchingUpdates]);

  useEffect(() => {
    if (activeTab !== 'home') return;

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    import('@/lib/watching-updates')
      .then(({ subscribeToWatchingUpdatesEvent }) => {
        if (cancelled) return;
        unsubscribe = subscribeToWatchingUpdatesEvent(refreshWatchingUpdates);
      })
      .catch(() => {
        unsubscribe = null;
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [activeTab, refreshWatchingUpdates]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden || activeTabRef.current !== 'home') return;

      const now = Date.now();
      if (now - visibilityCheckThrottleRef.current < 15_000) {
        return;
      }

      visibilityCheckThrottleRef.current = now;
      void checkWatchingUpdates();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkWatchingUpdates]);

  return {
    scheduleWatchingUpdatesCheck,
  };
}
