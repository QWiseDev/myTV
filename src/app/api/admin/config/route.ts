/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';
import { requireAdmin } from '@/lib/admin-auth';
import { clearConfigCache } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, {
    forbiddenMessage: '你是管理员吗你就访问？',
  });
  if ('response' in admin) return admin.response;

  try {
    const result: AdminConfigResult = {
      Role: admin.role,
      Config: admin.config,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store', // 管理员配置不缓存
      },
    });
  } catch (error) {
    console.error('获取管理员配置失败:', error);
    return NextResponse.json(
      {
        error: '获取管理员配置失败',
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, {
    ownerOnly: true,
    forbiddenMessage: '只有站长可以修改配置',
  });
  if ('response' in admin) return admin.response;

  try {
    const newConfig: AdminConfig = await request.json();

    // 保存新配置
    await db.saveAdminConfig(newConfig);

    // 清除缓存，强制下次重新从数据库读取
    clearConfigCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存管理员配置失败:', error);
    return NextResponse.json(
      {
        error: '保存配置失败',
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
