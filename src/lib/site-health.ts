/**
 * 站点级搜索健康度与三态熔断器（服务端内存态，进程内共享）
 *
 * 状态机：
 * - closed：健康可用，按滑动窗口记录连续失败与响应耗时 EWMA；
 * - open：熔断（替补席），冷却期间直接跳过请求，避免慢源/死源拖垮聚合搜索；
 * - half_open：冷却到期，当前用户请求仍先跳过（0 等待），同时仅放行 1 路后台异步探活
 *   （并发锁防惊群，4s 超时）：
 *   - 探活成功 -> 立即恢复 closed 并重置退避等级；
 *   - 探活失败 -> 立即重回 open 并升级退避时长。
 *
 * 退避阶梯：
 * - 超时 / 5xx / 网络异常：连续 2 次触发，2m -> 10m -> 30m -> 2h（封顶）；
 * - 401/403 明确拒绝：连续 2 次触发，30m -> 2h（封顶）。
 */

/** 聚合搜索单站点的外层兜底超时（包裹 searchFromApi 的整体耗时） */
export const SEARCH_SITE_TIMEOUT_MS = 10_000;

/** 非流式整包搜索对已知慢源（EWMA 超标）的收紧超时 */
export const SEARCH_SLOW_SITE_TIMEOUT_MS = 5_000;

/** 半开后台探活的短超时 */
export const HALF_OPEN_PROBE_TIMEOUT_MS = 4_000;

/** 判定历史慢源的 EWMA 延迟阈值（ms） */
const SLOW_SITE_EWMA_THRESHOLD_MS = 4_500;

/** 窗口内连续失败达到该次数后触发熔断 */
const SITE_FAILURE_THRESHOLD = 2;

/** 判定“连续”的失败时间窗口：距上次失败超过该窗口则重新计数 */
const SITE_FAILURE_WINDOW_MS = 10 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

/** 超时 / 5xx / 网络异常的指数退避阶梯：2m -> 10m -> 30m -> 2h */
export const TRANSIENT_BACKOFF_MS = [
  2 * MINUTE_MS,
  10 * MINUTE_MS,
  30 * MINUTE_MS,
  120 * MINUTE_MS,
] as const;

/** 401/403 明确封禁的退避阶梯：30m -> 2h */
export const FORBIDDEN_BACKOFF_MS = [30 * MINUTE_MS, 120 * MINUTE_MS] as const;

export type SiteCircuitState = 'closed' | 'open' | 'half_open';

export type SiteFailureKind =
  | 'timeout'
  | 'server_error'
  | 'network_error'
  | 'forbidden';

export interface SiteHealthDecision {
  /** 是否跳过当前请求 */
  skip: boolean;
  /** 是否由本次调用方在后台触发单路异步探活 */
  shouldBackgroundProbe: boolean;
  /** 判定瞬间该站点的状态 */
  state: SiteCircuitState;
}

export interface SiteHealthSnapshot {
  key: string;
  state: SiteCircuitState;
  consecutiveFailures: number;
  benchLevel: number;
  benchedUntil: number;
  lastFailureKind: SiteFailureKind | null;
  ewmaLatencyMs: number | null;
  probeInFlight: boolean;
}

interface SiteSearchHealthState {
  consecutiveFailures: number;
  lastFailureAt: number;
  lastFailureKind: SiteFailureKind | null;
  benchLevel: number;
  benchedUntil: number;
  probeInFlight: boolean;
  ewmaLatencyMs: number | null;
}

const siteStates = new Map<string, SiteSearchHealthState>();

function getSiteState(siteKey: string): SiteSearchHealthState {
  let state = siteStates.get(siteKey);
  if (!state) {
    state = {
      consecutiveFailures: 0,
      lastFailureAt: 0,
      lastFailureKind: null,
      benchLevel: 0,
      benchedUntil: 0,
      probeInFlight: false,
      ewmaLatencyMs: null,
    };
    siteStates.set(siteKey, state);
  }
  return state;
}

function resolveBackoffDurationMs(
  kind: SiteFailureKind,
  benchLevel: number,
): number {
  const ladder =
    kind === 'forbidden' ? FORBIDDEN_BACKOFF_MS : TRANSIENT_BACKOFF_MS;
  const idx = Math.max(0, Math.min(benchLevel - 1, ladder.length - 1));
  return ladder[idx];
}

export function getSiteCircuitState(
  siteKey: string,
  now = Date.now(),
): SiteCircuitState {
  const state = siteStates.get(siteKey);
  if (!state || state.benchedUntil <= 0) {
    return 'closed';
  }
  if (now < state.benchedUntil) {
    return 'open';
  }
  return 'half_open';
}

/**
 * 判断站点是否应跳过本次搜索，并在半开到期时以单飞锁决定是否派发 1 路后台异步探活：
 * - closed：放行；
 * - open：直接跳过；
 * - half_open：当前用户请求立即跳过（0 等待），若尚未有在飞探活则置位 probeInFlight
 *   并通知调用方发起 1 路后台探活（跨不同源可完全并发，同源严格单飞防惊群）。
 */
export function shouldSkipSiteSearch(
  siteKey: string,
  now = Date.now(),
): SiteHealthDecision {
  const circuitState = getSiteCircuitState(siteKey, now);
  if (circuitState === 'closed') {
    return { skip: false, shouldBackgroundProbe: false, state: 'closed' };
  }
  if (circuitState === 'open') {
    return { skip: true, shouldBackgroundProbe: false, state: 'open' };
  }

  const state = siteStates.get(siteKey);
  if (!state) {
    return { skip: false, shouldBackgroundProbe: false, state: 'closed' };
  }
  if (state.probeInFlight) {
    return { skip: true, shouldBackgroundProbe: false, state: 'half_open' };
  }
  state.probeInFlight = true;
  return { skip: true, shouldBackgroundProbe: true, state: 'half_open' };
}

/** 兜底释放半开探活锁（防止探活异常未落到 success/failure 时永久卡死） */
export function finishSiteHealthProbe(siteKey: string): void {
  const state = siteStates.get(siteKey);
  if (state) {
    state.probeInFlight = false;
  }
}

/** 兼容旧调用方：站点当前是否处于冷却期（open） */
export function isSiteSearchBenched(
  siteKey: string,
  now = Date.now(),
): boolean {
  return getSiteCircuitState(siteKey, now) === 'open';
}

export function markSiteSearchFailure(
  siteKey: string,
  kind: SiteFailureKind = 'timeout',
  now = Date.now(),
): void {
  const state = getSiteState(siteKey);
  const prevFailureAt = state.lastFailureAt;
  const wasHalfOpen =
    state.probeInFlight ||
    (state.benchedUntil > 0 && now >= state.benchedUntil);

  state.lastFailureKind = kind;
  state.lastFailureAt = now;
  state.probeInFlight = false;

  if (wasHalfOpen) {
    // 半开探活失败：直接重新熔断并升级退避阶梯，无需再浪费 2 次请求
    state.benchLevel += 1;
    state.consecutiveFailures = Math.max(
      state.consecutiveFailures + 1,
      SITE_FAILURE_THRESHOLD,
    );
    state.benchedUntil = now + resolveBackoffDurationMs(kind, state.benchLevel);
    return;
  }

  state.consecutiveFailures =
    state.consecutiveFailures > 0 &&
    now - prevFailureAt <= SITE_FAILURE_WINDOW_MS
      ? state.consecutiveFailures + 1
      : 1;

  if (state.consecutiveFailures >= SITE_FAILURE_THRESHOLD) {
    state.benchLevel = Math.max(1, state.benchLevel + 1);
    state.benchedUntil = now + resolveBackoffDurationMs(kind, state.benchLevel);
  }
}

/** 兼容旧调用方：按超时故障记录失败 */
export function markSiteSearchTimeout(siteKey: string, now = Date.now()): void {
  markSiteSearchFailure(siteKey, 'timeout', now);
}

export function markSiteSearchSuccess(
  siteKey: string,
  latencyMs?: number,
): void {
  const state = getSiteState(siteKey);
  state.consecutiveFailures = 0;
  state.lastFailureAt = 0;
  state.lastFailureKind = null;
  state.benchLevel = 0;
  state.benchedUntil = 0;
  state.probeInFlight = false;

  if (
    typeof latencyMs === 'number' &&
    Number.isFinite(latencyMs) &&
    latencyMs >= 0
  ) {
    state.ewmaLatencyMs =
      state.ewmaLatencyMs === null
        ? latencyMs
        : Math.round(state.ewmaLatencyMs * 0.7 + latencyMs * 0.3);
  }
}

/**
 * 为非流式整包搜索计算单站点超时：
 * 对历史 EWMA 持续偏慢（>= 4.5s）的站点收紧到 5s，避免单源拖慢整包响应。
 */
export function getSiteSearchTimeoutMs(
  siteKey: string,
  baseTimeoutMs = SEARCH_SITE_TIMEOUT_MS,
): number {
  const state = siteStates.get(siteKey);
  if (
    state?.ewmaLatencyMs !== null &&
    state?.ewmaLatencyMs !== undefined &&
    state.ewmaLatencyMs >= SLOW_SITE_EWMA_THRESHOLD_MS
  ) {
    return Math.min(baseTimeoutMs, SEARCH_SLOW_SITE_TIMEOUT_MS);
  }
  return baseTimeoutMs;
}

/** 挑选第一个处于 closed 健康状态的站点（全挂时兜底返回首个站点） */
export function pickFirstHealthySite<T extends { key: string }>(
  sites: T[],
  now = Date.now(),
): T | undefined {
  if (sites.length === 0) return undefined;
  return (
    sites.find((site) => getSiteCircuitState(site.key, now) === 'closed') ??
    sites[0]
  );
}

/** 管理后台修改/启用/删除源或测试重置时清空熔断态 */
export function resetSiteHealth(siteKey?: string): void {
  if (siteKey) {
    siteStates.delete(siteKey);
  } else {
    siteStates.clear();
  }
}

/** 导出所有已观测站点的健康快照（供可观测性/管理接口使用） */
export function getSiteHealthSnapshot(now = Date.now()): SiteHealthSnapshot[] {
  const snapshots: SiteHealthSnapshot[] = [];
  siteStates.forEach((state, key) => {
    snapshots.push({
      key,
      state: getSiteCircuitState(key, now),
      consecutiveFailures: state.consecutiveFailures,
      benchLevel: state.benchLevel,
      benchedUntil: state.benchedUntil,
      lastFailureKind: state.lastFailureKind,
      ewmaLatencyMs: state.ewmaLatencyMs,
      probeInFlight: state.probeInFlight,
    });
  });
  return snapshots;
}

export function isSearchTimeoutError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'TimeoutError';
}
