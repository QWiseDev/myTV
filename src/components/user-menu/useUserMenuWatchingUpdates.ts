import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { debug } from '@/lib/debug';
import { buildUserMenuWatchingUpdatesState } from '@/lib/user-menu-watching-updates';
import {
  type WatchingUpdate,
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
} from '@/lib/watching-updates';

interface UserMenuIdentity {
  username?: string;
}

interface UseUserMenuWatchingUpdatesOptions {
  authInfo: UserMenuIdentity | null;
  storageType: string;
}

export function useUserMenuWatchingUpdates({
  authInfo,
  storageType,
}: UseUserMenuWatchingUpdatesOptions) {
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    null,
  );
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage'
    ) {
      debug.log('watching-updates 条件不满足，跳过加载');
    }
  }, [authInfo?.username, storageType]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage'
    ) {
      return undefined;
    }

    debug.log('开始加载 watching-updates 数据...');

    const updateWatchingUpdates = (eventHasEpisodeUpdates?: boolean) => {
      const updates = getDetailedWatchingUpdates();
      debug.log('getDetailedWatchingUpdates 返回:', updates);
      setWatchingUpdates(updates);

      const hasEpisodeUpdates =
        eventHasEpisodeUpdates ?? Boolean((updates?.updatedCount || 0) > 0);
      if (updates && hasEpisodeUpdates) {
        const lastViewed = parseInt(
          localStorage.getItem('watchingUpdatesLastViewed') || '0',
        );
        const currentTime = Date.now();
        const hasNewUpdates =
          lastViewed === 0 ||
          (updates.timestamp > lastViewed && currentTime - lastViewed > 60000);
        setHasUnreadUpdates(hasNewUpdates);
      } else {
        setHasUnreadUpdates(false);
      }
    };

    if (getCachedWatchingUpdates()) {
      debug.log('发现缓存数据，先加载缓存');
      updateWatchingUpdates();
    }

    const unsubscribe = subscribeToWatchingUpdatesEvent(
      (hasUpdates, updatedCount, invalidated) => {
        if (invalidated) return;

        debug.log('收到 watching-updates 事件，更新数据...');
        updateWatchingUpdates(hasUpdates && updatedCount > 0);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [authInfo, storageType]);

  const watchingUpdatesState = useMemo(
    () => buildUserMenuWatchingUpdatesState(watchingUpdates),
    [watchingUpdates],
  );

  const showWatchingUpdates =
    authInfo?.username && storageType !== 'localstorage';
  const debugLoggedRef = useRef<string>('');

  useEffect(() => {
    const currentState = JSON.stringify({
      username: authInfo?.username,
      storageType,
      showWatchingUpdates,
      hasActualUpdates: watchingUpdatesState.hasActualUpdates,
      totalUpdates: watchingUpdatesState.totalUpdates,
      watchingUpdatesVersion: watchingUpdates?.updatedSeries
        ? Object.keys(watchingUpdates.updatedSeries).length
        : 0,
    });

    if (currentState !== debugLoggedRef.current) {
      debugLoggedRef.current = currentState;
      debug.log('UserMenu 更新提醒调试:', {
        username: authInfo?.username,
        storageType,
        showWatchingUpdates,
        hasActualUpdates: watchingUpdatesState.hasActualUpdates,
        totalUpdates: watchingUpdatesState.totalUpdates,
        watchingUpdatesVersion: watchingUpdates?.updatedSeries
          ? Object.keys(watchingUpdates.updatedSeries).length
          : 0,
      });
    }
  }, [
    authInfo?.username,
    storageType,
    showWatchingUpdates,
    watchingUpdatesState.hasActualUpdates,
    watchingUpdatesState.totalUpdates,
    watchingUpdates?.updatedSeries,
  ]);

  const markWatchingUpdatesViewed = useCallback(() => {
    setHasUnreadUpdates(false);
    localStorage.setItem('watchingUpdatesLastViewed', Date.now().toString());
  }, []);

  return {
    hasUnreadUpdates,
    markWatchingUpdatesViewed,
    watchingUpdatesState,
  };
}
