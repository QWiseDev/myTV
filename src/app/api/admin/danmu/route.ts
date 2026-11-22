import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (!auth.authInfo) return auth.response;
  const authInfo = auth.authInfo;

  try {
    const danmuConfig = await request.json();
    const rawApiBaseUrl = danmuConfig.apiBaseUrl;

    if (typeof rawApiBaseUrl !== 'string') {
      return NextResponse.json(
        { error: '弹幕 API 地址格式错误' },
        { status: 400 },
      );
    }

    const apiBaseUrl = rawApiBaseUrl.trim();
    if (apiBaseUrl) {
      try {
        new URL(apiBaseUrl);
      } catch {
        return NextResponse.json(
          { error: '弹幕 API 地址格式不正确' },
          { status: 400 },
        );
      }
    }

    const adminConfig = await getConfig();

    if (authInfo.username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === authInfo.username,
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    adminConfig.DanmuConfig = {
      apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    };

    await db.saveAdminConfig(adminConfig);
    clearConfigCache();

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('Save danmu config error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
