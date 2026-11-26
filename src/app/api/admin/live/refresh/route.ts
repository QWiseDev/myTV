/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { clearConfigCache } from '@/lib/config';
import { db } from '@/lib/db';
import { refreshEnabledLiveChannels } from '@/lib/live';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if ('response' in admin) return admin.response;
    const config = admin.config;

    await refreshEnabledLiveChannels(config);
    await db.saveAdminConfig(config);
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: '直播源刷新成功',
    });
  } catch (error) {
    console.error('直播源刷新失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '刷新失败' },
      { status: 500 },
    );
  }
}
