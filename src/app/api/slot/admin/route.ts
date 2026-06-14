/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// 管理员列表（可以从环境变量或配置文件读取）
const ADMIN_USERS = ['admin', 'qiuwei']; // 添加你的管理员用户名

// 用户认证中间件
async function authenticateAdmin(req: NextRequest): Promise<{ username: string | null; error?: string }> {
  const authCookie = req.cookies.get('user_auth')?.value;

  if (!authCookie) {
    return { username: null, error: '用户未登录' };
  }

  try {
    const authData = JSON.parse(decodeURIComponent(authCookie));
    if (!authData.username) {
      return { username: null, error: '无效的用户信息' };
    }

    // 检查是否为管理员
    if (!ADMIN_USERS.includes(authData.username)) {
      return { username: null, error: '无权限访问' };
    }

    return { username: authData.username };
  } catch (error) {
    console.error('解析用户认证信息失败:', error);
    return { username: null, error: '认证信息格式错误' };
  }
}

// 获取所有用户列表
export async function GET(req: NextRequest) {
  try {
    // 管理员认证
    const auth = await authenticateAdmin(req);
    if (auth.error || !auth.username) {
      return NextResponse.json({ error: auth.error || '认证失败' }, { status: 403 });
    }

    try {
      const userList = await db.listSlotUsers();
      return NextResponse.json({
        success: true,
        users: userList
      });
    } catch (error) {
      console.error('Failed to get user data:', error);
    }

    return NextResponse.json({
      success: true,
      users: []
    });

  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 更新用户金币
export async function POST(req: NextRequest) {
  try {
    // 管理员认证
    const auth = await authenticateAdmin(req);
    if (auth.error || !auth.username) {
      return NextResponse.json({ error: auth.error || '认证失败' }, { status: 403 });
    }

    const { username, coins } = await req.json();

    if (!username || coins === undefined) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    // 获取用户数据
    const userData = await db.getSlotUserData(username);

    if (!userData) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 更新金币
    userData.coins = Math.max(0, coins);
    await db.setSlotUserData(username, userData, 86400 * 30);

    return NextResponse.json({
      success: true,
      user: {
        username,
        ...userData
      }
    });

  } catch (error) {
    console.error('更新用户金币失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
