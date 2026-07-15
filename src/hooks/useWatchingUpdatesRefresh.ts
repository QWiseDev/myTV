import { useCallback, useEffect, useRef } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { DELAYS } from '@/lib/constants/home';

interface UseWatchingUpdatesRefreshOptions {
  activeTab: 'home' | 'favorites';
  refreshWatchingUpdates: () => void;
}

const VISIBILITY_CHECK_THROTTLE_MS = 15_000;

function reportWatchingUpdatesError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error);
  }
}

function canCheckWatchingUpdates(
  activeTab: UseWatchingUpdatesRefreshOptions['activeTab'],
) {
  return (
    activeTab === 'home' &&
    !(typeof document !== 'undefined' && document.hidden)
  );
}

function shouldThrottleVisibilityCheck(lastCheckAt: number, now: number) {
  return now - lastCheckAt < VISIBILITY_CHECK_THROTTLE_MS;
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
    if (!canCheckWatchingUpdates(activeTabRef.current)) return;

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

  const scheduleWatchingUpdatesCheck = useCallback((): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;

    const runCheck = () => {
      if (!canCheckWatchingUpdates(activeTabRef.current)) return;
      void checkWatchingUpdates();
    };

    const delay = Math.max(DELAYS.WATCHING_UPDATES_CHECK, 4000);

    return scheduleIdleTask(runCheck, {
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
      if (!canCheckWatchingUpdates(activeTabRef.current)) return;

      const now = Date.now();
      if (
        shouldThrottleVisibilityCheck(visibilityCheckThrottleRef.current, now)
      ) {
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
