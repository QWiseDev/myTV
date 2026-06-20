/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  checkWin,
  getRandomSymbol,
  SLOT_SYMBOLS,
} from '@/lib/slot-config';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// 速率限制配置（适中）
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分钟
const MAX_REQUESTS_PER_WINDOW = 30; // 每分钟最多30次请求（每2秒一次）
const BURST_LIMIT = 5; // 突发限制：10秒内最多5次请求
const BURST_WINDOW_MS = 10 * 1000; // 10秒突发窗口
const CLEANUP_INTERVAL_MS = 30 * 1000; // 每30秒清理一次过期记录（更频繁）

// 限速惩罚配置（更严厉）
const PENALTY_DURATION_MS = 10 * 60 * 1000; // 10分钟惩罚时长
const PENALTY_MULTIPLIER_INCREMENT = 2; // 每次限速触发增加2倍律师函概率

// 内存中的速率限制存储（生产环境建议使用Redis）
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const burstStore = new Map<string, { count: number; resetTime: number }>(); // 突发请求限制

// 限速惩罚存储（用户标识 -> { 触发次数, 惩罚开始时间, 惩罚结束时间 }）
const penaltyStore = new Map<string, { violationCount: number; penaltyStartTime: number; penaltyEndTime: number }>();
const hardBanStore = new Map<string, { endTime: number; reason: string }>(); // 硬封禁存储

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  // 清理过期的速率限制记录
  Array.from(rateLimitStore.entries()).forEach(([key, value]) => {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  });
  // 清理过期的突发限制记录
  Array.from(burstStore.entries()).forEach(([key, value]) => {
    if (now > value.resetTime) {
      burstStore.delete(key);
    }
  });
  // 清理过期的惩罚记录
  Array.from(penaltyStore.entries()).forEach(([key, penalty]) => {
    if (now > penalty.penaltyEndTime) {
      penaltyStore.delete(key);
    }
  });
  // 清理过期的硬封禁记录
  Array.from(hardBanStore.entries()).forEach(([key, ban]) => {
    if (now > ban.endTime) {
      hardBanStore.delete(key);
      console.log(`用户 ${key} 硬封禁已解除`);
    }
  });
}, CLEANUP_INTERVAL_MS);

/**
 * 检查是否被硬封禁
 */
function checkHardBan(identifier: string): { isBanned: boolean; endTime: number; reason: string } {
  const ban = hardBanStore.get(identifier);
  const now = Date.now();

  if (!ban || now > ban.endTime) {
    return { isBanned: false, endTime: 0, reason: '' };
  }

  return { isBanned: true, endTime: ban.endTime, reason: ban.reason };
}

/**
 * 处理限速违规，增加惩罚
 */
function handleRateLimitViolation(identifier: string): { isPenaltyActive: boolean; multiplier: number; remainingPenaltyTime: number; isHardBanned: boolean; banEndTime?: number; banReason?: string } {
  const now = Date.now();
  const existingPenalty = penaltyStore.get(identifier);

  if (!existingPenalty || now > existingPenalty.penaltyEndTime) {
    // 新惩罚或惩罚已过期，开始新的惩罚
    const penaltyEndTime = now + PENALTY_DURATION_MS;
    penaltyStore.set(identifier, {
      violationCount: 1,
      penaltyStartTime: now,
      penaltyEndTime
    });
    console.log(`用户 ${identifier} 首次触发限速，开始10分钟惩罚`);
    return {
      isPenaltyActive: true,
      multiplier: PENALTY_MULTIPLIER_INCREMENT + 1, // 2 + 1 = 3倍概率
      remainingPenaltyTime: PENALTY_DURATION_MS,
      isHardBanned: false
    };
  } else {
    // 惩罚期间再次违规，增加惩罚倍数
    const newViolationCount = existingPenalty.violationCount + 1;
    const penaltyEndTime = existingPenalty.penaltyEndTime; // 保持原有结束时间
    const remainingTime = penaltyEndTime - now;

    penaltyStore.set(identifier, {
      violationCount: newViolationCount,
      penaltyStartTime: existingPenalty.penaltyStartTime,
      penaltyEndTime
    });

    const multiplier = PENALTY_MULTIPLIER_INCREMENT * newViolationCount + 1;
    console.log(`用户 ${identifier} 惩罚期间再次违规！第 ${newViolationCount} 次违规，律师函概率 ${multiplier} 倍`);

    return {
      isPenaltyActive: true,
      multiplier,
      remainingPenaltyTime: remainingTime,
      isHardBanned: false
    };
  }
}

/**
 * 获取用户惩罚状态
 */
function getUserPenaltyStatus(identifier: string): { isActive: boolean; multiplier: number; remainingTime: number; violationCount: number } {
  const penalty = penaltyStore.get(identifier);
  const now = Date.now();

  if (!penalty || now > penalty.penaltyEndTime) {
    return { isActive: false, multiplier: 1, remainingTime: 0, violationCount: 0 };
  }

  const multiplier = PENALTY_MULTIPLIER_INCREMENT * penalty.violationCount + 1;
  const remainingTime = penalty.penaltyEndTime - now;

  return {
    isActive: true,
    multiplier,
    remainingTime,
    violationCount: penalty.violationCount
  };
}

/**
 * 突发速率限制检查（防止短时间大量请求）
 */
function checkBurstLimit(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = burstStore.get(identifier);

  if (!record || now > record.resetTime) {
    // 新窗口或已过期
    const resetTime = now + BURST_WINDOW_MS;
    burstStore.set(identifier, { count: 1, resetTime });
    return { allowed: true, remaining: BURST_LIMIT - 1, resetTime };
  }

  if (record.count >= BURST_LIMIT) {
    // 超过突发限制
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  // 增加计数
  record.count++;
  return {
    allowed: true,
    remaining: BURST_LIMIT - record.count,
    resetTime: record.resetTime
  };
}

/**
 * 速率限制中间件
 */
function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetTime) {
    // 新窗口或已过期
    const resetTime = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(identifier, { count: 1, resetTime });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetTime };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    // 超过限制
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  // 增加计数
  record.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - record.count,
    resetTime: record.resetTime
  };
}

// 使用共享的符号配置
const SYMBOLS = SLOT_SYMBOLS;

// 用户数据接口
interface SlotUserData {
  coins: number; // 用户金币
  totalSpins: number; // 总抽奖次数
  totalWins: number; // 总获胜次数
  biggestWin: number; // 最大单次赢取
  lastSpinTime: number; // 上次抽奖时间
  loseStreak: number; // 连续未中奖次数
  chestCount: number; // 宝箱数量
  specialSymbols: string[]; // 特殊符号（wild, bomb, coin_rain）
}

function createDefaultSlotUserData(): SlotUserData {
  return {
    coins: 10000, // 初始10000金币
    totalSpins: 0,
    totalWins: 0,
    biggestWin: 0,
    lastSpinTime: 0,
    loseStreak: 0,
    chestCount: 0,
    specialSymbols: [],
  };
}

function normalizeSlotUserData(data: Partial<SlotUserData> | null): SlotUserData {
  const specialSymbols = data?.specialSymbols;
  return {
    ...createDefaultSlotUserData(),
    ...(data || {}),
    specialSymbols: Array.isArray(specialSymbols) ? specialSymbols : [],
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
    console.log(`Saved slot data for user: ${userName}`);
  } catch (error) {
    console.error('保存用户老虎机数据失败:', error);
  }
}

// 使用共享的动态权重计算函数和符号生成函数

// 生成4个老虎机结果
function generateSlotResults(betAmount: number, userData: SlotUserData, penaltyMultiplier = 1): string[] {
  const results = [];
  for (let i = 0; i < 4; i++) {
    const symbol = getRandomSymbol(SYMBOLS, userData.coins);
    // 5%概率生成特殊符号
    if (Math.random() < 0.05 && userData.specialSymbols?.length > 0) {
      const specialIdx = Math.floor(Math.random() * userData.specialSymbols.length);
      results.push(userData.specialSymbols[specialIdx]);
    } else {
      results.push(symbol);
    }
  }

  // 动态惩罚概率：基础10%，最大投注(100)时20%，然后应用惩罚倍数
  const basePunishmentChance = 0.1;
  const maxBet = 100;
  const maxPunishmentChance = 0.2;

  // 根据投注金额计算基础惩罚概率
  let punishmentChance = Math.min(
    basePunishmentChance +
    ((betAmount - 10) / (maxBet - 10)) * (maxPunishmentChance - basePunishmentChance),
    maxPunishmentChance
  );

  // 应用惩罚倍数
  punishmentChance = Math.min(punishmentChance * penaltyMultiplier, 0.95); // 最高95%概率

  console.log(`惩罚概率计算: 基础${(punishmentChance / penaltyMultiplier * 100).toFixed(1)}%, 倍数${penaltyMultiplier}x, 最终${(punishmentChance * 100).toFixed(1)}%`);

  // 应用惩罚概率调整
  if (Math.random() < punishmentChance) {
    // 强制生成惩罚组合
    const punishments = [
      ['lawyer'],                    // 1律师函
      ['lawyer', 'lawyer'],          // 2律师函
      ['lawyer', 'lawyer', 'lawyer'], // 3律师函
    ];

    // 根据投注金额选择惩罚（投注越大，惩罚越重）
    const selectedPunishment = punishments[Math.floor(Math.random() * Math.min(punishments.length, Math.ceil(betAmount / 50)))];

    // 将惩罚符号插入结果
    for (let i = 0; i < selectedPunishment.length && i < 4; i++) {
      results[i] = selectedPunishment[i];
    }

    // 填充剩余位置
    for (let i = selectedPunishment.length; i < 4; i++) {
      results[i] = getRandomSymbol(SYMBOLS, userData.coins);
    }
  }

  return results;
}

// 幸运轮盘奖励
function spinLuckyWheel(betAmount: number): { type: string; value: number; name: string; betRefund?: number } {
  const rewards = [
    { type: 'coins', value: 50, weight: 30, name: '50金币' },
    { type: 'coins', value: 100, weight: 25, name: '100金币' },
    { type: 'coins', value: 500, weight: 15, name: '500金币' },
    { type: 'coins', value: 1000, weight: 5, name: '1000金币' },
    { type: 'chest', value: 1, weight: 20, name: '1个宝箱' },
    { type: 'chest', value: 3, weight: 5, name: '3个宝箱' },
  ];

  const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;

  for (const reward of rewards) {
    random -= reward.weight;
    if (random <= 0) {
      return {
        ...reward,
        betRefund: betAmount // 返回当前投注金额作为免费奖励
      };
    }
  }

  return {
    ...rewards[0],
    betRefund: betAmount // 返回当前投注金额作为免费奖励
  };
}

// 使用共享的checkWin函数

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

export async function POST(req: NextRequest) {
  try {
    // ===== 用户认证优先 =====
    const auth = await authenticateUser(req);
    if (auth.error || !auth.username) {
      return NextResponse.json(
        { error: auth.error || '认证失败' },
        { status: 401 }
      );
    }

    // ===== 已认证用户的速率限制检查 =====
    const identifier = `user:${auth.username}`;

    // 首先检查硬封禁
    const hardBanResult = checkHardBan(identifier);
    if (hardBanResult.isBanned) {
      const retryAfter = Math.ceil((hardBanResult.endTime - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({
          error: '由于严重违规，您的访问已被暂时限制',
          code: 'HARD_BAN',
          reason: hardBanResult.reason,
          retryAfter,
          banEndTime: hardBanResult.endTime,
          remainingTime: retryAfter
        }),
        {
          status: 403,
          headers: {
            'Retry-After': retryAfter.toString(),
            'Content-Type': 'application/json',
            'X-Ban-Reason': hardBanResult.reason,
            'X-Ban-End-Time': new Date(hardBanResult.endTime).toISOString()
          }
        }
      );
    }

    // 检查突发限制（10秒内最多5次请求）
    const burstResult = checkBurstLimit(identifier);
    if (!burstResult.allowed) {
      const retryAfter = Math.ceil((burstResult.resetTime - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          code: 'BURST_LIMIT_EXCEEDED',
          message: '短时间内的请求次数过多，请等待片刻后再试',
          retryAfter
        }),
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'Content-Type': 'application/json',
            'X-Burst-Limit': BURST_LIMIT.toString(),
            'X-Burst-Window': BURST_WINDOW_MS.toString()
          }
        }
      );
    }

    // 常规速率限制检查
    const rateLimitResult = checkRateLimit(identifier);

    // 添加速率限制响应头
    const headers = new Headers();
    headers.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
    headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());
    headers.set('X-Burst-Limit', BURST_LIMIT.toString());
    headers.set('X-Burst-Remaining', burstResult.remaining.toString());

    if (!rateLimitResult.allowed) {
      // 处理限速违规，增加惩罚
      const penaltyResult = handleRateLimitViolation(identifier);
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);

      // 如果触发硬封禁，返回硬封禁响应
      if (penaltyResult.isHardBanned) {
        return new NextResponse(
          JSON.stringify({
            error: '由于严重违规，您的访问已被暂时限制',
            code: 'HARD_BAN',
            reason: penaltyResult.banReason,
            retryAfter,
            banEndTime: penaltyResult.banEndTime,
            remainingTime: retryAfter
          }),
          {
            status: 403,
            headers: {
              'Retry-After': retryAfter.toString(),
              'Content-Type': 'application/json',
              'X-Ban-Reason': penaltyResult.banReason || '',
              'X-Ban-End-Time': penaltyResult.banEndTime ? new Date(penaltyResult.banEndTime).toISOString() : ''
            }
          }
        );
      }

      // 否则返回普通惩罚响应
      return new NextResponse(
        JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter,
          penalty: {
            isActive: penaltyResult.isPenaltyActive,
            multiplier: penaltyResult.multiplier,
            remainingPenaltyTime: penaltyResult.remainingPenaltyTime,
            message: `惩罚已激活！律师函概率增加${penaltyResult.multiplier}倍，持续10分钟！`
          }
        }),
        {
          status: 429,
          headers: {
            ...Object.fromEntries(headers.entries()),
            'Retry-After': retryAfter.toString(),
            'Content-Type': 'application/json',
            'X-Penalty-Active': penaltyResult.isPenaltyActive.toString(),
            'X-Penalty-Multiplier': penaltyResult.multiplier.toString(),
            'X-Penalty-Remaining-Time': penaltyResult.remainingPenaltyTime.toString()
          }
        }
      );
    }

    // 从请求中获取投注金额和倍率
    const { betAmount = 10, multiplier = 1 } = await req.json().catch(() => ({ betAmount: 10, multiplier: 1 }));

    // 验证投注金额格式和范围
    if (!Number.isInteger(betAmount) || betAmount < 1) {
      return NextResponse.json({
        error: '投注金额必须是正整数',
        received: betAmount
      }, { status: 400 });
    }

    // 验证倍率格式和范围
    if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 5) {
      return NextResponse.json({
        error: '倍率必须是1-5之间的整数',
        received: multiplier
      }, { status: 400 });
    }

    // 计算实际投注金额（基础投注 × 倍率）
    const actualBetAmount = betAmount * multiplier;

    // 限制最大实际投注金额为10万金币
    const MAX_BET_AMOUNT = 100000;
    if (actualBetAmount > MAX_BET_AMOUNT) {
      return NextResponse.json({
        error: `总投注金额（基础投注×倍率）超出限制，最大允许投注 ${MAX_BET_AMOUNT.toLocaleString()} 金币`,
        baseBetAmount: betAmount,
        multiplier: multiplier,
        totalBetAmount: actualBetAmount,
        maxAllowed: MAX_BET_AMOUNT,
        suggestion: betAmount <= MAX_BET_AMOUNT
          ? `建议将倍率降低到 ${Math.floor(MAX_BET_AMOUNT / betAmount)} 倍或以下`
          : `建议基础投注不超过 ${Math.floor(MAX_BET_AMOUNT / multiplier)} 金币`
      }, { status: 400 });
    }

    // 获取用户数据
    const userData = await getUserSlotData(auth.username);

    // 检查金币余额（使用实际投注金额）
    if (userData.coins < actualBetAmount) {
      return NextResponse.json({
        error: '金币不足，无法进行抽奖',
        coins: userData.coins,
        required: actualBetAmount,
        baseBetAmount: betAmount,
        multiplier: multiplier
      }, { status: 400 });
    }

    // 检查用户惩罚状态
    const penaltyStatus = getUserPenaltyStatus(identifier);
    console.log(`用户 ${identifier} 惩罚状态:`, penaltyStatus);

    // 生成抽奖结果（应用惩罚倍数，使用实际投注金额）
    const results = generateSlotResults(actualBetAmount, userData, penaltyStatus.multiplier);
    const result = checkWin(results);

    // 计算金币变化（基于实际投注金额）
    let coinChange = 0;

    if (result.type === 'win') {
      // 中奖：扣除实际投注 + 奖励（奖励基于实际投注）
      coinChange = -actualBetAmount + (result.multiplier * actualBetAmount);
    } else if (result.type === 'punishment') {
      // 惩罚：multiplier是负数，表示要扣除的倍数
      // 例如 multiplier: -1 表示扣除1倍实际投注金额
      coinChange = -(Math.abs(result.multiplier) * actualBetAmount);
    } else {
      // 未中奖：只扣除实际投注
      coinChange = -actualBetAmount;
    }

    // 更新用户数据
    userData.coins = Math.max(0, userData.coins + coinChange);

    // 为了前端显示，计算等效的winAmount
    let winAmount = 0;
    if (result.type === 'win') {
      winAmount = result.multiplier * betAmount;
    } else if (result.type === 'punishment') {
      winAmount = 0; // 惩罚时winAmount设为0，实际扣除通过coinChange体现
    }
    userData.totalSpins++;
    userData.lastSpinTime = Date.now();

    // 宝箱系统：每10次旋转获得1个宝箱
    let chestEarned = 0;
    if (userData.totalSpins % 10 === 0) {
      userData.chestCount++;
      chestEarned = 1;
    }

    // 幸运轮盘：连续3次未中奖触发
    let luckyWheelReward = null;
    if (result.type === 'win') {
      userData.totalWins++;
      userData.biggestWin = Math.max(userData.biggestWin, winAmount);
      userData.loseStreak = 0;
    } else {
      userData.loseStreak++;
      if (userData.loseStreak >= 3) {
        luckyWheelReward = spinLuckyWheel(actualBetAmount);
        if (luckyWheelReward.type === 'coins') {
          userData.coins += luckyWheelReward.value;
        } else if (luckyWheelReward.type === 'chest') {
          userData.chestCount += luckyWheelReward.value;
        }
        // 返回当前投注金额作为免费奖励
        if (luckyWheelReward.betRefund) {
          userData.coins += luckyWheelReward.betRefund;
        }
        userData.loseStreak = 0;
      }
    }

    // 保存用户数据
    await saveUserSlotData(auth.username, userData);

    // 返回结果
    return NextResponse.json(
      {
        success: true,
        results,
        result: {
          type: result.type,
          name: result.name,
          multiplier: result.multiplier,
          winAmount: winAmount > 0 ? winAmount : 0,
          betAmount: result.type === 'punishment' ? Math.abs(coinChange) : actualBetAmount,
          coinChange: coinChange,
          baseBetAmount: betAmount,
          userMultiplier: multiplier, // 用户选择的倍率
        },
        user: {
          coins: userData.coins,
          totalSpins: userData.totalSpins,
          totalWins: userData.totalWins,
          biggestWin: userData.biggestWin,
          loseStreak: userData.loseStreak,
          chestCount: userData.chestCount,
        },
        luckyWheel: luckyWheelReward,
        chestEarned,
        penalty: {
          isActive: penaltyStatus.isActive,
          multiplier: penaltyStatus.multiplier,
          remainingTime: penaltyStatus.remainingTime,
          violationCount: penaltyStatus.violationCount,
          message: penaltyStatus.isActive ?
            `⚠️ 惩罚激活中！律师函概率增加${penaltyStatus.multiplier}倍！剩余时间：${Math.ceil(penaltyStatus.remainingTime / 1000 / 60)}分钟` :
            null
        }
      },
      {
        headers: {
          ...Object.fromEntries(headers.entries()),
          'X-Penalty-Active': penaltyStatus.isActive.toString(),
          'X-Penalty-Multiplier': penaltyStatus.multiplier.toString(),
          'X-Penalty-Remaining-Time': penaltyStatus.remainingTime.toString()
        }
      }
    );

  } catch (error) {
    console.error('老虎机抽奖异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// 获取用户数据API
export async function GET(req: NextRequest) {
  try {
    // ===== 用户认证优先 =====
    const auth = await authenticateUser(req);
    if (auth.error || !auth.username) {
      return NextResponse.json(
        { error: auth.error || '认证失败' },
        { status: 401 }
      );
    }

    // ===== 已认证用户的速率限制检查 =====
    const identifier = `user:${auth.username}:GET`;
    const rateLimitResult = checkRateLimit(identifier);

    const headers = new Headers();
    headers.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
    headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter
        }),
        {
          status: 429,
          headers: {
            ...Object.fromEntries(headers.entries()),
            'Retry-After': retryAfter.toString(),
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // 获取用户数据
    const userData = await getUserSlotData(auth.username);

    return NextResponse.json(
      {
        success: true,
        user: userData,
      },
      { headers }
    );

  } catch (error) {
    console.error('获取老虎机用户数据异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
