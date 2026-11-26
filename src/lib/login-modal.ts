'use client';

/**
 * 全局登录弹窗事件。
 *
 * 与 /login 页面并存：直接访问登录页时仍走完整页面，站内触发登录
 * （访客点击登录、401 会话失效等）则通过该事件弹出爱奇艺式登录弹窗。
 */
export const OPEN_LOGIN_MODAL_EVENT = 'open-login-modal';
export const AUTH_STATE_CHANGED_EVENT = 'auth-state-changed';

const AUTH_COOKIE_NAMES = ['user_auth', 'auth'] as const;

/** 触发全局登录弹窗（可在任意组件与非 React 模块中调用） */
export function openLoginModal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_LOGIN_MODAL_EVENT));
  }
}

/** 浏览器端是否存在认证 Cookie（含已失效或无法解析的残留值） */
export function hasBrowserAuthCookie(): boolean {
  if (typeof document === 'undefined' || !document.cookie) {
    return false;
  }

  return document.cookie.split(';').some((part) => {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return false;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1);
    return (
      AUTH_COOKIE_NAMES.includes(key as (typeof AUTH_COOKIE_NAMES)[number]) &&
      Boolean(value)
    );
  });
}

/** 清除浏览器端残留的登录 Cookie，并通知客户端登录态监听者同步刷新 */
export function clearBrowserAuthCookies(): void {
  if (typeof document !== 'undefined') {
    for (const name of AUTH_COOKIE_NAMES) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_STATE_CHANGED_EVENT));
  }
}
