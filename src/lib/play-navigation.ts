/**
 * 播放页导航与内部 URL 同步工具：
 * 1. 区分播放页内部换源/补全参数触发的 replaceState 与外部跨影片客户端导航；
 * 2. 站内点击导航离开播放页时，先同步触发进度信标保存事件再跳转，避免进度丢失。
 */

let lastInternalSyncedQuery: string | null = null;

function normalizeSearchQuery(raw: string): string {
  const trimmed = raw.startsWith('?') ? raw.slice(1) : raw;
  return new URLSearchParams(trimmed).toString();
}

/**
 * 播放页内部（搜源初始化回填、手动/自动换源）更新地址栏时调用，
 * 记录本次查询串以便路由边界区分“页内状态同步”与“外部跨片跳转”。
 */
export function replacePlayPageUrl(nextHref: string): void {
  if (typeof window === 'undefined') return;
  try {
    const parsed = new URL(nextHref, window.location.origin);
    lastInternalSyncedQuery = normalizeSearchQuery(parsed.search);
  } catch {
    lastInternalSyncedQuery = null;
  }
  window.history.replaceState({}, '', nextHref);
}

/**
 * 判断当前 useSearchParams() 变化是否由播放页自身的 replacePlayPageUrl 产生。
 */
export function isInternalPlayUrlSync(routeQuery: string): boolean {
  if (lastInternalSyncedQuery === null) return false;
  return normalizeSearchQuery(routeQuery) === lastInternalSyncedQuery;
}

export function resetInternalPlayUrlSyncForTests(): void {
  lastInternalSyncedQuery = null;
}

export function isPlayPagePath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/play');
}

export function saveProgressAndNavigate(href: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent('savePlayProgress', {
        detail: {
          action: 'manualNavigation',
          targetUrl: href,
        },
      }),
    );
  } catch (error) {
    console.warn('保存播放进度失败:', error);
  }

  window.location.href = href;
}
