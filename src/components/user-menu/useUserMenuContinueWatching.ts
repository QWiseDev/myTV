import { useEffect, useState } from 'react';

import { getAllPlayRecords } from '@/lib/db.client';
import { debug } from '@/lib/debug';
import type { PlayRecord } from '@/lib/types';
import {
  type UserMenuContinueWatchingRecord,
  buildUserMenuContinueWatchingRecords,
} from '@/lib/user-menu-continue-watching';
import {
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
} from '@/lib/watching-updates';

interface UserMenuIdentity {
  username?: string;
}

interface UseUserMenuContinueWatchingOptions {
  authInfo: UserMenuIdentity | null;
  enableProgressFilter: boolean;
  isOpen: boolean;
  maxProgress: number;
  minProgress: number;
  storageType: string;
}

export function useUserMenuContinueWatching({
  authInfo,
  enableProgressFilter,
  isOpen,
  maxProgress,
  minProgress,
  storageType,
}: UseUserMenuContinueWatchingOptions) {
  const [playRecords, setPlayRecords] = useState<
    UserMenuContinueWatchingRecord[]
  >([]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage' ||
      !isOpen
    ) {
      return undefined;
    }

    let isActive = true;
    let latestRequestId = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const updateContinueWatchingRecords = (
      records: Record<string, PlayRecord>,
    ) => {
      setPlayRecords(
        buildUserMenuContinueWatchingRecords(records, {
          enableProgressFilter,
          maxProgress,
          minProgress,
        }),
      );
    };

    const loadPlayRecords = async () => {
      const requestId = ++latestRequestId;
      try {
        const records = await getAllPlayRecords();
        if (!isActive || requestId !== latestRequestId) return;

        updateContinueWatchingRecords(records);
      } catch (error) {
        debug.error('加载播放记录失败:', error);
      }
    };

    loadPlayRecords();

    const handlePlayRecordsUpdate = () => {
      debug.log('UserMenu: 播放记录更新，重新加载继续观看列表');
      loadPlayRecords();
    };

    window.addEventListener('playRecordsUpdated', handlePlayRecordsUpdate);

    const unsubscribeWatchingUpdates = subscribeToWatchingUpdatesEvent(
      (_hasUpdates, _updatedCount, invalidated) => {
        if (invalidated) return;

        debug.log('UserMenu: 收到watching-updates事件');

        const updates = getDetailedWatchingUpdates();
        if (updates && updates.hasUpdates && updates.updatedCount > 0) {
          debug.log('UserMenu: 检测到新集数更新，使用现有缓存（30分钟间隔）');

          if (refreshTimer) {
            clearTimeout(refreshTimer);
          }
          refreshTimer = setTimeout(async () => {
            const requestId = ++latestRequestId;
            const freshRecords = await getAllPlayRecords();
            if (!isActive || requestId !== latestRequestId) return;

            updateContinueWatchingRecords(freshRecords);
          }, 100);
        }
      },
    );

    return () => {
      isActive = false;
      latestRequestId += 1;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      window.removeEventListener('playRecordsUpdated', handlePlayRecordsUpdate);
      unsubscribeWatchingUpdates();
    };
  }, [
    authInfo,
    storageType,
    enableProgressFilter,
    minProgress,
    maxProgress,
    isOpen,
  ]);

  return { playRecords };
}
