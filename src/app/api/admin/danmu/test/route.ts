import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminConfig = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === authInfo.username,
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const { apiBaseUrl } = await request.json();
    if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.trim()) {
      return NextResponse.json(
        { error: '请先填写弹幕 API 地址' },
        { status: 400 },
      );
    }

    const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
    try {
      new URL(normalizedBaseUrl);
    } catch {
      return NextResponse.json(
        { error: '弹幕 API 地址格式不正确' },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${normalizedBaseUrl}/api/config`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `弹幕 API 连接失败: HTTP ${response.status}` },
          { status: 400 },
        );
      }

      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: '弹幕 API 连接正常',
        version: data?.version,
        repository: data?.repository,
        hasAdminToken: data?.hasAdminToken,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? '弹幕 API 连接超时'
        : error instanceof Error
          ? error.message
          : '弹幕 API 连接测试失败';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
