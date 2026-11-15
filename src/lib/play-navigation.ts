/**
 * 播放页内点击导航时的统一处理：
 * 先触发一次播放进度保存事件，再临时解除 beforeunload 拦截并强制跳转，避免进度丢失。
 * 供侧边栏 / 顶栏 / 底部导航等入口复用。
 */

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

  const beforeUnloadHandler = window.onbeforeunload;
  window.onbeforeunload = null;

  setTimeout(() => {
    window.location.href = href;
    if (beforeUnloadHandler) {
      window.onbeforeunload = beforeUnloadHandler;
    }
  }, 100);
}
