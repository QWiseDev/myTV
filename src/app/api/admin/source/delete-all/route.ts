import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { deleteAllVideoSources } from '@/lib/config';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export async function DELETE(request: NextRequest) {
  try {
    // 验证用户身份
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      );
    }

    const username = authInfo.username;

    // 验证是否为站长（只有站长可以删除所有视频源）
    if (username !== process.env.USERNAME) {
      return NextResponse.json(
        { success: false, error: '权限不足，只有站长可以执行此操作' },
        { status: 403 }
      );
    }

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
      { status: 500 }
    );
  }
}

