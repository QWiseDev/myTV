/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getAdminRoleFromRequest, requireAdmin } from '@/lib/admin-auth';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
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

function normalizeSlotUserData(
  data: Partial<SlotUserData> | null,
): SlotUserData {
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
async function saveUserSlotData(
  userName: string,
  data: SlotUserData,
): Promise<void> {
  try {
    await db.setSlotUserData(userName, data, 86400 * 30); // 30天过期
  } catch (error) {
    console.error('保存用户老虎机数据失败:', error);
  }
}

// 用户认证：复用统一的签名 cookie + 账号状态校验
async function authenticateUser(
  req: NextRequest,
): Promise<{ username: string | null; status?: number; error?: string }> {
  const auth = await requireUser(req);
  if (!auth.authInfo) {
    return { username: null, status: 401, error: '用户未登录' };
  }

  const guardResult = await ensureUserAccessOrResponse(
    auth.authInfo.username,
    auth.authInfo.timestamp,
  );
  if ('response' in guardResult) {
    return {
      username: null,
      status: guardResult.response.status,
      error: '账号不可用或会话已失效',
    };
  }

  return { username: auth.authInfo.username };
}

// 获取用户数据
export async function GET(req: NextRequest) {
  try {
    // 用户认证
    const auth = await authenticateUser(req);
    if (auth.error || !auth.username) {
      return NextResponse.json(
        { error: auth.error || '认证失败' },
        { status: auth.status || 401 },
      );
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
      return NextResponse.json(
        { error: auth.error || '认证失败' },
        { status: auth.status || 401 },
      );
    }

    const adminRole = await getAdminRoleFromRequest(req);
    const isAdmin = adminRole !== null;

    // 防止被封禁账号通过重置清空封禁状态
    const existingData = await getUserSlotData(auth.username);
    if (
      !isAdmin &&
      existingData.isBanned &&
      Date.now() < existingData.banEndTime
    ) {
      return NextResponse.json(
        { error: '账号处于老虎机封禁期，无法重置' },
        { status: 403 },
      );
    }

    // 获取请求参数
    const { initialCoins = 1000 } = await req.json().catch(() => ({}));
    const maxInitialCoins = isAdmin ? 100000 : 1000;

    if (
      typeof initialCoins !== 'number' ||
      !Number.isFinite(initialCoins) ||
      initialCoins < 0 ||
      initialCoins > maxInitialCoins
    ) {
      return NextResponse.json(
        { error: `无效的初始金额，范围应为0-${maxInitialCoins}` },
        { status: 400 },
      );
    }

    // 创建新的用户数据
    const now = Date.now();
    const normalizedCoins = Math.floor(initialCoins);
    const newUserData: SlotUserData = {
      coins: normalizedCoins,
      totalSpins: 0,
      totalWins: 0,
      biggestWin: 0,
      isBanned: false,
      banEndTime: 0,
      lastSpinTime: 0,
      initialCoins: normalizedCoins,
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

// 增加金币（严格限制为管理员功能）
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if ('response' in admin) return admin.response;

    // 获取请求参数
    const { coins, reason, username } = await req.json();

    if (typeof coins !== 'number' || !Number.isFinite(coins) || coins === 0) {
      return NextResponse.json({ error: '无效的金币数量' }, { status: 400 });
    }

    // 限制单次增减范围
    if (Math.abs(coins) > 10000) {
      return NextResponse.json(
        { error: '单次操作不能超过10000金币' },
        { status: 400 },
      );
    }

    const targetUsername =
      typeof username === 'string' && username.trim()
        ? username.trim()
        : admin.username;

    // 获取当前用户数据
    const userData = await getUserSlotData(targetUsername);

    // 更新金币数量
    userData.coins = Math.max(0, userData.coins + Math.floor(coins));

    // 保存数据
    await saveUserSlotData(targetUsername, userData);

    // 记录操作日志
    console.log(
      `管理员 ${admin.username} 为用户 ${targetUsername} ${coins > 0 ? '增加' : '减少'} ${Math.abs(coins)} 金币，原因: ${reason || '管理员操作'}`,
    );

    return NextResponse.json({
      success: true,
      message: `已${coins > 0 ? '增加' : '减少'} ${Math.abs(Math.floor(coins))} 金币`,
      coins: userData.coins,
      changeAmount: Math.floor(coins),
    });
  } catch (error) {
    console.error('修改用户金币异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
