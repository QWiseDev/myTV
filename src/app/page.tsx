import { headers } from 'next/headers';

import { getServerInitialHomeData } from '@/lib/home-data.server';
import { EMPTY_HOME_DATA } from '@/lib/home-data-types';

import GuestHome from '@/components/GuestHome';
import HomeClient from '@/components/HomeClient';

export const dynamic = 'force-dynamic';

/**
 * SSR 判断登录态：user_auth（或旧名 auth）cookie 含 username + signature 即视为已登录。
 * 未登录渲染访客版首页（仅访客源目录，点击直达播放），不预取任何登录数据。
 */
function hasLoginCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/(?:^|;\s*)(user_auth|auth)=([^;]+)/);
  if (!match) return false;
  try {
    const decoded = decodeURIComponent(match[2]);
    const authData = JSON.parse(decoded) as {
      username?: string;
      signature?: string;
    };
    return Boolean(authData.username && authData.signature);
  } catch {
    return false;
  }
}

async function loadInitialHomeData() {
  try {
    const headerList = await headers();
    if (!headerList.get('cookie')) {
      return EMPTY_HOME_DATA;
    }

    return await getServerInitialHomeData();
  } catch (error) {
    console.error('首页首屏数据预取失败:', error);
    return EMPTY_HOME_DATA;
  }
}

export default async function Home() {
  const headerList = await headers();
  const loggedIn = hasLoginCookie(headerList.get('cookie'));

  if (!loggedIn) {
    return <GuestHome />;
  }

  const initialHomeData = await loadInitialHomeData();

  return <HomeClient initialHomeData={initialHomeData} />;
}
