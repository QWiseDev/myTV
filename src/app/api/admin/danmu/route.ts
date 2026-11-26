import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { clearConfigCache } from '@/lib/config';
import { db } from '@/lib/db';
import { resolveAndValidateRemoteUrl } from '@/lib/url-safety';

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

    const apiBaseUrl = rawApiBaseUrl.trim().replace(/\/+$/, '');
    if (apiBaseUrl) {
      try {
        const parsed = await resolveAndValidateRemoteUrl(apiBaseUrl, {
          allowHttp: true,
        });
        if (parsed.search || parsed.hash) {
          return NextResponse.json(
            { error: '弹幕 API 地址不能包含查询参数或锚点' },
            { status: 400 },
          );
        }
      } catch (validationError) {
        return NextResponse.json(
          {
            error:
              validationError instanceof Error
                ? validationError.message
                : '弹幕 API 地址格式不正确',
          },
          { status: 400 },
        );
      }
    }

    const adminConfig = admin.config;

    adminConfig.DanmuConfig = {
      apiBaseUrl,
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
