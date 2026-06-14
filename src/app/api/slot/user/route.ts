/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// 用户数据接口
interface SlotUserData {
  coins: number; // 用户金币
  totalSpins: number; // 总抽奖次数
  totalWins: number; // 总获胜次数
  biggestWin: number; // 最大单次赢取
  isBanned: boolean; // 是否被封禁
  banEndTime: number; // 封禁结束时间
  lastSpinTime: number; // 上次抽奖时间
  initialCoins: number; // 初始金币
  createdTime: number; // 账户创建时间
}

function createDefaultSlotUserData(): SlotUserData {
  const now = Date.now();
  return {
    coins: 1000, // 初始1000金币
    totalSpins: 0,
    totalWins: 0,
    biggestWin: 0,
    isBanned: false,
    banEndTime: 0,
    lastSpinTime: 0,
    initialCoins: 1000,
    createdTime: now,
  };
}

function normalizeSlotUserData(data: Partial<SlotUserData> | null): SlotUserData {
  return {
    ...createDefaultSlotUserData(),
    ...(data || {}),
  };
}

// 获取用户数据
async function getUserSlotData(userName: string): Promise<SlotUserData> {
  try {
    const data = await db.getSlotUserData(userName);
    if (data) {
      return normalizeSlotUserData(data);
    }
  } catch (error) {
    console.error('获取用户老虎机数据失败:', error);
  }

  return createDefaultSlotUserData();
}

// 保存用户数据
async function saveUserSlotData(userName: string, data: SlotUserData): Promise<void> {
  try {
    await db.setSlotUserData(userName, data, 86400 * 30); // 30天过期
  } catch (error) {
    console.error('保存用户老虎机数据失败:', error);
  }
}

// 用户认证中间件
async function authenticateUser(req: NextRequest): Promise<{ username: string | null; error?: string }> {
  const authCookie = req.cookies.get('user_auth')?.value;

  if (!authCookie) {
    return { username: null, error: '用户未登录' };
  }

  try {
    const authData = JSON.parse(decodeURIComponent(authCookie));
    if (!authData.username) {
      return { username: null, error: '无效的用户信息' };
    }
    return { username: authData.username };
  } catch (error) {
    console.error('解析用户认证信息失败:', error);
    return { username: null, error: '认证信息格式错误' };
  }
}

// 获取用户数据
export async function GET(req: NextRequest) {
  try {
    // 用户认证
    const auth = await authenticateUser(req);
    if (auth.error || !auth.username) {
      return NextResponse.json({ error: auth.error || '认证失败' }, { status: 401 });
    }

    // 获取用户数据
    const userData = await getUserSlotData(auth.username);

    // 检查并清除已过期的封禁
    if (userData.isBanned && Date.now() >= userData.banEndTime) {
      userData.isBanned = false;
      userData.banEndTime = 0;
      await saveUserSlotData(auth.username, userData);
    }

    return NextResponse.json({
      success: true,
      user: userData,
    });

  } catch (error) {
    console.error('获取老虎机用户数据异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 重置用户数据（重新开始）
export async function DELETE(req: NextRequest) {
  try {
    // 用户认证
    const auth = await authenticateUser(req);
    if (auth.error || !auth.username) {
      return NextResponse.json({ error: auth.error || '认证失败' }, { status: 401 });
    }

    // 获取请求参数
    const { initialCoins = 1000 } = await req.json().catch(() => ({}));

    if (typeof initialCoins !== 'number' || initialCoins < 0 || initialCoins > 100000) {
      return NextResponse.json({ error: '无效的初始金额，范围应为0-100000' }, { status: 400 });
    }

    // 创建新的用户数据
    const now = Date.now();
    const newUserData: SlotUserData = {
      coins: initialCoins,
      totalSpins: 0,
      totalWins: 0,
      biggestWin: 0,
      isBanned: false,
      banEndTime: 0,
      lastSpinTime: 0,
      initialCoins: initialCoins,
      createdTime: now,
    };

    // 保存新数据
    await saveUserSlotData(auth.username, newUserData);

    return NextResponse.json({
      success: true,
      message: '账户已重置',
      user: newUserData,
    });

  } catch (error) {
    console.error('重置用户数据异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 增加金币（管理员功能）
export async function PATCH(req: NextRequest) {
  try {
    // 用户认证
    const auth = await authenticateUser(req);
    if (auth.error || !auth.username) {
      return NextResponse.json({ error: auth.error || '认证失败' }, { status: 401 });
    }

    // 获取请求参数
    const { coins, reason } = await req.json();

    if (typeof coins !== 'number' || coins === 0) {
      return NextResponse.json({ error: '无效的金币数量' }, { status: 400 });
    }

    // 限制单次增减范围
    if (Math.abs(coins) > 10000) {
      return NextResponse.json({ error: '单次操作不能超过10000金币' }, { status: 400 });
    }

    // 获取当前用户数据
    const userData = await getUserSlotData(auth.username);

    // 更新金币数量
    userData.coins = Math.max(0, userData.coins + coins);

    // 保存数据
    await saveUserSlotData(auth.username, userData);

    // 记录操作日志（可选）
    console.log(`用户 ${auth.username} ${coins > 0 ? '增加' : '减少'} ${Math.abs(coins)} 金币，原因: ${reason || '管理员操作'}`);

    return NextResponse.json({
      success: true,
      message: `已${coins > 0 ? '增加' : '减少'} ${Math.abs(coins)} 金币`,
      coins: userData.coins,
      changeAmount: coins,
    });

  } catch (error) {
    console.error('修改用户金币异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
