import { useCallback, useEffect, useRef, useState } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import type { PlayRecord } from '@/lib/types';

// 首页继续观看首屏可见量有限，配合「加载更多」降低首包与渲染成本
const PLAY_RECORDS_PAGE_SIZE = 12;
const EMPTY_PRIORITY_PLAY_RECORD_KEYS: string[] = [];

function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(...args);
  }
}

function filterDeletedRecords(
  records: Record<string, PlayRecord>,
  deletedKeys: ReadonlySet<string>,
): Record<string, PlayRecord> {
  if (deletedKeys.size === 0) return records;

  return Object.fromEntries(
    Object.entries(records).filter(([key]) => !deletedKeys.has(key)),
  );
}

export function usePlaybackRecords(
  refreshWatchingUpdates: () => Promise<void>,
  priorityPlayRecordKeys: string[] = EMPTY_PRIORITY_PLAY_RECORD_KEYS,
) {
  const [playRecords, setPlayRecords] = useState<Record<
    string,
    PlayRecord
  > | null>(null);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);
  const [loadingMorePlayRecords, setLoadingMorePlayRecords] = useState(false);
  const [hasMorePlayRecords, setHasMorePlayRecords] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);
  const appendRequestRef = useRef(0);
  const firstPageLoadingRef = useRef(false);
  const deletedKeysRef = useRef<Set<string>>(new Set());
  const playRecordsRef = useRef<Record<string, PlayRecord> | null>(null);
  const lastPriorityKeysRef = useRef<string>('');

  const loadPlayRecordsPage = useCallback(
    async (append = false) => {
      const requestId = append
        ? loadRequestRef.current
        : ++loadRequestRef.current;
      const appendRequestId = append ? ++appendRequestRef.current : null;
      const isCurrentRequest = () =>
        requestId === loadRequestRef.current &&
        (!append || appendRequestId === appendRequestRef.current);
      const hasExistingRecords = Boolean(
        playRecordsRef.current &&
        Object.keys(playRecordsRef.current).length > 0,
      );

      try {
        if (append) {
          setLoadingMorePlayRecords(true);
        } else {
          firstPageLoadingRef.current = true;
          // 首屏刷新拥有新的游标基线；旧 append 即使底层请求仍挂起，也不应继续占用按钮或写回。
          appendRequestRef.current += 1;
          setLoadingMorePlayRecords(false);
          if (!hasExistingRecords) {
            // 已有首屏数据时静默刷新，避免 priority keys 到位后整行闪骨架
            setLoadingPlayRecords(true);
          }
        }

        const { getPlayRecordsPage } = await import('@/lib/db.client');
        const page = await getPlayRecordsPage({
          cursor: append ? nextCursorRef.current : null,
          includeKeys: append ? [] : priorityPlayRecordKeys,
          pageSize: PLAY_RECORDS_PAGE_SIZE,
        });

        if (!isCurrentRequest()) return;

        const pageRecords = filterDeletedRecords(
          page.records,
          deletedKeysRef.current,
        );
        setPlayRecords((currentRecords) =>
          append ? { ...(currentRecords || {}), ...pageRecords } : pageRecords,
        );
        nextCursorRef.current = page.nextCursor;
        setHasMorePlayRecords(page.hasMore);
      } catch (error) {
        if (!isCurrentRequest()) return;
        debugError('加载播放记录失败:', error);
        if (!append && !playRecordsRef.current) {
          setPlayRecords(null);
        }
      } finally {
        if (append) {
          if (isCurrentRequest()) {
            setLoadingMorePlayRecords(false);
          }
        } else if (isCurrentRequest()) {
          firstPageLoadingRef.current = false;
          setLoadingPlayRecords(false);
        }
      }
    },
    [priorityPlayRecordKeys],
  );

  useEffect(() => {
    playRecordsRef.current = playRecords;
  }, [playRecords]);

  const refreshPlayRecords = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      void (async () => {
        await loadPlayRecordsPage(false);
        await refreshWatchingUpdates();
      })();
    }, 500);
  }, [loadPlayRecordsPage, refreshWatchingUpdates]);

  const loadMorePlayRecords = useCallback(async () => {
    if (
      !hasMorePlayRecords ||
      firstPageLoadingRef.current ||
      loadingPlayRecords ||
      loadingMorePlayRecords ||
      !nextCursorRef.current
    ) {
      return;
    }

    await loadPlayRecordsPage(true);
  }, [
    hasMorePlayRecords,
    loadPlayRecordsPage,
    loadingMorePlayRecords,
    loadingPlayRecords,
  ]);

  const markPlayRecordDeleted = useCallback((key: string) => {
    deletedKeysRef.current.add(key);
    setPlayRecords((currentRecords) => {
      if (!currentRecords || !currentRecords[key]) return currentRecords;

      const nextRecords = { ...currentRecords };
      delete nextRecords[key];
      return nextRecords;
    });
  }, []);

  const markAllPlayRecordsDeleted = useCallback(() => {
    loadRequestRef.current += 1;
    appendRequestRef.current += 1;
    firstPageLoadingRef.current = false;
    deletedKeysRef.current.clear();
    playRecordsRef.current = {};
    setPlayRecords({});
    setLoadingPlayRecords(false);
    setLoadingMorePlayRecords(false);
    nextCursorRef.current = null;
    setHasMorePlayRecords(false);
  }, []);

  useEffect(() => {
    const priorityKeySignature = priorityPlayRecordKeys.join('\0');
    const isPriorityKeysChanged =
      lastPriorityKeysRef.current !== '' &&
      lastPriorityKeysRef.current !== priorityKeySignature;
    lastPriorityKeysRef.current = priorityKeySignature;

    // priority keys 变化时立即补拉，确保新更剧集出现在首屏；
    // 首次加载仍走 idle，避免抢占关键渲染
    if (isPriorityKeysChanged) {
      void loadPlayRecordsPage(false);
      return;
    }

    const cancelLoad = scheduleIdleTask(
      () => {
        void loadPlayRecordsPage(false);
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
  }, [loadPlayRecordsPage, priorityPlayRecordKeys]);

  return {
    hasMorePlayRecords,
    loadingPlayRecords,
    loadingMorePlayRecords,
    loadMorePlayRecords,
    markAllPlayRecordsDeleted,
    markPlayRecordDeleted,
    playRecords,
    refreshPlayRecords,
    setPlayRecords,
  };
}
