import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { HOME_RENDER_LIMITS } from '@/lib/constants/home';
import type { PlayRecordsReconciliationResult } from '@/lib/db.client';
import { paginatePlayRecords } from '@/lib/play-records-pagination';
import { parseStorageKey } from '@/lib/storage-key';
import type { PlayRecord } from '@/lib/types';

/**
 * 继续观看分页数据与删除/清空动作（替代旧 usePlaybackRecords + usePlayRecordActions）。
 *
 * 并发规则（docs/continue-watching-data-layer-refactor-plan.md 第 5 节）：
 * - 同一会话最多一个有效页面读取（首拉 / 补拉 / append 互斥，后到者等待或跳过）；
 * - 首拉失败前不启动补拉；append 失败保留游标由 onLoadMore 重试；
 * - 删除在任何 await 之前注册 shield 并移除 UI；失败按 db 层补偿结果处理：
 *   confirmed 以权威记录恢复 / 保持删除，unconfirmed 标记待核实并暴露 refresh 重试；
 * - 清空期间禁止新页面读取，失败用权威快照经 paginatePlayRecords 重建分页。
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

interface PageState {
  records: Record<string, PlayRecord>;
  cursor: string | null;
  /** append 请求携带的固定 includeKeys 基线，由首拉建立 */
  baseIncludeKeys: string[];
  hasMore: boolean;
}

type ActiveRead = {
  kind: 'initial' | 'sync' | 'append';
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

export interface UseContinueWatchingDataOptions {
  /** 立即发起首拉，跳过 200ms idle 调度（用于播放页快速续播） */
  eager?: boolean;
}

export function useContinueWatchingData(
  ...args: [desiredKeys: string[], options?: UseContinueWatchingDataOptions]
) {
  const [desiredKeys, options] = args;
  const eager = options?.eager === true;
  // ---- 视图状态 ----
  const [page, setPageState] = useState<PageState | null>(null);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);
  const [loadingMorePlayRecords, setLoadingMorePlayRecords] = useState(false);
  const [playRecordsLoadError, setPlayRecordsLoadError] =
    useState<PlayRecordsLoadError>(null);

  // ---- 操作状态（同步 ref，先于 React state 提交，防止同 tick 重复操作绕过保护）----
  const pageRef = useRef<PageState | null>(null);
  const generationRef = useRef(0);
  const readSeqRef = useRef(0);
  const activeReadRef = useRef<ActiveRead | null>(null);
  const errorCauseRef = useRef<ErrorCause>(null);
  const desiredKeysRef = useRef<string[]>([]);
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
    // 复用同一加载 Promise：保证删除/清空的 db 队列入队顺序与用户调用顺序一致（方案 5.7.3）
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

  // ---- 增量补拉调度（方案 5.4）----
  const scheduleSync = useCallback(() => {
    // 清空 pending/unknown 期间不读取（方案 5.7.4）
    if (clearStatusRef.current !== 'idle') return;
    // 首屏尚未成功（含首屏错误未解决）不启动补拉：首拉先于补拉（方案 5.3 / 5.8）
    if (pageRef.current === null) return;
    if (errorCauseRef.current === 'initial') return;
    if (computeMissingKeys().length === 0) return;
    // 首拉/append/另一补拉在飞时记住需求，等待其完成后重新计算（方案 5.4.3）
    if (activeReadRef.current) return;
    if (syncDebounceRef.current) return;

    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null;
      if (clearStatusRef.current !== 'idle') return;
      if (pageRef.current === null) return;
      if (errorCauseRef.current === 'initial') return;
      if (activeReadRef.current) return;
      // 真正执行时重新计算 missing，而不是使用防抖前捕获的集合（方案 5.4.2）
      const missing = computeMissingKeys();
      if (missing.length === 0) return;
      void runSyncRef.current(missing);
    }, SYNC_DEBOUNCE_MS);
  }, [computeMissingKeys]);

  // ---- 增量补拉执行（方案 5.4）----
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
              // 只消费本次请求的 keys，且仅填补仍缺失的记录，不覆盖已有值（方案 5.4.4/5.4.5）
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
          // 读取期间到达的新 keys 在此重新计算（方案 5.4.3）
          scheduleSync();
        }
      })();
      activeReadRef.current = { kind: 'sync', seq, promise };
      return promise;
    },
    [applyLoadError, filterShieldedRecords, getDbClient, scheduleSync, setPage],
  );
  runSyncRef.current = runSync;

  // ---- 首拉（方案 5.3）----
  const runInitialLoad = useCallback(
    (trigger: 'idle' | 'retry'): Promise<void> => {
      void trigger;
      if (clearStatusRef.current !== 'idle') return Promise.resolve();
      // 同一会话最多一个有效页面读取（方案 5.3.3 / 5.4.3）
      if (activeReadRef.current) return Promise.resolve();

      const capturedGeneration = generationRef.current;
      const seq = ++readSeqRef.current;
      const promise = (async () => {
        try {
          const db = await getDbClient();
          // 发出时读取最新 desired keys（方案 5.3.2）
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
          // 首拉完成后按最新需求重新计算 missing（方案 5.3.5）
          scheduleSync();
        }
      })();
      activeReadRef.current = { kind: 'initial', seq, promise };
      return promise;
    },
    [applyLoadError, filterShieldedRecords, getDbClient, scheduleSync, setPage],
  );

  // ---- append（方案 5.5）----
  const appendGuardFail = useCallback((): boolean => {
    if (clearStatusRef.current !== 'idle') return true;
    if (pageRef.current === null) return true; // 初始页未成功
    if (!pageRef.current.hasMore || !pageRef.current.cursor) return true;
    if (
      errorCauseRef.current === 'initial' ||
      REFRESH_ERROR_CAUSES.includes(
        errorCauseRef.current as Exclude<ErrorCause, null>,
      )
    ) {
      return true; // refresh 类错误未解决时不能启动 append（方案 5.8）
    }
    return false;
  }, []);

  const runAppend = useCallback((): Promise<void> => {
    const capturedGeneration = generationRef.current;
    const seq = ++readSeqRef.current;
    const self: { promise?: Promise<void> } = {};
    const promise = (async () => {
      try {
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
            // 已存在记录保留当前值，避免追加页重复项回退较新的本地值（方案 5.5.5）
            if (!(key in nextRecords)) {
              nextRecords[key] = record;
            }
          }
          // 整页均为重复记录时仍按服务器 cursor 前进（方案 5.5.8）
          return {
            ...current,
            records: nextRecords,
            cursor: pageResult.nextCursor,
            hasMore: pageResult.hasMore,
          };
        });
        setLoadingMorePlayRecords(false);
        // 成功 append 不能清掉尚未解决的 refresh 错误（方案 5.8）
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
        // 失败保留原 cursor（page 不动），下一次 onLoadMore 重试同一页
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
    // 同步占位并返回共享 Promise，避免 loading state 尚未 commit 时重复请求（方案 5.5.1）
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
      // 其他页面读取在飞：等待完成后重新检查状态和 cursor；同一待执行 append 去重（方案 5.5.3）
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

  // ---- 权威核实（retry 共用，一次读取结算清空 + 待核实删除）----
  const settleWithAuthoritativeSnapshot = useCallback(
    (
      records: Record<string, PlayRecord>,
      options: { rebuild: boolean },
    ): string[] => {
      // 统一结算清空前的删除状态：权威快照含该 key 则恢复（撤销 shield），否则保持删除态
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
        // 用权威快照经 paginatePlayRecords 重建首屏、cursor、hasMore 与分页基线（方案 5.7.6）
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
        // 仅删除核实：恢复权威记录（存在且当前仍缺失时）
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
      // 身份复核：不对新身份应用旧会话结果（方案 5.6.9）
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
      // unknown 恢复后是否补拉由最新 missing 计算决定（方案 5.7.9）
      scheduleSync();
    } catch (error) {
      // 读取失败：保持待核实状态与 refresh 错误，不伪造服务器真值（方案 5.6.7）
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

  // ---- 重试（方案 5.8 优先级：clear 核实 → 删除核实 → 补拉 → 首屏）----
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

  // ---- 删除（方案 5.6）----
  const deleteRecord = useCallback(
    (key: string): void => {
      const parsedKey = parseStorageKey(key);
      if (!parsedKey) {
        // 非法 key：不移除 UI、不注册 shield、不请求服务器（方案 5.6.1）
        reportActionError('删除播放记录失败: 无效的记录键', key);
        return;
      }

      // 同 key pending 删除共享动作；不同 key 独立（方案 5.6.2）
      if (deleteActionsRef.current.has(key)) return;

      const token = ++actionTokenRef.current;
      const capturedGeneration = generationRef.current;
      // 在任何 await 之前注册 shield，再同步移除 UI（方案 5.6.3 / 5.2）
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
          // 清空期间收到的删除等待清空结算（方案 5.7.4）
          if (clearStatusRef.current === 'pending') {
            await clearPromiseRef.current;
            const statusAfterSettle = clearStatusRef.current as ClearStatus;
            if (generationRef.current !== capturedGeneration) return;
            if (statusAfterSettle === 'unknown') {
              // unknown 先走核实，不盲发写请求
              markPendingVerify();
              return;
            }
            if (
              statusAfterSettle === 'idle' &&
              !pageRef.current?.records?.[key]
            ) {
              // 清空成功或重建后目标记录已不存在：跳过
              return;
            }
          }

          const db = await getDbClient();
          await db.deletePlayRecord(parsedKey.source, parsedKey.id);

          // 成功：保持本会话 shield，防止较早发出的页面响应带回记录（方案 5.6.5）
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

          // 会话已被清空/卸载取代：结果无权恢复旧状态（方案 5.6.9）
          if (
            !actionStillCurrent ||
            generationRef.current !== capturedGeneration ||
            clearStatusRef.current !== 'idle'
          ) {
            return;
          }

          // 结构化读取补偿结果：db 层以 PlayRecordsMutationError 携带，
          // 这里不依赖跨模块实例的 instanceof
          const reconciliation = (
            error as {
              reconciliation?: PlayRecordsReconciliationResult;
            }
          )?.reconciliation;

          if (reconciliation?.kind === 'cancelled') {
            // 用户切换等：保持 shield，不对新身份恢复旧数据
            return;
          }

          if (reconciliation?.kind === 'confirmed') {
            // receipt 已被后续写覆盖时按 unconfirmed 处理（方案 4.5）
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
              // 服务器仍有记录：恢复权威记录并撤销 shield（方案 5.6.6）
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
            } else {
              // 服务器已实际删除：保持删除态（shield 保留）
            }
            return;
          }

          // unconfirmed（含 localStorage 模式失败）：保持 shield，标记待核实并暴露 refresh 重试
          markPendingVerify();
          reportActionError('删除播放记录失败:', error);
        }
      })();
    },
    [applyLoadError, getDbClient, setPage],
  );

  // ---- 清空（方案 5.7）----
  const clearAll = useCallback((): void => {
    if (clearStatusRef.current === 'pending') return; // 重复清空共享 Promise
    clearStatusRef.current = 'pending';

    // 同步递增 generation、取消调度、废弃旧页面请求占位（方案 5.7.1）
    generationRef.current += 1;
    // 本次清空会话的 token：快照取 bump 之后的值，用于识别后续清空/卸载取代
    const capturedGeneration = generationRef.current;
    cancelInitialLoadRef.current?.();
    cancelInitialLoadRef.current = null;
    cancelSyncDebounce();
    activeReadRef.current = null;
    appendWantedRef.current = false;
    appendPromiseRef.current = null;

    // 清空 UI；旧删除动作的 token 被此次清空取代，已入队操作继续按顺序结束（方案 5.7.2）
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
        // 当前 desired keys 视为已由清空确认覆盖，避免旧追更快照立即触发补拉（方案 5.7.5）
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
            // 权威快照重建分页并统一结算删除状态；不恢复旧本地快照或旧游标（方案 5.7.6）
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

        // unconfirmed / cancelled：未确认状态可见，普通页面读取仍暂停（方案 5.7.7）
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

  // ---- desired keys 同步（方案 5.4）----
  useEffect(() => {
    const normalized = normalizeKeys(desiredKeys);
    desiredKeysRef.current = normalized;
    // key 离开 desired 后清除“已确认缺失”标记，重新进入时重新查询（方案 5.4.7）
    const normalizedSet = new Set(normalized);
    confirmedMissingRef.current = new Set(
      Array.from(confirmedMissingRef.current).filter((key) =>
        normalizedSet.has(key),
      ),
    );
    scheduleSync();
    // 仅在 keys 集合实际变化时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredSignature, scheduleSync]);

  // ---- 首拉调度（方案 5.3.1 / 5.3.7；播放页支持 eager 立即首拉）----
  useEffect(() => {
    let cancelLoad: (() => void) | null = null;
    if (eager) {
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
      // 卸载：作废所有在飞响应、catch 与 finally（方案 5.3.7）
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
