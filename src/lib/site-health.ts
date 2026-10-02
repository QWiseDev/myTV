/**
 * 站点级搜索健康度跟踪（服务端内存态，进程内共享）
 *
 * 聚合搜索按站点并行发起，挂死站点会把整体完成时间钉在外层超时上限。
 * 这里按站点记录"最近一段时间内的连续超时"：窗口内连续超时达到阈值后
 * 将站点隔离一段时间（跨搜索词生效），期间聚合搜索直接跳过该站点；
 * 任何一次成功响应都会清零计数，隔离到期后站点重新参与搜索。
 */

/** 聚合搜索单站点的外层超时（包裹 searchFromApi 的整体耗时） */
export const SEARCH_SITE_TIMEOUT_MS = 10_000;

/** 窗口内连续超时达到该次数后隔离站点 */
const SITE_BENCH_THRESHOLD = 2;

/** 判定"连续"的超时时间窗口：距上次超时超过该窗口则重新计数 */
const SITE_BENCH_WINDOW_MS = 10 * 60 * 1000;

/** 站点隔离时长，与 search-cache 的 TTL 对齐 */
const SITE_BENCH_TTL_MS = 10 * 60 * 1000;

interface SiteSearchHealthState {
  consecutiveTimeouts: number;
  lastTimeoutAt: number;
  benchedUntil: number;
}

const siteStates = new Map<string, SiteSearchHealthState>();

function getSiteState(siteKey: string): SiteSearchHealthState {
  let state = siteStates.get(siteKey);
  if (!state) {
    state = { consecutiveTimeouts: 0, lastTimeoutAt: 0, benchedUntil: 0 };
    siteStates.set(siteKey, state);
  }
  return state;
}

export function isSiteSearchBenched(
  siteKey: string,
  now = Date.now(),
): boolean {
  const state = siteStates.get(siteKey);
  return Boolean(state && state.benchedUntil > now);
}

export function markSiteSearchTimeout(
  siteKey: string,
  now = Date.now(),
): void {
  const state = getSiteState(siteKey);
  state.consecutiveTimeouts =
    now - state.lastTimeoutAt <= SITE_BENCH_WINDOW_MS
      ? state.consecutiveTimeouts + 1
      : 1;
  state.lastTimeoutAt = now;
  if (state.consecutiveTimeouts >= SITE_BENCH_THRESHOLD) {
    state.benchedUntil = now + SITE_BENCH_TTL_MS;
  }
}

export function markSiteSearchSuccess(siteKey: string): void {
  const state = siteStates.get(siteKey);
  if (state) {
    state.consecutiveTimeouts = 0;
    state.lastTimeoutAt = 0;
    state.benchedUntil = 0;
  }
}

export function isSearchTimeoutError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'TimeoutError';
}
