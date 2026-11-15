'use client';

import { getAuthInfoFromBrowserCookie } from '../../auth';
import type { PlayRecord } from '../../types';

/**
 * 播放记录客户端存储层。
 *
 * 职责边界（不 import cache-manager / core / events，不做 HTTP，不处理 React）：
 * - 每用户一份完整快照（full snapshot），严格区分“完整快照”与 cold；
 *   分页结果永远不会写入快照。
 * - revision 门禁：写任务入队/结算、权威提交、失效维护都会推进 revision，
 *   普通读取提交前必须校验 revision 与 pending 写。
 * - 每用户一条写队列：预读、乐观写、HTTP、补偿都在同一个任务内串行执行。
 * - 普通快照读取按 用户 + revision 去重，旧 revision 的在飞请求不会被复用。
 */

// 快照有效期与旧缓存层保持一致（追更检查间隔 5 分钟）
export const PLAY_RECORDS_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

const ANONYMOUS_PLAY_RECORDS_USER = '__anonymous__';

export interface PlayRecordsFullSnapshot {
  data: Record<string, PlayRecord>;
  expiresAt: number;
}

export type SnapshotCommitResult =
  | 'committed' // 已写入快照（数据与提交时快照不同），调用方需要派发事件
  | 'unchanged' // 与提交时快照一致，仅延长有效期，不派发事件
  | 'stale'; // revision / pending 门禁失败，不写缓存

export interface AuthoredSnapshotRead {
  data: Record<string, PlayRecord>;
  revision: number;
  username: string | null;
}

interface UserStoreState {
  revision: number;
  snapshot: PlayRecordsFullSnapshot | null;
  queueTail: Promise<void>;
  pendingMutations: number;
  readInFlight: {
    revision: number;
    promise: Promise<AuthoredSnapshotRead>;
  } | null;
}

const userStores = new Map<string, UserStoreState>();

export function getPlayRecordsUserKey(username: string | null): string {
  return username || ANONYMOUS_PLAY_RECORDS_USER;
}

export function getCurrentPlayRecordsUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return getAuthInfoFromBrowserCookie()?.username || null;
}

function getUserState(username: string | null): UserStoreState {
  const userKey = getPlayRecordsUserKey(username);
  let state = userStores.get(userKey);
  if (!state) {
    state = {
      revision: 0,
      snapshot: null,
      queueTail: Promise.resolve(),
      pendingMutations: 0,
      readInFlight: null,
    };
    userStores.set(userKey, state);
  }
  return state;
}

export function getPlayRecordsStoreRevision(username: string | null): number {
  return getUserState(username).revision;
}

export function getPlayRecordsPendingMutations(
  username: string | null,
): number {
  return getUserState(username).pendingMutations;
}

export function getPlayRecordsQueueTail(
  username: string | null,
): Promise<void> {
  return getUserState(username).queueTail;
}

/** 读取快照（不限时效）；null 表示 cold */
export function peekPlayRecordsSnapshot(
  username: string | null,
): PlayRecordsFullSnapshot | null {
  return getUserState(username).snapshot;
}

/** 读取仍在有效期内的完整快照；过期等价于对外不可命中 */
export function getValidPlayRecordsSnapshot(
  username: string | null,
): PlayRecordsFullSnapshot | null {
  const snapshot = getUserState(username).snapshot;
  if (!snapshot) return null;
  return Date.now() < snapshot.expiresAt ? snapshot : null;
}

export function hasValidPlayRecordsSnapshot(username: string | null): boolean {
  return getValidPlayRecordsSnapshot(username) !== null;
}

function writeSnapshot(
  state: UserStoreState,
  data: Record<string, PlayRecord>,
): void {
  // 不可变更新：派发出去的快照对象之后不会被原地修改（不变量 8）
  state.snapshot = {
    data,
    expiresAt: Date.now() + PLAY_RECORDS_SNAPSHOT_TTL_MS,
  };
}

function sameSnapshotData(
  state: UserStoreState,
  data: Record<string, PlayRecord>,
): boolean {
  const current = state.snapshot;
  if (!current) return false;
  return JSON.stringify(current.data) === JSON.stringify(data);
}

/**
 * 权威提交（写队列任务内部独占使用）：
 * 仅校验数据是否与当前快照一致，不受 revision / pending 门禁限制。
 * 实际写入时推进 revision，使此前发起的普通读取失效。
 */
export function commitAuthoritativePlayRecords(
  username: string | null,
  data: Record<string, PlayRecord>,
): 'committed' | 'unchanged' {
  const state = getUserState(username);
  if (sameSnapshotData(state, data)) {
    // 相同结果只延长有效期，不重复派发事件（不变量 6）
    if (state.snapshot) {
      state.snapshot = {
        data: state.snapshot.data,
        expiresAt: Date.now() + PLAY_RECORDS_SNAPSHOT_TTL_MS,
      };
    }
    return 'unchanged';
  }
  writeSnapshot(state, data);
  state.revision += 1;
  return 'committed';
}

/**
 * 普通读取（后台同步 / 全量刷新）的提交门禁：
 * 发起时记录的 revision 仍相同、没有 pending 写（不变量 4/5）。
 * 数据与提交时快照比较（不变量 6），一致只续期。
 */
export function commitExternalPlayRecordsRead(
  username: string | null,
  revision: number,
  data: Record<string, PlayRecord>,
): SnapshotCommitResult {
  const state = getUserState(username);
  if (state.revision !== revision || state.pendingMutations > 0) {
    return 'stale';
  }
  if (sameSnapshotData(state, data)) {
    if (state.snapshot) {
      state.snapshot = {
        data: state.snapshot.data,
        expiresAt: Date.now() + PLAY_RECORDS_SNAPSHOT_TTL_MS,
      };
    }
    return 'unchanged';
  }
  writeSnapshot(state, data);
  state.revision += 1;
  return 'committed';
}

export interface OptimisticMutationResult {
  previous: PlayRecordsFullSnapshot;
  next: PlayRecordsFullSnapshot;
}

/**
 * 乐观更新：仅当存在有效完整快照时执行（cold 不升级，不变量 7）。
 * 返回 null 表示未应用；应用后返回前/后快照，调用方负责派发事件。
 */
export function applyOptimisticPlayRecordsMutation(
  username: string | null,
  update: (records: Record<string, PlayRecord>) => void,
): OptimisticMutationResult | null {
  const state = getUserState(username);
  const valid = getValidPlayRecordsSnapshot(username);
  if (!valid) return null;

  const previous: PlayRecordsFullSnapshot = {
    data: valid.data,
    expiresAt: valid.expiresAt,
  };
  const nextData = { ...valid.data };
  update(nextData);
  const next: PlayRecordsFullSnapshot = {
    data: nextData,
    expiresAt: Date.now() + PLAY_RECORDS_SNAPSHOT_TTL_MS,
  };
  state.snapshot = next;
  return { previous, next };
}

/**
 * ignored 保存等场景恢复先前的完整快照（清空失败补偿使用权威提交，不走这里）。
 */
export function restorePlayRecordsSnapshot(
  username: string | null,
  previous: PlayRecordsFullSnapshot,
): void {
  const state = getUserState(username);
  state.snapshot = {
    data: previous.data,
    expiresAt: Date.now() + PLAY_RECORDS_SNAPSHOT_TTL_MS,
  };
}

/**
 * 清空的乐观提交：无条件建立完整空快照（与旧行为一致），返回被覆盖的快照。
 */
export function commitOptimisticPlayRecordsClear(
  username: string | null,
): PlayRecordsFullSnapshot | null {
  const state = getUserState(username);
  const previous = state.snapshot;
  state.snapshot = {
    data: {},
    expiresAt: Date.now() + PLAY_RECORDS_SNAPSHOT_TTL_MS,
  };
  return previous
    ? { data: previous.data, expiresAt: previous.expiresAt }
    : null;
}

/**
 * 使快照过期并推进 revision（forceRefresh 语义）：阻止旧读取重新缓存，
 * 但保留数据（过期快照仍是完整数据，只是对外不可命中，不变量说明见文件头）。
 */
export function invalidatePlayRecordsSnapshot(username: string | null): void {
  const state = getUserState(username);
  if (state.snapshot) {
    state.snapshot = {
      data: state.snapshot.data,
      expiresAt: 0,
    };
  }
  state.revision += 1;
  state.readInFlight = null;
}

/**
 * 彻底丢弃快照（clearUserCache 语义）：同时使在飞读取失效，不能只删数据对象（不变量 10）。
 */
export function dropPlayRecordsSnapshot(username: string | null): void {
  const state = getUserState(username);
  state.snapshot = null;
  state.revision += 1;
  state.readInFlight = null;
}

/**
 * 按用户 + revision 去重的普通快照读取。
 * 旧 revision 的在飞 Promise 不会被复用（不变量 5），也不会被新请求的 finally 清掉（不变量 9）。
 */
export function getOrCreatePlayRecordsRead(
  username: string | null,
  factory: () => Promise<Record<string, PlayRecord>>,
): Promise<AuthoredSnapshotRead> {
  const state = getUserState(username);
  if (state.readInFlight && state.readInFlight.revision === state.revision) {
    return state.readInFlight.promise;
  }

  const revision = state.revision;
  const promise = factory().then((data) => ({
    data,
    revision,
    username,
  }));
  const tracked = promise.finally(() => {
    if (
      state.readInFlight &&
      state.readInFlight.revision === revision &&
      state.readInFlight.promise === tracked
    ) {
      state.readInFlight = null;
    }
  });
  state.readInFlight = { revision, promise: tracked };
  return tracked;
}

export type MutationReconciliation =
  | {
      kind: 'confirmed';
      username: string | null;
      revision: number;
      records: Record<string, PlayRecord>;
    }
  | { kind: 'unconfirmed' }
  | { kind: 'cancelled' };

/**
 * 结构化写失败：公共 API 仍保持 Promise<void> 签名，错误对象携带补偿结果
 * 供新 hook 判断 UI（confirmed / unconfirmed / cancelled）。
 * revision 在任务结算时（finally）回填为结算后的版本。
 */
export class PlayRecordsMutationError extends Error {
  readonly reconciliation: MutationReconciliation;
  readonly originalError?: unknown;

  constructor(
    message: string,
    reconciliation: MutationReconciliation,
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'PlayRecordsMutationError';
    this.reconciliation = reconciliation;
    this.originalError = originalError;
  }
}

/**
 * 写任务入队：同步注册 pending 并推进 revision（含排队任务口径，不变量 3），
 * 任务结算 finally 再推进 revision 并注销 pending。
 * confirmed 补偿结果的 revision 在结算时回填，保证代表结算后的版本。
 */
export function enqueuePlayRecordsMutation<T>(
  username: string | null,
  task: () => Promise<T>,
): Promise<T> {
  const state = getUserState(username);
  state.pendingMutations += 1;
  state.revision += 1;

  const exec = async (): Promise<T> => {
    let failure: PlayRecordsMutationError | undefined;
    try {
      return await task();
    } catch (error) {
      if (error instanceof PlayRecordsMutationError) {
        failure = error;
      }
      throw error;
    } finally {
      state.revision += 1;
      state.pendingMutations -= 1;
      if (failure && failure.reconciliation.kind === 'confirmed') {
        failure.reconciliation.revision = state.revision;
      }
    }
  };

  const tracked = state.queueTail.then(exec);
  state.queueTail = tracked.then(
    () => undefined,
    () => undefined,
  );
  return tracked;
}

/**
 * 手工 retry 的权威读取：排到写队列之后执行，不重复发送写请求。
 * 任务内部直接抛错，由调用方消费。
 */
export function enqueuePlayRecordsRead<T>(
  username: string | null,
  task: () => Promise<T>,
): Promise<T> {
  return enqueuePlayRecordsMutation(username, task);
}
