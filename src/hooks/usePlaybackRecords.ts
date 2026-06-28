import { useCallback, useEffect, useRef, useState } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import type { PlayRecord } from '@/lib/types';

const PLAY_RECORDS_PAGE_SIZE = 30;
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
  const deletedKeysRef = useRef<Set<string>>(new Set());
  const playRecordsRef = useRef<Record<string, PlayRecord> | null>(null);

  const loadPlayRecordsPage = useCallback(
    async (append = false) => {
      const requestId = ++loadRequestRef.current;
      try {
        if (append) {
          setLoadingMorePlayRecords(true);
        } else {
          setLoadingPlayRecords(true);
        }

        const { getPlayRecordsPage } = await import('@/lib/db.client');
        const page = await getPlayRecordsPage({
          cursor: append ? nextCursorRef.current : null,
          includeKeys: append ? [] : priorityPlayRecordKeys,
          pageSize: PLAY_RECORDS_PAGE_SIZE,
        });

        if (requestId !== loadRequestRef.current) return;

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
        debugError('加载播放记录失败:', error);
        if (!append) {
          setPlayRecords(null);
        }
      } finally {
        if (requestId === loadRequestRef.current) {
          if (append) {
            setLoadingMorePlayRecords(false);
          } else {
            setLoadingPlayRecords(false);
          }
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
    Object.keys(playRecordsRef.current || {}).forEach((key) => {
      deletedKeysRef.current.add(key);
    });
    setPlayRecords({});
    nextCursorRef.current = null;
    setHasMorePlayRecords(false);
  }, []);

  useEffect(() => {
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
  }, [loadPlayRecordsPage]);

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
