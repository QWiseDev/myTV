import { headers } from 'next/headers';

import { getAuthInfoFromCookieHeader, verifyAuthInfo } from '@/lib/auth';
import { getServerInitialGuestHomeData } from '@/lib/guest-home.server';
import {
  getServerInitialHomeData,
  getServerInitialPlaybackData,
} from '@/lib/home-data.server';
import {
  EMPTY_HOME_DATA,
  EMPTY_INITIAL_PLAYBACK_DATA,
} from '@/lib/home-data-types';
import {
  resolveUserAccess,
  SessionRevokedError,
  UserBannedError,
  UserNotFoundError,
} from '@/lib/user-access';

import GuestHome from '@/components/GuestHome';
import HomeClient from '@/components/HomeClient';

export const dynamic = 'force-dynamic';

/**
 * SSR 判断登录态：
 * 1. 解析 user_auth（或旧名 auth）cookie 并严格验证 HMAC 签名与有效期；
 * 2. 联动 resolveUserAccess 检查用户是否已删除、封禁或改密吊销；
 * 伪造、篡改、过期、封禁或吊销会话一律按访客渲染（GuestHome 会同步清理残留 cookie）。
 */
async function resolveAuthenticatedUser(
  cookieHeader: string | null,
): Promise<{ username: string } | null> {
  const authInfo = getAuthInfoFromCookieHeader(cookieHeader);
  if (!authInfo) {
    return null;
  }

  const verified = await verifyAuthInfo(authInfo, process.env.PASSWORD);
  if (!verified) {
    return null;
  }

  try {
    await resolveUserAccess(verified.username, verified.timestamp);
  } catch (error) {
    if (
      error instanceof UserNotFoundError ||
      error instanceof UserBannedError ||
      error instanceof SessionRevokedError
    ) {
      return null;
    }
    console.warn('首页 SSR 校验用户状态异常，沿用签名结果:', error);
  }

  return { username: verified.username };
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

async function loadInitialPlaybackData(username: string) {
  try {
    return await getServerInitialPlaybackData(username);
  } catch (error) {
    console.error('首页播放记录首屏数据预取失败:', error);
    return EMPTY_INITIAL_PLAYBACK_DATA;
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
  const authenticatedUser = await resolveAuthenticatedUser(cookieHeader);

  if (!authenticatedUser) {
    const initialGuestData = await loadInitialGuestData();
    return <GuestHome initialData={initialGuestData} />;
  }

  const [initialHomeData, initialPlaybackData] = await Promise.all([
    loadInitialHomeData(cookieHeader),
    loadInitialPlaybackData(authenticatedUser.username),
  ]);

  return (
    <HomeClient
      initialHomeData={initialHomeData}
      initialPlaybackData={initialPlaybackData}
    />
  );
}
