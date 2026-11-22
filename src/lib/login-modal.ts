'use client';

/**
 * 全局登录弹窗事件。
 *
 * 与 /login 页面并存：直接访问登录页时仍走完整页面，站内触发登录
 * （访客点击登录、401 会话失效等）则通过该事件弹出爱奇艺式登录弹窗。
 */
export const OPEN_LOGIN_MODAL_EVENT = 'open-login-modal';

/** 触发全局登录弹窗（可在任意组件与非 React 模块中调用） */
export function openLoginModal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_LOGIN_MODAL_EVENT));
  }
}
