import { headers } from 'next/headers';

import { getAuthInfoFromCookieHeader, verifyAuthInfo } from '@/lib/auth';
import { getServerInitialGuestHomeData } from '@/lib/guest-home.server';
import { getServerInitialHomeData } from '@/lib/home-data.server';
import { EMPTY_HOME_DATA } from '@/lib/home-data-types';

import GuestHome from '@/components/GuestHome';
import HomeClient from '@/components/HomeClient';

export const dynamic = 'force-dynamic';

/**
 * SSR 判断登录态：解析 user_auth（或旧名 auth）cookie 后严格验证 HMAC 签名与有效期。
 * 伪造、篡改或过期的 cookie 一律按访客渲染，防止未经认证进入登录版首屏。
 */
async function hasValidLoginCookie(
  cookieHeader: string | null,
): Promise<boolean> {
  const authInfo = getAuthInfoFromCookieHeader(cookieHeader);
  if (!authInfo) {
    return false;
  }

  const verified = await verifyAuthInfo(authInfo, process.env.PASSWORD);
  return verified !== null;
}

async function loadInitialHomeData(cookieHeader: string | null) {
  try {
    if (!cookieHeader) {
      return EMPTY_HOME_DATA;
    }

    return await getServerInitialHomeData();
  } catch (error) {
    console.error('首页首屏数据预取失败:', error);
    return EMPTY_HOME_DATA;
  }
}

async function loadInitialGuestData() {
  try {
    return await getServerInitialGuestHomeData();
  } catch (error) {
    console.error('访客首页首屏数据预取失败:', error);
    return undefined;
  }
}

export default async function Home() {
  const headerList = await headers();
  const cookieHeader = headerList.get('cookie');
  const loggedIn = await hasValidLoginCookie(cookieHeader);

  if (!loggedIn) {
    const initialGuestData = await loadInitialGuestData();
    return <GuestHome initialData={initialGuestData} />;
  }

  const initialHomeData = await loadInitialHomeData(cookieHeader);

  return <HomeClient initialHomeData={initialHomeData} />;
}
