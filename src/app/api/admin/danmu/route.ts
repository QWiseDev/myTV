import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { clearConfigCache } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('response' in admin) return admin.response;

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
        const parsed = new URL(apiBaseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return NextResponse.json(
            { error: '弹幕 API 仅支持 HTTP/HTTPS 协议' },
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: '弹幕 API 地址格式不正确' },
          { status: 400 },
        );
      }
    }

    const adminConfig = admin.config;

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
