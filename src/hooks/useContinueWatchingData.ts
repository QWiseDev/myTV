import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { HOME_RENDER_LIMITS } from '@/lib/constants/home';
import type { PlayRecordsReconciliationResult } from '@/lib/db.client';
import { paginatePlayRecords } from '@/lib/play-records-pagination';
import { parseStorageKey } from '@/lib/storage-key';
import type { PlayRecord, PlayRecordsPage } from '@/lib/types';

/**
 * 继续观看分页数据与删除/清空动作：
 * - 支持 SSR initialPage 首屏零闪烁直出，跳过客户端初始瀑布；
 * - 同一会话最多一个有效页面读取（首拉 / 补拉 / append / 静默同步互斥）；
 * - 监听 playRecordsUpdated 事件与标签页切回可见（visibilitychange），保证新标签页续播、
 *   数据迁移导入、缓存刷新等外部变更实时同步到首页与轮播；
 * - 删除在 await 前注册 shield 并乐观移除；失败按 db 层权威补偿恢复或转入待核实状态；
 * - 清空期间暂停页面读取，失败用权威快照经 paginatePlayRecords 重建分页。
 */

export type PlayRecordsLoadError = 'initial' | 'refresh' | 'append' | null;

type ErrorCause =
  | 'initial'
  | 'sync'
  | 'delete-verify'
  | 'clear-verify'
  | 'append'
  | null;

const LOAD_ERROR_BY_CAUSE: Record<
  Exclude<ErrorCause, null>,
  Exclude<PlayRecordsLoadError, null>
> = {
  initial: 'initial',
  sync: 'refresh',
  'delete-verify': 'refresh',
  'clear-verify': 'refresh',
  append: 'append',
};

const SYNC_DEBOUNCE_MS = 300;
const VISIBILITY_REFRESH_MIN_HIDDEN_MS = 3_000;

interface PageState {
  records: Record<string, PlayRecord>;
  cursor: string | null;
  /** append 请求携带的固定 includeKeys 基线，由首屏建立 */
  baseIncludeKeys: string[];
  hasMore: boolean;
}

type ActiveRead = {
  kind: 'initial' | 'sync' | 'append' | 'revalidate';
  seq: number;
  promise: Promise<void>;
};

type DeleteAction = {
  token: number;
  promise: Promise<void>;
};

type ClearStatus = 'idle' | 'pending' | 'unknown';

const REFRESH_ERROR_CAUSES: Array<Exclude<ErrorCause, null>> = [
  'sync',
  'delete-verify',
  'clear-verify',
];

function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(...args);
  }
}

function reportActionError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error);
  }
}

function normalizeKeys(keys: string[]): string[] {
  return Array.from(new Set(keys)).sort();
}

function createInitialPageState(
  initialPage: PlayRecordsPage | null | undefined,
  desiredKeys: string[],
): PageState | null {
  if (!initialPage) {
    return null;
  }
  return {
    records: { ...initialPage.records },
    cursor: initialPage.nextCursor,
    baseIncludeKeys: normalizeKeys(desiredKeys),
    hasMore: initialPage.hasMore,
  };
}

export interface UseContinueWatchingDataOptions {
  /** 立即发起首拉，跳过 200ms idle 调度（用于播放页快速续播） */
  eager?: boolean;
  /** SSR 首屏直出的第一页记录，存在时首帧直接完成渲染且跳过初始网络拉取 */
  initialPage?: PlayRecordsPage | null;
}

export function useContinueWatchingData(
  ...args: [desiredKeys: string[], options?: UseContinueWatchingDataOptions]
) {
  const [desiredKeys, options] = args;
  const eager = options?.eager === true;
  const initialPage = options?.initialPage ?? null;

  const initialState = useMemo(
    () => createInitialPageState(initialPage, desiredKeys),
    // 仅挂载首帧消费 initialPage 建立基线
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---- 视图状态 ----
  const [page, setPageState] = useState<PageState | null>(initialState);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(
    initialState === null,
  );
  const [loadingMorePlayRecords, setLoadingMorePlayRecords] = useState(false);
  const [playRecordsLoadError, setPlayRecordsLoadError] =
    useState<PlayRecordsLoadError>(null);

  // ---- 同步操作状态 ----
  const pageRef = useRef<PageState | null>(initialState);
  const generationRef = useRef(0);
  const readSeqRef = useRef(0);
  const activeReadRef = useRef<ActiveRead | null>(null);
  const errorCauseRef = useRef<ErrorCause>(null);
  const desiredKeysRef = useRef<string[]>(normalizeKeys(desiredKeys));
  const shieldRef = useRef<Set<string>>(new Set());
  const deleteActionsRef = useRef<Map<string, DeleteAction>>(new Map());
  const pendingVerifyRef = useRef<Set<string>>(new Set());
  const confirmedMissingRef = useRef<Set<string>>(new Set());
  const failedSyncKeysRef = useRef<Set<string>>(new Set());
  const clearStatusRef = useRef<ClearStatus>('idle');
  const clearPromiseRef = useRef<Promise<void> | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelInitialLoadRef = useRef<(() => void) | null>(null);
  const appendPromiseRef = useRef<Promise<void> | null>(null);
  const appendWantedRef = useRef(false);
  const retryPromiseRef = useRef<Promise<void> | null>(null);
  const actionTokenRef = useRef(0);
  const hiddenSinceRef = useRef<number | null>(null);
  const dbClientPromiseRef = useRef<Promise<
    typeof import('@/lib/db.client')
  > | null>(null);
  const runSyncRef = useRef<(keys: string[]) => Promise<void>>(async () => {
    undefined;
  });

  const desiredSignature = useMemo(
    () => normalizeKeys(desiredKeys).join('\0'),
    [desiredKeys],
  );

  const getDbClient = useCallback(() => {
    if (!dbClientPromiseRef.current) {
      dbClientPromiseRef.current = import('@/lib/db.client');
    }
    return dbClientPromiseRef.current;
  }, []);

  const setPage = useCallback(
    (updater: (current: PageState | null) => PageState | null) => {
      setPageState((current) => {
        const next = updater(current);
        pageRef.current = next;
        return next;
      });
    },
    [],
  );

  const applyLoadError = useCallback((cause: ErrorCause) => {
    errorCauseRef.current = cause;
    setPlayRecordsLoadError(cause ? LOAD_ERROR_BY_CAUSE[cause] : null);
  }, []);

  const filterShieldedRecords = useCallback(
    (records: Record<string, PlayRecord>): Record<string, PlayRecord> => {
      if (shieldRef.current.size === 0) return records;
      return Object.fromEntries(
        Object.entries(records).filter(([key]) => !shieldRef.current.has(key)),
      );
    },
    [],
  );

  const cancelSyncDebounce = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = null;
    }
  }, []);

  const computeMissingKeys = useCallback((): string[] => {
    const records = pageRef.current?.records ?? {};
    return desiredKeysRef.current.filter(
      (key) =>
        !(key in records) &&
        !shieldRef.current.has(key) &&
        !confirmedMissingRef.current.has(key) &&
        !failedSyncKeysRef.current.has(key),
    );
  }, []);

  // ---- 增量补拉调度 ----
  const scheduleSync = useCallback(() => {
    if (clearStatusRef.current !== 'idle') return;
    if (pageRef.current === null) return;
    if (errorCauseRef.current === 'initial') return;
    if (computeMissingKeys().length === 0) return;
    if (activeReadRef.current) return;
    if (syncDebounceRef.current) return;

    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null;
      if (clearStatusRef.current !== 'idle') return;
      if (pageRef.current === null) return;
      if (errorCauseRef.current === 'initial') return;
      if (activeReadRef.current) return;
      const missing = computeMissingKeys();
      if (missing.length === 0) return;
      void runSyncRef.current(missing);
    }, SYNC_DEBOUNCE_MS);
  }, [computeMissingKeys]);

  // ---- 增量补拉执行 ----
  const runSync = useCallback(
    (keys: string[]): Promise<void> => {
      const capturedGeneration = generationRef.current;
      const seq = ++readSeqRef.current;
      const promise = (async () => {
        try {
          const db = await getDbClient();
          const pageResult = await db.getPlayRecordsPage({
            cursor: null,
            includeKeys: keys,
            pageSize: 1,
          });

          if (
            generationRef.current !== capturedGeneration ||
            seq !== readSeqRef.current ||
            activeReadRef.current?.seq !== seq ||
            clearStatusRef.current !== 'idle'
          ) {
            return;
          }

          const fetched = filterShieldedRecords(pageResult.records);
          const confirmedMissingKeys = keys.filter((key) => !(key in fetched));
          setPage((current) => {
            if (!current?.records) return current;
            const nextRecords = { ...current.records };
            let changed = false;
            for (const [key, record] of Object.entries(fetched)) {
              if (keys.includes(key) && !(key in nextRecords)) {
                nextRecords[key] = record;
                changed = true;
              }
            }
            return changed ? { ...current, records: nextRecords } : current;
          });
          for (const key of confirmedMissingKeys) {
            confirmedMissingRef.current.add(key);
          }
          for (const key of keys) {
            failedSyncKeysRef.current.delete(key);
          }
          if (errorCauseRef.current === 'sync') {
            applyLoadError(null);
          }
        } catch (error) {
          debugError('继续观看补拉失败:', error);
          if (
            generationRef.current !== capturedGeneration ||
            seq !== readSeqRef.current ||
            clearStatusRef.current !== 'idle'
          ) {
            return;
          }
          for (const key of keys) {
            failedSyncKeysRef.current.add(key);
          }
          applyLoadError('sync');
        } finally {
          if (activeReadRef.current?.seq === seq) {
            activeReadRef.current = null;
          }
          scheduleSync();
        }
      })();
      activeReadRef.current = { kind: 'sync', seq, promise };
      return promise;
    },
    [applyLoadError, filterShieldedRecords, getDbClient, scheduleSync, setPage],
  );
  runSyncRef.current = runSync;

  // ---- 首拉 ----
  const runInitialLoad = useCallback(
    (_trigger: 'idle' | 'retry'): Promise<void> => {
      if (clearStatusRef.current !== 'idle') return Promise.resolve();
      if (activeReadRef.current) return Promise.resolve();

      const capturedGeneration = generationRef.current;
      const seq = ++readSeqRef.current;
      const promise = (async () => {
        try {
          const db = await getDbClient();
          const includeKeys = desiredKeysRef.current;
          const pageResult = await db.getPlayRecordsPage({
            cursor: null,
            includeKeys,
            pageSize: HOME_RENDER_LIMITS.CONTINUE_WATCHING_PAGE,
          });

          if (
            generationRef.current !== capturedGeneration ||
            seq !== readSeqRef.current ||
            activeReadRef.current?.seq !== seq ||
            clearStatusRef.current !== 'idle'
          ) {
            return;
          }

          const records = filterShieldedRecords(pageResult.records);
          setPage(() => ({
            records,
            cursor: pageResult.nextCursor,
            baseIncludeKeys: includeKeys,
            hasMore: pageResult.hasMore,
          }));
          setLoadingPlayRecords(false);
          if (errorCauseRef.current === 'initial') {
            applyLoadError(null);
          }
        } catch (error) {
          debugError('加载播放记录失败:', error);
          if (
            generationRef.current !== capturedGeneration ||
            seq !== readSeqRef.current ||
            clearStatusRef.current !== 'idle'
          ) {
            return;
          }
          setLoadingPlayRecords(false);
          applyLoadError('initial');
        } finally {
          if (activeReadRef.current?.seq === seq) {
            activeReadRef.current = null;
          }
          scheduleSync();
        }
      })();
      activeReadRef.current = { kind: 'initial', seq, promise };
      return promise;
    },
    [applyLoadError, filterShieldedRecords, getDbClient, scheduleSync, setPage],
  );

  // ---- 标签页切回时的静默重验（新标签页观看后返回首页自动刷新进度，不闪骨架）----
  const runSilentRevalidate = useCallback((): Promise<void> => {
    if (clearStatusRef.current !== 'idle') return Promise.resolve();
    if (activeReadRef.current) return Promise.resolve();
    if (
      deleteActionsRef.current.size > 0 ||
      pendingVerifyRef.current.size > 0
    ) {
      return Promise.resolve();
    }
    if (pageRef.current === null) return Promise.resolve();

    const capturedGeneration = generationRef.current;
    const seq = ++readSeqRef.current;
    const promise = (async () => {
      try {
        const db = await getDbClient();
        const includeKeys = desiredKeysRef.current;
        const pageResult = await db.getPlayRecordsPage({
          cursor: null,
          includeKeys,
          pageSize: HOME_RENDER_LIMITS.CONTINUE_WATCHING_PAGE,
        });

        if (
          generationRef.current !== capturedGeneration ||
          seq !== readSeqRef.current ||
          activeReadRef.current?.seq !== seq ||
          clearStatusRef.current !== 'idle' ||
          deleteActionsRef.current.size > 0
        ) {
          return;
        }

        const freshFirstPage = filterShieldedRecords(pageResult.records);
        setPage((current) => {
          if (!current) {
            return {
              records: freshFirstPage,
              cursor: pageResult.nextCursor,
              baseIncludeKeys: includeKeys,
              hasMore: pageResult.hasMore,
            };
          }
          // 若当前只加载了首屏，直接用最新首屏替换（同步跨标签页删除/合并）；
          // 若已翻页加载过更多记录，则用最新首屏覆盖同名 key 并保留已追加的后续页记录。
          const loadedCount = Object.keys(current.records).length;
          if (loadedCount <= HOME_RENDER_LIMITS.CONTINUE_WATCHING_PAGE) {
            return {
              records: freshFirstPage,
              cursor: pageResult.nextCursor,
              baseIncludeKeys: includeKeys,
              hasMore: pageResult.hasMore,
            };
          }
          return {
            ...current,
            records: filterShieldedRecords({
              ...current.records,
              ...freshFirstPage,
            }),
          };
        });
      } catch {
        // 静默重验失败不打扰已有视图
      } finally {
        if (activeReadRef.current?.seq === seq) {
          activeReadRef.current = null;
        }
        scheduleSync();
      }
    })();
    activeReadRef.current = { kind: 'revalidate', seq, promise };
    return promise;
  }, [filterShieldedRecords, getDbClient, scheduleSync, setPage]);

  // ---- append ----
  const appendGuardFail = useCallback((): boolean => {
    if (clearStatusRef.current !== 'idle') return true;
    if (pageRef.current === null) return true;
    if (!pageRef.current.hasMore || !pageRef.current.cursor) return true;
    if (
      errorCauseRef.current === 'initial' ||
      REFRESH_ERROR_CAUSES.includes(
        errorCauseRef.current as Exclude<ErrorCause, null>,
      )
    ) {
      return true;
    }
    return false;
  }, []);

  const runAppend = useCallback((): Promise<void> => {
    const capturedGeneration = generationRef.current;
    const seq = ++readSeqRef.current;
    const self: { promise?: Promise<void> } = {};
    const promise = (async () => {
      try {
        setLoadingMorePlayRecords(true);
        const db = await getDbClient();
        const cursor = pageRef.current?.cursor ?? null;
        const includeKeys = pageRef.current?.baseIncludeKeys ?? [];
        const pageResult = await db.getPlayRecordsPage({
          cursor,
          includeKeys,
          pageSize: HOME_RENDER_LIMITS.CONTINUE_WATCHING_PAGE,
        });

        if (
          generationRef.current !== capturedGeneration ||
          seq !== readSeqRef.current ||
          activeReadRef.current?.seq !== seq ||
          clearStatusRef.current !== 'idle'
        ) {
          return;
        }

        const fetched = filterShieldedRecords(pageResult.records);
        setPage((current) => {
          if (!current?.records) return current;
          const nextRecords = { ...current.records };
          for (const [key, record] of Object.entries(fetched)) {
            if (!(key in nextRecords)) {
              nextRecords[key] = record;
            }
          }
          return {
            ...current,
            records: nextRecords,
            cursor: pageResult.nextCursor,
            hasMore: pageResult.hasMore,
          };
        });
        setLoadingMorePlayRecords(false);
        if (errorCauseRef.current === 'append') {
          applyLoadError(null);
        }
      } catch (error) {
        debugError('加载更多播放记录失败:', error);
        if (
          generationRef.current !== capturedGeneration ||
          seq !== readSeqRef.current ||
          clearStatusRef.current !== 'idle'
        ) {
          return;
        }
        setLoadingMorePlayRecords(false);
        applyLoadError('append');
      } finally {
        if (self.promise && appendPromiseRef.current === self.promise) {
          appendPromiseRef.current = null;
        }
        if (activeReadRef.current?.seq === seq) {
          activeReadRef.current = null;
        }
        scheduleSync();
      }
    })();
    self.promise = promise;
    activeReadRef.current = { kind: 'append', seq, promise };
    appendPromiseRef.current = promise;
    promise.catch(() => undefined);
    return promise;
  }, [
    applyLoadError,
    filterShieldedRecords,
    getDbClient,
    scheduleSync,
    setPage,
  ]);

  const loadMorePlayRecords = useCallback((): Promise<void> => {
    if (appendPromiseRef.current) return appendPromiseRef.current;
    if (appendGuardFail()) return Promise.resolve();

    if (activeReadRef.current) {
      if (appendWantedRef.current) return Promise.resolve();
      appendWantedRef.current = true;
      const pending = activeReadRef.current.promise.then(() => {
        appendWantedRef.current = false;
        if (appendGuardFail()) return;
        return runAppend();
      });
      pending.catch(() => undefined);
      return pending;
    }

    return runAppend();
  }, [appendGuardFail, runAppend]);

  // ---- 权威核实 ----
  const settleWithAuthoritativeSnapshot = useCallback(
    (
      records: Record<string, PlayRecord>,
      options: { rebuild: boolean },
    ): string[] => {
      const restoredKeys: string[] = [];
      const trackedKeys = new Set<string>([
        ...Array.from(deleteActionsRef.current.keys()),
        ...Array.from(pendingVerifyRef.current),
      ]);
      for (const key of Array.from(trackedKeys)) {
        if (records[key]) {
          shieldRef.current.delete(key);
          restoredKeys.push(key);
        }
      }
      deleteActionsRef.current.clear();
      pendingVerifyRef.current.clear();

      if (options.rebuild) {
        const desired = desiredKeysRef.current;
        const filtered = filterShieldedRecords(records);
        const paged = paginatePlayRecords(filtered, {
          pageSize: HOME_RENDER_LIMITS.CONTINUE_WATCHING_PAGE,
          includeKeys: desired,
        });
        setPage(() => ({
          records: paged.records,
          cursor: paged.nextCursor,
          baseIncludeKeys: desired,
          hasMore: paged.hasMore,
        }));
        setLoadingPlayRecords(false);
        setLoadingMorePlayRecords(false);
      } else {
        setPage((current) => {
          if (!current?.records) return current;
          const nextRecords = { ...current.records };
          let changed = false;
          for (const key of restoredKeys) {
            if (records[key] && !(key in nextRecords)) {
              nextRecords[key] = records[key];
              changed = true;
            }
          }
          return changed ? { ...current, records: nextRecords } : current;
        });
      }
      return restoredKeys;
    },
    [filterShieldedRecords, setPage],
  );

  const verifyAuthoritative = useCallback(async (): Promise<void> => {
    const capturedGeneration = generationRef.current;
    try {
      const db = await getDbClient();
      const snapshot = await db.reconcilePlayRecordsAuthoritative();

      if (generationRef.current !== capturedGeneration) return;
      const currentUsername = getAuthInfoFromBrowserCookie()?.username || null;
      if (snapshot.username !== currentUsername) return;

      settleWithAuthoritativeSnapshot(snapshot.records, {
        rebuild: clearStatusRef.current === 'unknown',
      });
      if (clearStatusRef.current === 'unknown') {
        clearStatusRef.current = 'idle';
      }
      if (
        errorCauseRef.current === 'delete-verify' ||
        errorCauseRef.current === 'clear-verify'
      ) {
        applyLoadError(null);
      }
      scheduleSync();
    } catch (error) {
      reportActionError('核实播放记录失败:', error);
    }
  }, [
    applyLoadError,
    getDbClient,
    scheduleSync,
    settleWithAuthoritativeSnapshot,
  ]);

  const retrySyncKeys = useCallback(async (): Promise<void> => {
    const records = pageRef.current?.records ?? {};
    const keys = Array.from(failedSyncKeysRef.current).filter(
      (key) =>
        desiredKeysRef.current.includes(key) &&
        !(key in records) &&
        !shieldRef.current.has(key),
    );
    failedSyncKeysRef.current.clear();
    if (keys.length === 0) {
      if (errorCauseRef.current === 'sync') applyLoadError(null);
      return;
    }
    await runSync(keys);
  }, [applyLoadError, runSync]);

  const retryPlayRecords = useCallback((): Promise<void> => {
    if (retryPromiseRef.current) return retryPromiseRef.current;
    if (clearStatusRef.current === 'pending') return Promise.resolve();

    const promise = (async () => {
      if (
        clearStatusRef.current === 'unknown' ||
        pendingVerifyRef.current.size > 0
      ) {
        await verifyAuthoritative();
        return;
      }
      if (errorCauseRef.current === 'sync') {
        await retrySyncKeys();
        return;
      }
      if (errorCauseRef.current === 'initial') {
        await runInitialLoad('retry');
      }
    })().finally(() => {
      if (retryPromiseRef.current === promise) {
        retryPromiseRef.current = null;
      }
    });
    retryPromiseRef.current = promise;
    promise.catch(() => undefined);
    return promise;
  }, [retrySyncKeys, runInitialLoad, verifyAuthoritative]);

  // ---- 删除 ----
  const deleteRecord = useCallback(
    (key: string): void => {
      const parsedKey = parseStorageKey(key);
      if (!parsedKey) {
        reportActionError('删除播放记录失败: 无效的记录键', key);
        return;
      }

      if (deleteActionsRef.current.has(key)) return;

      const token = ++actionTokenRef.current;
      const capturedGeneration = generationRef.current;
      shieldRef.current.add(key);
      const action: DeleteAction = { token, promise: Promise.resolve() };
      deleteActionsRef.current.set(key, action);

      setPage((current) => {
        if (!current?.records?.[key]) return current;
        const nextRecords = { ...current.records };
        delete nextRecords[key];
        return { ...current, records: nextRecords };
      });

      const markPendingVerify = () => {
        pendingVerifyRef.current.add(key);
        applyLoadError('delete-verify');
      };

      action.promise = (async () => {
        try {
          if (clearStatusRef.current === 'pending') {
            await clearPromiseRef.current;
            const statusAfterSettle = clearStatusRef.current as ClearStatus;
            if (generationRef.current !== capturedGeneration) return;
            if (statusAfterSettle === 'unknown') {
              markPendingVerify();
              return;
            }
            if (
              statusAfterSettle === 'idle' &&
              !pageRef.current?.records?.[key]
            ) {
              return;
            }
          }

          const db = await getDbClient();
          await db.deletePlayRecord(parsedKey.source, parsedKey.id);

          if (deleteActionsRef.current.get(key)?.token === token) {
            deleteActionsRef.current.delete(key);
          }
          pendingVerifyRef.current.delete(key);
        } catch (error) {
          const actionStillCurrent =
            deleteActionsRef.current.get(key)?.token === token;
          if (actionStillCurrent) {
            deleteActionsRef.current.delete(key);
          }

          if (
            !actionStillCurrent ||
            generationRef.current !== capturedGeneration ||
            clearStatusRef.current !== 'idle'
          ) {
            return;
          }

          const reconciliation = (
            error as {
              reconciliation?: PlayRecordsReconciliationResult;
            }
          )?.reconciliation;

          if (reconciliation?.kind === 'cancelled') {
            return;
          }

          if (reconciliation?.kind === 'confirmed') {
            const db = await getDbClient();
            const storeRevision = db.getPlayRecordsRevision();
            if (storeRevision !== reconciliation.revision) {
              markPendingVerify();
              return;
            }

            const currentUsername =
              getAuthInfoFromBrowserCookie()?.username || null;
            if (reconciliation.username !== currentUsername) {
              return;
            }

            const authoritativeRecord = reconciliation.records[key];
            if (authoritativeRecord) {
              shieldRef.current.delete(key);
              pendingVerifyRef.current.delete(key);
              setPage((current) => {
                if (!current?.records) return current;
                if (current.records[key]) return current;
                return {
                  ...current,
                  records: { ...current.records, [key]: authoritativeRecord },
                };
              });
            }
            return;
          }

          markPendingVerify();
          reportActionError('删除播放记录失败:', error);
        }
      })();
    },
    [applyLoadError, getDbClient, setPage],
  );

  // ---- 清空 ----
  const clearAll = useCallback((): void => {
    if (clearStatusRef.current === 'pending') return;
    clearStatusRef.current = 'pending';

    generationRef.current += 1;
    const capturedGeneration = generationRef.current;
    cancelInitialLoadRef.current?.();
    cancelInitialLoadRef.current = null;
    cancelSyncDebounce();
    activeReadRef.current = null;
    appendWantedRef.current = false;
    appendPromiseRef.current = null;

    setPage(() => ({
      records: {},
      cursor: null,
      baseIncludeKeys: [],
      hasMore: false,
    }));
    setLoadingPlayRecords(false);
    setLoadingMorePlayRecords(false);
    applyLoadError(null);

    const promise = (async () => {
      try {
        const db = await getDbClient();
        await db.clearAllPlayRecords();

        if (generationRef.current !== capturedGeneration) return;
        clearStatusRef.current = 'idle';
        shieldRef.current.clear();
        deleteActionsRef.current.clear();
        pendingVerifyRef.current.clear();
        failedSyncKeysRef.current.clear();
        confirmedMissingRef.current = new Set(desiredKeysRef.current);
      } catch (error) {
        if (generationRef.current !== capturedGeneration) return;
        const reconciliation = (
          error as { reconciliation?: PlayRecordsReconciliationResult }
        )?.reconciliation;

        if (reconciliation?.kind === 'confirmed') {
          const db = await getDbClient();
          const storeRevision = db.getPlayRecordsRevision();
          const currentUsername =
            getAuthInfoFromBrowserCookie()?.username || null;
          if (
            storeRevision === reconciliation.revision &&
            reconciliation.username === currentUsername
          ) {
            settleWithAuthoritativeSnapshot(reconciliation.records, {
              rebuild: true,
            });
            clearStatusRef.current = 'idle';
            return;
          }
          clearStatusRef.current = 'unknown';
          applyLoadError('clear-verify');
          return;
        }

        clearStatusRef.current = 'unknown';
        applyLoadError('clear-verify');
        reportActionError('清空播放记录失败:', error);
      }
    })();
    clearPromiseRef.current = promise;
    promise.catch(() => undefined);
  }, [
    applyLoadError,
    cancelSyncDebounce,
    getDbClient,
    settleWithAuthoritativeSnapshot,
    setPage,
  ]);

  // ---- desired keys 同步 ----
  useEffect(() => {
    const normalized = normalizeKeys(desiredKeys);
    desiredKeysRef.current = normalized;
    const normalizedSet = new Set(normalized);
    confirmedMissingRef.current = new Set(
      Array.from(confirmedMissingRef.current).filter((key) =>
        normalizedSet.has(key),
      ),
    );
    scheduleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredSignature, scheduleSync]);

  // ---- 监听外部 playRecordsUpdated 事件 & 标签页可见性切回同步 ----
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePlayRecordsUpdated = (event: Event) => {
      // 本 hook 自身进行中的删除/清空/待核实由队列与补偿独立结算，不走外部广播覆盖
      if (
        clearStatusRef.current !== 'idle' ||
        deleteActionsRef.current.size > 0 ||
        pendingVerifyRef.current.size > 0
      ) {
        return;
      }

      const detail = (event as CustomEvent<Record<string, PlayRecord>>).detail;
      if (!detail || typeof detail !== 'object') {
        return;
      }

      // 外部全量快照到达（如保存进度、导入数据、强制刷新缓存）：作废旧在飞读并同步分页视图
      readSeqRef.current += 1;
      activeReadRef.current = null;
      const desired = desiredKeysRef.current;
      const currentLoadedCount = Object.keys(
        pageRef.current?.records ?? {},
      ).length;
      const pageSize = Math.max(
        HOME_RENDER_LIMITS.CONTINUE_WATCHING_PAGE,
        currentLoadedCount,
      );
      const filtered = filterShieldedRecords(detail);
      const paged = paginatePlayRecords(filtered, {
        pageSize,
        includeKeys: desired,
      });

      setPage(() => ({
        records: paged.records,
        cursor: paged.nextCursor,
        baseIncludeKeys: desired,
        hasMore: paged.hasMore,
      }));
      setLoadingPlayRecords(false);
      if (errorCauseRef.current === 'initial') {
        applyLoadError(null);
      }
      scheduleSync();
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
        return;
      }
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (
        hiddenSince !== null &&
        Date.now() - hiddenSince >= VISIBILITY_REFRESH_MIN_HIDDEN_MS
      ) {
        void runSilentRevalidate();
      }
    };

    window.addEventListener('playRecordsUpdated', handlePlayRecordsUpdated);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.removeEventListener(
        'playRecordsUpdated',
        handlePlayRecordsUpdated,
      );
      if (typeof document !== 'undefined') {
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange,
        );
      }
    };
  }, [
    applyLoadError,
    filterShieldedRecords,
    runSilentRevalidate,
    scheduleSync,
    setPage,
  ]);

  // ---- 首拉调度（SSR 已提供 initialPage 时跳过首拉网络请求）----
  useEffect(() => {
    let cancelLoad: (() => void) | null = null;
    if (initialState !== null) {
      scheduleSync();
    } else if (eager) {
      void runInitialLoad('idle');
    } else {
      cancelLoad = scheduleIdleTask(
        () => {
          cancelInitialLoadRef.current = null;
          void runInitialLoad('idle');
        },
        {
          delayMs: 200,
          timeoutMs: 1000,
        },
      );
      cancelInitialLoadRef.current = cancelLoad;
    }

    return () => {
      cancelLoad?.();
      generationRef.current += 1;
      cancelSyncDebounce();
      activeReadRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playRecords = page?.records ?? null;

  return {
    hasMorePlayRecords: page?.hasMore ?? false,
    loadingPlayRecords,
    loadingMorePlayRecords,
    loadMorePlayRecords,
    playRecords,
    playRecordsLoadError,
    retryPlayRecords,
    deleteRecord,
    clearAll,
  };
}
