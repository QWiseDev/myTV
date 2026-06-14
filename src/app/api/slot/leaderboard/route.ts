import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 获取排行榜
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'coins'; // coins, biggestWin, totalWins

    const users = await db.getSlotLeaderboard(type, 10);

    // 返回前10名
    return NextResponse.json({
      success: true,
      leaderboard: users.map((user) => ({
        username: user.username,
        coins: user.coins || 0,
        biggestWin: user.biggestWin || 0,
        totalWins: user.totalWins || 0,
      })),
      type,
    });

  } catch (error) {
    console.error('获取排行榜失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
