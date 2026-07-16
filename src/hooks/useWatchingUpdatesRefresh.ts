import { useCallback, useEffect, useRef } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { DELAYS } from '@/lib/constants/home';

interface UseWatchingUpdatesRefreshOptions {
  activeTab: 'home' | 'favorites';
  refreshWatchingUpdates: () => void | Promise<void>;
}

const WATCHING_UPDATES_POLL_INTERVAL_MS = 30 * 60 * 1000;

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

function shouldThrottleWatchingUpdatesCheck(
  lastCheckAt: number | null,
  now: number,
) {
  return (
    lastCheckAt !== null &&
    now - lastCheckAt < WATCHING_UPDATES_POLL_INTERVAL_MS
  );
}

export function useWatchingUpdatesRefresh({
  activeTab,
  refreshWatchingUpdates,
}: UseWatchingUpdatesRefreshOptions) {
  const isMountedRef = useRef(true);
  const isCheckingRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  const lastCheckAtRef = useRef<number | null>(null);
  const watchingUpdatesEventVersionRef = useRef(0);
  const pendingInvalidationRef = useRef(false);
  const pendingRegularCheckRef = useRef(false);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      pendingInvalidationRef.current = false;
      pendingRegularCheckRef.current = false;
    };
  }, []);

  const runWatchingUpdatesCheck = useCallback(async () => {
    if (!isMountedRef.current) return;
    if (isCheckingRef.current) return;
    if (!canCheckWatchingUpdates(activeTabRef.current)) return;

    const isInvalidationCheck = pendingInvalidationRef.current;
    const now = Date.now();
    if (
      !isInvalidationCheck &&
      shouldThrottleWatchingUpdatesCheck(lastCheckAtRef.current, now)
    ) {
      pendingRegularCheckRef.current = false;
      return;
    }

    pendingInvalidationRef.current = false;
    pendingRegularCheckRef.current = false;

    try {
      isCheckingRef.current = true;
      const eventVersion = watchingUpdatesEventVersionRef.current;
      const { checkWatchingUpdates } = await import('@/lib/watching-updates');
      await checkWatchingUpdates(isInvalidationCheck);
      lastCheckAtRef.current = Date.now();
      if (!isMountedRef.current) return;
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
        isMountedRef.current &&
        (pendingInvalidationRef.current || pendingRegularCheckRef.current) &&
        canCheckWatchingUpdates(activeTabRef.current)
      ) {
        void runWatchingUpdatesCheck();
      }
    }
  }, [refreshWatchingUpdates]);

  useEffect(() => {
    if (
      activeTab === 'home' &&
      (pendingInvalidationRef.current || pendingRegularCheckRef.current)
    ) {
      void runWatchingUpdatesCheck();
    }
  }, [activeTab, runWatchingUpdatesCheck]);

  const scheduleWatchingUpdatesCheck = useCallback((): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;

    const runCheck = () => {
      pendingRegularCheckRef.current = true;
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
