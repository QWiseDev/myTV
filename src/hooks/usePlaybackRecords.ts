import { useCallback, useEffect, useRef, useState } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import type { PlayRecord } from '@/lib/types';

// 首页继续观看首屏可见量有限，配合「加载更多」降低首包与渲染成本
const PLAY_RECORDS_PAGE_SIZE = 12;
const EMPTY_PRIORITY_PLAY_RECORD_KEYS: string[] = [];

export type PlayRecordsLoadError = 'initial' | 'refresh' | 'append' | null;
type PlayRecordsLoadMode = 'replace' | 'append' | 'priority';

interface PlayRecordsClearMutation {
  commit: () => void;
  rollback: () => void;
}

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

function mergePriorityKeys(current: string[], incoming: string[]): string[] {
  return Array.from(new Set([...current, ...incoming])).sort();
}

export function usePlaybackRecords(
  priorityPlayRecordKeys: string[] = EMPTY_PRIORITY_PLAY_RECORD_KEYS,
) {
  const [playRecords, setPlayRecords] = useState<Record<
    string,
    PlayRecord
  > | null>(null);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);
  const [loadingMorePlayRecords, setLoadingMorePlayRecords] = useState(false);
  const [hasMorePlayRecords, setHasMorePlayRecords] = useState(false);
  const [playRecordsLoadError, setPlayRecordsLoadError] =
    useState<PlayRecordsLoadError>(null);
  const nextCursorRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);
  const appendRequestRef = useRef(0);
  const priorityRefreshRequestRef = useRef(0);
  const appendLoadPromiseRef = useRef<Promise<void> | null>(null);
  const retryLoadPromiseRef = useRef<Promise<void> | null>(null);
  const firstPageLoadingRef = useRef(false);
  const activeClearMutationRef = useRef<number | null>(null);
  const clearMutationIdRef = useRef(0);
  const priorityIntentRevisionRef = useRef(0);
  const pendingPriorityRefreshRef = useRef(false);
  const deletedKeysRef = useRef<Set<string>>(new Set());
  const playRecordsRef = useRef<Record<string, PlayRecord> | null>(null);
  const lastPriorityKeySignatureRef = useRef<string | null>(null);
  const sessionPriorityKeysRef = useRef<string[]>([]);
  const normalizedPriorityPlayRecordKeys = Array.from(
    new Set(priorityPlayRecordKeys),
  ).sort();
  const priorityKeySignature = normalizedPriorityPlayRecordKeys.join('\0');
  const priorityPlayRecordKeysRef = useRef(normalizedPriorityPlayRecordKeys);
  priorityPlayRecordKeysRef.current = normalizedPriorityPlayRecordKeys;

  const loadPlayRecordsPage = useCallback(
    async (mode: PlayRecordsLoadMode = 'replace') => {
      if (activeClearMutationRef.current !== null) return;

      const append = mode === 'append';
      const priority = mode === 'priority';
      const replace = mode === 'replace';
      if (priority) {
        pendingPriorityRefreshRef.current = true;
      }
      const priorityIntentRevision =
        priority || replace ? priorityIntentRevisionRef.current : null;
      const requestId = replace
        ? ++loadRequestRef.current
        : loadRequestRef.current;
      if (replace) {
        priorityRefreshRequestRef.current += 1;
      }
      const appendRequestId = append ? ++appendRequestRef.current : null;
      const priorityRequestId = priority
        ? ++priorityRefreshRequestRef.current
        : null;
      const isCurrentRequest = () =>
        requestId === loadRequestRef.current &&
        (!append || appendRequestId === appendRequestRef.current) &&
        (!priority || priorityRequestId === priorityRefreshRequestRef.current);
      const loadErrorStage: Exclude<PlayRecordsLoadError, null> = append
        ? 'append'
        : priority
          ? 'refresh'
          : playRecordsRef.current === null
            ? 'initial'
            : 'refresh';
      const hasExistingRecords = Boolean(
        playRecordsRef.current &&
        Object.keys(playRecordsRef.current).length > 0,
      );

      try {
        if (append) {
          setLoadingMorePlayRecords(true);
        } else if (replace) {
          firstPageLoadingRef.current = true;
          // 首屏刷新拥有新的游标基线；旧 append 即使底层请求仍挂起，也不应继续占用按钮或写回。
          appendRequestRef.current += 1;
          appendLoadPromiseRef.current = null;
          setLoadingMorePlayRecords(false);
          if (!hasExistingRecords) {
            // 已有首屏数据时静默刷新，避免 priority keys 到位后整行闪骨架
            setLoadingPlayRecords(true);
          }
        }

        const requestPriorityKeys = replace
          ? priorityPlayRecordKeysRef.current
          : priority
            ? mergePriorityKeys(
                sessionPriorityKeysRef.current,
                priorityPlayRecordKeysRef.current,
              )
            : sessionPriorityKeysRef.current;

        const { getPlayRecordsPage } = await import('@/lib/db.client');
        const page = await getPlayRecordsPage({
          cursor: append ? nextCursorRef.current : null,
          includeKeys: requestPriorityKeys,
          pageSize: PLAY_RECORDS_PAGE_SIZE,
        });

        if (!isCurrentRequest()) return;

        const pageRecords = filterDeletedRecords(
          page.records,
          deletedKeysRef.current,
        );
        if (replace) {
          sessionPriorityKeysRef.current = requestPriorityKeys;
        } else if (priority) {
          sessionPriorityKeysRef.current = mergePriorityKeys(
            sessionPriorityKeysRef.current,
            requestPriorityKeys,
          );
        }
        setPlayRecords((currentRecords) => {
          const nextRecords = replace
            ? pageRecords
            : { ...(currentRecords || {}), ...pageRecords };
          playRecordsRef.current = nextRecords;
          return nextRecords;
        });
        if (!priority) {
          nextCursorRef.current = page.nextCursor;
          setHasMorePlayRecords(page.hasMore);
        }
        setPlayRecordsLoadError((currentError) => {
          if (append && currentError !== 'append') return currentError;
          if (priority && currentError !== 'refresh') return currentError;
          return null;
        });
      } catch (error) {
        if (!isCurrentRequest()) return;
        debugError('加载播放记录失败:', error);
        setPlayRecordsLoadError((currentError) =>
          append && currentError === 'refresh' ? currentError : loadErrorStage,
        );
      } finally {
        const isCurrent = isCurrentRequest();
        if (append) {
          if (isCurrent) {
            setLoadingMorePlayRecords(false);
          }
        } else if (replace && isCurrent) {
          firstPageLoadingRef.current = false;
          setLoadingPlayRecords(false);
        }
        if (
          (priority || replace) &&
          isCurrent &&
          priorityIntentRevision === priorityIntentRevisionRef.current
        ) {
          pendingPriorityRefreshRef.current = false;
        }
      }
    },
    [],
  );

  useEffect(() => {
    playRecordsRef.current = playRecords;
  }, [playRecords]);

  const loadMorePlayRecords = useCallback((): Promise<void> => {
    if (appendLoadPromiseRef.current) {
      return appendLoadPromiseRef.current;
    }

    if (
      !hasMorePlayRecords ||
      activeClearMutationRef.current !== null ||
      firstPageLoadingRef.current ||
      loadingPlayRecords ||
      loadingMorePlayRecords ||
      playRecordsLoadError === 'refresh' ||
      !nextCursorRef.current
    ) {
      return Promise.resolve();
    }

    const appendPromise = loadPlayRecordsPage('append');
    appendLoadPromiseRef.current = appendPromise;

    return appendPromise.finally(() => {
      if (appendLoadPromiseRef.current === appendPromise) {
        appendLoadPromiseRef.current = null;
      }
    });
  }, [
    hasMorePlayRecords,
    loadPlayRecordsPage,
    loadingMorePlayRecords,
    loadingPlayRecords,
    playRecordsLoadError,
  ]);

  const retryPlayRecords = useCallback((): Promise<void> => {
    if (retryLoadPromiseRef.current) {
      return retryLoadPromiseRef.current;
    }

    const retryMode: PlayRecordsLoadMode =
      playRecordsLoadError === 'refresh' && playRecordsRef.current !== null
        ? 'priority'
        : 'replace';
    const retryPromise = loadPlayRecordsPage(retryMode);
    retryLoadPromiseRef.current = retryPromise;

    return retryPromise.finally(() => {
      if (retryLoadPromiseRef.current === retryPromise) {
        retryLoadPromiseRef.current = null;
      }
    });
  }, [loadPlayRecordsPage, playRecordsLoadError]);

  const markPlayRecordDeleted = useCallback((key: string) => {
    const alreadyDeleted = deletedKeysRef.current.has(key);
    const deletedRecord = playRecordsRef.current?.[key];
    deletedKeysRef.current.add(key);
    setPlayRecords((currentRecords) => {
      if (!currentRecords || !currentRecords[key]) return currentRecords;

      const nextRecords = { ...currentRecords };
      delete nextRecords[key];
      playRecordsRef.current = nextRecords;
      return nextRecords;
    });

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (!alreadyDeleted) {
        deletedKeysRef.current.delete(key);
      }
      if (!deletedRecord) return;

      setPlayRecords((currentRecords) => {
        if (currentRecords?.[key]) return currentRecords;

        const nextRecords = {
          ...(currentRecords || {}),
          [key]: deletedRecord,
        };
        playRecordsRef.current = nextRecords;
        return nextRecords;
      });
    };
  }, []);

  const markAllPlayRecordsDeleted =
    useCallback((): PlayRecordsClearMutation => {
      const mutationId = ++clearMutationIdRef.current;
      const previousRecords = playRecordsRef.current
        ? { ...playRecordsRef.current }
        : playRecordsRef.current;
      const previousDeletedKeys = new Set(deletedKeysRef.current);
      const previousNextCursor = nextCursorRef.current;
      const previousPriorityKeys = [...sessionPriorityKeysRef.current];
      const previousHasMore = hasMorePlayRecords;
      const previousLoadError = playRecordsLoadError;
      activeClearMutationRef.current = mutationId;
      loadRequestRef.current += 1;
      appendRequestRef.current += 1;
      priorityRefreshRequestRef.current += 1;
      appendLoadPromiseRef.current = null;
      retryLoadPromiseRef.current = null;
      firstPageLoadingRef.current = false;
      deletedKeysRef.current.clear();
      playRecordsRef.current = {};
      setPlayRecords({});
      setLoadingPlayRecords(false);
      setLoadingMorePlayRecords(false);
      nextCursorRef.current = null;
      sessionPriorityKeysRef.current = [];
      setHasMorePlayRecords(false);
      setPlayRecordsLoadError(null);

      const finish = (restore: boolean) => {
        if (activeClearMutationRef.current !== mutationId) return;
        activeClearMutationRef.current = null;
        if (!restore) {
          pendingPriorityRefreshRef.current = false;
          return;
        }

        deletedKeysRef.current = new Set(previousDeletedKeys);
        playRecordsRef.current = previousRecords;
        nextCursorRef.current = previousNextCursor;
        sessionPriorityKeysRef.current = previousPriorityKeys;
        setPlayRecords(previousRecords);
        setLoadingPlayRecords(false);
        setLoadingMorePlayRecords(false);
        setHasMorePlayRecords(previousHasMore);
        setPlayRecordsLoadError(previousLoadError);
        if (pendingPriorityRefreshRef.current) {
          lastPriorityKeySignatureRef.current =
            priorityPlayRecordKeysRef.current.join('\0');
          void loadPlayRecordsPage('priority');
        }
      };

      return {
        commit: () => finish(false),
        rollback: () => finish(true),
      };
    }, [hasMorePlayRecords, loadPlayRecordsPage, playRecordsLoadError]);

  useEffect(() => {
    const isInitialLoad = lastPriorityKeySignatureRef.current === null;
    const isPriorityKeysChanged =
      !isInitialLoad &&
      lastPriorityKeySignatureRef.current !== priorityKeySignature;
    if (isPriorityKeysChanged) {
      priorityIntentRevisionRef.current += 1;
      pendingPriorityRefreshRef.current = true;
    }
    if (isPriorityKeysChanged && activeClearMutationRef.current !== null) {
      return;
    }
    lastPriorityKeySignatureRef.current = priorityKeySignature;

    // priority keys 变化时立即补拉，确保新更剧集出现在首屏；
    // 首次加载仍走 idle，避免抢占关键渲染
    if (isPriorityKeysChanged) {
      if (playRecordsRef.current === null) {
        void loadPlayRecordsPage('replace');
        return;
      }

      const appendPromise = appendLoadPromiseRef.current;
      if (!appendPromise) {
        void loadPlayRecordsPage('priority');
        return;
      }

      let cancelled = false;
      const generation = loadRequestRef.current;
      void appendPromise.finally(() => {
        if (!cancelled && loadRequestRef.current === generation) {
          void loadPlayRecordsPage('priority');
        }
      });

      return () => {
        cancelled = true;
      };
    }

    const cancelLoad = scheduleIdleTask(
      () => {
        void loadPlayRecordsPage('replace');
      },
      {
        delayMs: 200,
        timeoutMs: 1000,
      },
    );

    return () => {
      cancelLoad();
    };
  }, [loadPlayRecordsPage, priorityKeySignature]);

  return {
    hasMorePlayRecords,
    loadingPlayRecords,
    loadingMorePlayRecords,
    loadMorePlayRecords,
    markAllPlayRecordsDeleted,
    markPlayRecordDeleted,
    playRecords,
    playRecordsLoadError,
    retryPlayRecords,
    setPlayRecords,
  };
}
