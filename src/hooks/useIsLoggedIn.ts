'use client';

import { useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

/**
 * 客户端登录态判定：cookie 中含 username 即视为已登录。
 * 访客（未登录）据此隐藏登录专属功能（收藏/换源/网盘/追更等）。
 */
export function useIsLoggedIn(): boolean {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(Boolean(getAuthInfoFromBrowserCookie()?.username));
  }, []);

  return loggedIn;
}
