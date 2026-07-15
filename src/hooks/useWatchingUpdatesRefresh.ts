import { useCallback, useEffect, useRef } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { DELAYS } from '@/lib/constants/home';

interface UseWatchingUpdatesRefreshOptions {
  activeTab: 'home' | 'favorites';
  refreshWatchingUpdates: () => void | Promise<void>;
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
  const watchingUpdatesEventVersionRef = useRef(0);
  const pendingInvalidationRef = useRef(false);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const runWatchingUpdatesCheck = useCallback(async () => {
    if (isCheckingRef.current) return;
    if (!canCheckWatchingUpdates(activeTabRef.current)) return;

    const isInvalidationCheck = pendingInvalidationRef.current;
    pendingInvalidationRef.current = false;

    try {
      isCheckingRef.current = true;
      const eventVersion = watchingUpdatesEventVersionRef.current;
      const { checkWatchingUpdates } = await import('@/lib/watching-updates');
      await checkWatchingUpdates(isInvalidationCheck);
      if (
        watchingUpdatesEventVersionRef.current === eventVersion &&
        !pendingInvalidationRef.current
      ) {
        await refreshWatchingUpdates();
      }
    } catch (error) {
      reportWatchingUpdatesError('追更缓存拉取失败:', error);
    } finally {
      isCheckingRef.current = false;
      if (
        pendingInvalidationRef.current &&
        canCheckWatchingUpdates(activeTabRef.current)
      ) {
        void runWatchingUpdatesCheck();
      }
    }
  }, [refreshWatchingUpdates]);

  useEffect(() => {
    if (activeTab === 'home' && pendingInvalidationRef.current) {
      void runWatchingUpdatesCheck();
    }
  }, [activeTab, runWatchingUpdatesCheck]);

  const scheduleWatchingUpdatesCheck = useCallback((): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;

    const runCheck = () => {
      if (!canCheckWatchingUpdates(activeTabRef.current)) return;
      void runWatchingUpdatesCheck();
    };

    const delay = Math.max(DELAYS.WATCHING_UPDATES_CHECK, 4000);

    return scheduleIdleTask(runCheck, {
      delayMs: delay,
      timeoutMs: delay + 1500,
    });
  }, [runWatchingUpdatesCheck]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    import('@/lib/watching-updates')
      .then(({ subscribeToWatchingUpdatesEvent }) => {
        if (cancelled) return;
        unsubscribe = subscribeToWatchingUpdatesEvent(
          (_hasUpdates, _updatedCount, invalidated) => {
            if (invalidated) {
              pendingInvalidationRef.current = true;
              void runWatchingUpdatesCheck();
              return;
            }

            watchingUpdatesEventVersionRef.current += 1;
            void refreshWatchingUpdates();
          },
        );
      })
      .catch(() => {
        unsubscribe = null;
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refreshWatchingUpdates, runWatchingUpdatesCheck]);

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
      void runWatchingUpdatesCheck();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runWatchingUpdatesCheck]);

  return {
    scheduleWatchingUpdatesCheck,
  };
}
