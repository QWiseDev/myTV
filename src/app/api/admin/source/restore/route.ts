import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

import { requireAdmin } from '@/lib/admin-auth';
import { restoreVideoSources } from '@/lib/config';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, {
      ownerOnly: true,
      forbiddenMessage: '权限不足，只有站长可以执行此操作',
    });
    if ('response' in admin) return admin.response;

    const { backupFile } = await request.json();

    if (!backupFile || typeof backupFile !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少备份文件路径' },
        { status: 400 },
      );
    }

    const normalizedName = path.basename(backupFile.trim());
    if (
      !normalizedName ||
      (normalizedName !== backupFile.trim() &&
        !backupFile.trim().endsWith(`/${normalizedName}`) &&
        !backupFile.trim().endsWith(`\\${normalizedName}`)) ||
      normalizedName.includes('..') ||
      !/^[a-zA-Z0-9._-]+\.json$/.test(normalizedName)
    ) {
      return NextResponse.json(
        { success: false, error: '非法的备份文件名' },
        { status: 400 },
      );
    }

    const result = await restoreVideoSources(normalizedName);

    return NextResponse.json({
      success: true,
      restoredCount: result.restoredCount,
      message: `成功恢复 ${result.restoredCount} 个视频源`,
    });
  } catch (error) {
    console.error('恢复视频源失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '恢复视频源时发生错误: ' + (error as Error).message,
      },
      { status: 500 },
    );
  }
}
