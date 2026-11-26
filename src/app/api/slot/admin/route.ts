/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 获取所有用户列表
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if ('response' in admin) return admin.response;

    try {
      const userList = await db.listSlotUsers();
      return NextResponse.json({
        success: true,
        users: userList,
      });
    } catch (error) {
      console.error('Failed to get user data:', error);
    }

    return NextResponse.json({
      success: true,
      users: [],
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 更新用户金币
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if ('response' in admin) return admin.response;

    const { username, coins } = await req.json();

    if (
      !username ||
      typeof username !== 'string' ||
      typeof coins !== 'number' ||
      !Number.isFinite(coins)
    ) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    // 获取用户数据
    const userData = await db.getSlotUserData(username);

    if (!userData) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 更新金币
    userData.coins = Math.min(1_000_000_000, Math.max(0, Math.floor(coins)));
    await db.setSlotUserData(username, userData, 86400 * 30);

    return NextResponse.json({
      success: true,
      user: {
        username,
        ...userData,
      },
    });
  } catch (error) {
    console.error('更新用户金币失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
