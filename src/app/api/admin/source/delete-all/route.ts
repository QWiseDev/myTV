import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { deleteAllVideoSources } from '@/lib/config';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, {
      ownerOnly: true,
      forbiddenMessage: '权限不足，只有站长可以执行此操作',
    });
    if ('response' in admin) return admin.response;

    const result = await deleteAllVideoSources();

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      backupFile: result.backupFile,
      message: `成功删除 ${result.deletedCount} 个视频源`,
    });
  } catch (error) {
    console.error('删除视频源失败:', error);
    return NextResponse.json(
      { success: false, error: '删除视频源时发生错误' },
      { status: 500 },
    );
  }
}
