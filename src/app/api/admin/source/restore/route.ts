import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { restoreVideoSources } from '@/lib/config';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export async function POST(request: NextRequest) {
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

    // 验证是否为管理员（只有站长可以恢复视频源）
    if (username !== process.env.USERNAME) {
      return NextResponse.json(
        { success: false, error: '权限不足，只有站长可以执行此操作' },
        { status: 403 }
      );
    }

    const { backupFile } = await request.json();

    if (!backupFile) {
      return NextResponse.json(
        { success: false, error: '缺少备份文件路径' },
        { status: 400 }
      );
    }

    const result = await restoreVideoSources(backupFile);

    return NextResponse.json({
      success: true,
      restoredCount: result.restoredCount,
      message: `成功恢复 ${result.restoredCount} 个视频源`,
    });
  } catch (error) {
    console.error('恢复视频源失败:', error);
    return NextResponse.json(
      { success: false, error: '恢复视频源时发生错误: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
