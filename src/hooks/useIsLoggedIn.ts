'use client';

import { useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { AUTH_STATE_CHANGED_EVENT } from '@/lib/login-modal';

/**
 * 客户端登录态判定：cookie 中含有效未过期的 username 即视为已登录，
 * 并响应浏览器侧登录态清理事件，防止失效 cookie 残留造成 UI 分裂。
 */
export function useIsLoggedIn(): boolean {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const syncAuthState = () => {
      setLoggedIn(Boolean(getAuthInfoFromBrowserCookie()?.username));
    };

    syncAuthState();
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);
    return () => {
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);
    };
  }, []);

  return loggedIn;
}
