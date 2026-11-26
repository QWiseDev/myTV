/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import {
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  LEGACY_AUTH_COOKIE_NAME,
  requireUser,
} from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const authInfo = auth.authInfo;

    const guardResult = await ensureUserAccessOrResponse(
      authInfo.username,
      authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const body = await request.json();
    const { newPassword, currentPassword } = body as {
      newPassword?: unknown;
      currentPassword?: unknown;
    };

    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: '新密码不得为空' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: '新密码长度至少8位' }, { status: 400 });
    }

    const username = authInfo.username;

    // 不允许站长修改密码（站长用户名等于 process.env.USERNAME）
    if (username === process.env.USERNAME) {
      return NextResponse.json(
        { error: '站长不能通过此接口修改密码' },
        { status: 403 },
      );
    }

    // 若提供了原密码则强制验证
    if (currentPassword !== undefined) {
      if (typeof currentPassword !== 'string' || !currentPassword) {
        return NextResponse.json(
          { error: '当前密码不得为空' },
          { status: 400 },
        );
      }
      const valid = await db.verifyUser(username, currentPassword);
      if (!valid) {
        return NextResponse.json({ error: '当前密码不正确' }, { status: 400 });
      }
    }

    // 修改密码并吊销改密前签发的所有历史会话 Cookie
    await db.changePassword(username, newPassword);
    const config = await getConfig();
    const targetUser = config.UserConfig.Users.find(
      (u) => u.username === username,
    );
    if (targetUser) {
      targetUser.tokenInvalidBefore = Date.now();
      await db.saveAdminConfig(config);
      clearConfigCache();
    }

    const response = NextResponse.json({ ok: true });
    const expiredOptions = getAuthCookieOptions(request, new Date(0));
    response.cookies.set(AUTH_COOKIE_NAME, '', expiredOptions);
    response.cookies.set(LEGACY_AUTH_COOKIE_NAME, '', expiredOptions);
    return response;
  } catch (error) {
    console.error('修改密码失败:', error);
    return NextResponse.json(
      {
        error: '修改密码失败',
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
