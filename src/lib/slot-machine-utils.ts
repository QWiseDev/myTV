/**
 * 老虎机工具函数和配置
 */

import {
  SLOT_SYMBOLS,
  SYMBOL_IMAGES,
  WINNING_COMBINATIONS as BASE_WINNING_COMBINATIONS,
  PUNISHMENTS as BASE_PUNISHMENTS,
} from './slot-config';

// 将符号配置与图片路径合并
export const SYMBOLS = SLOT_SYMBOLS.map((symbol) => ({
  ...symbol,
  image: SYMBOL_IMAGES[symbol.id],
}));

// 前端专用的中奖组合配置（包含颜色信息）
export const WIN_COMBINATIONS = {
  // 超级大奖
  jiniTaimei: {
    ...BASE_WINNING_COMBINATIONS.jiniTaimei,
    color: 'from-purple-600 to-purple-400',
  },
  basketballAmbassador: {
    ...BASE_WINNING_COMBINATIONS.basketballAmbassador,
    color: 'from-orange-600 to-orange-400',
  },

  // 大奖（前端特有的UI组合）
  chickenNotTooBeautiful: {
    multiplier: 16,
    name: '鸡你不太美',
    color: 'from-pink-500 to-pink-400',
    symbols: ['j', 'n', 't', 'm'],
  },
  liBuLiNiKunGe: {
    multiplier: 16,
    name: '厉不厉害你坤哥',
    color: 'from-blue-500 to-blue-400',
    symbols: ['bj', 'zft', 'bdk', 'lq'],
  },

  // 特殊奖励（添加颜色信息）
  fourKun: {
    ...BASE_WINNING_COMBINATIONS.fourKun,
    color: 'from-yellow-500 to-yellow-400',
  },
  fourSame: {
    ...BASE_WINNING_COMBINATIONS.fourSame,
    color: 'from-green-500 to-green-400',
  },
  threeKun: {
    ...BASE_WINNING_COMBINATIONS.threeKun,
    color: 'from-red-500 to-red-400',
  },
  normalFourSame: {
    ...BASE_WINNING_COMBINATIONS.normalFourSame,
    color: 'from-indigo-500 to-indigo-400',
  },
  symmetric: {
    ...BASE_WINNING_COMBINATIONS.symmetric,
    color: 'from-teal-500 to-teal-400',
  },
  twoKun: {
    ...BASE_WINNING_COMBINATIONS.twoKun,
    color: 'from-amber-500 to-amber-400',
  },
  normalTwoSame: {
    ...BASE_WINNING_COMBINATIONS.normalTwoSame,
    color: 'from-gray-500 to-gray-400',
  },

  // 侯总特殊奖励（添加颜色信息）
  fourHz: {
    ...BASE_WINNING_COMBINATIONS.fourHz,
    color: 'from-red-600 to-red-400',
  },
  threeHz: {
    ...BASE_WINNING_COMBINATIONS.threeHz,
    color: 'from-orange-600 to-orange-400',
  },
  twoHz: {
    ...BASE_WINNING_COMBINATIONS.twoHz,
    color: 'from-yellow-600 to-yellow-400',
  },
};

// 律师函惩罚配置（前端使用）
export const PUNISHMENTS = BASE_PUNISHMENTS;

// 投注金额限制配置
export const BET_CONFIG = {
  MAX_BET_AMOUNT: 100000, // 最大投注金额10万（总投注：基础投注×倍率）
  DEFAULT_BET: 100, // 默认投注金额
  MAX_BASE_BET: 20000, // 最大基础投注（5倍率时刚好10万）
};

// 计算在不同倍率下允许的最大基础投注
export const getMaxBetForMultiplier = (multiplier: number): number => {
  return Math.floor(BET_CONFIG.MAX_BET_AMOUNT / multiplier);
};

// 金币格式化函数
export const formatCoins = (amount: number): string => {
  if (amount >= 1000000) {
    // 超过100万显示w单位
    return `${(amount / 10000).toFixed(1)}w`;
  } else if (amount >= 100000) {
    // 超过10万显示k单位
    return `${(amount / 1000).toFixed(1)}k`;
  } else {
    // 小于10万显示完整数字
    return amount.toLocaleString();
  }
};

// 验证投注金额
export const validateBet = (
  bet: number,
  multiplier: number
): { valid: boolean; message?: string } => {
  const actualBet = bet * multiplier;

  if (actualBet > BET_CONFIG.MAX_BET_AMOUNT) {
    const suggestion =
      bet <= BET_CONFIG.MAX_BET_AMOUNT
        ? `建议将倍率降低到 ${Math.floor(
            BET_CONFIG.MAX_BET_AMOUNT / bet
          )} 倍或以下`
        : `建议基础投注不超过 ${Math.floor(
            BET_CONFIG.MAX_BET_AMOUNT / multiplier
          )} 金币（当前倍率${multiplier}x）`;

    return {
      valid: false,
      message: `总投注金额（${bet.toLocaleString()} × ${multiplier} = ${actualBet.toLocaleString()}）超出限制，最大允许 ${BET_CONFIG.MAX_BET_AMOUNT.toLocaleString()} 金币。${suggestion}`,
    };
  }

  return { valid: true };
};

// 生成随机符号序列
export const generateRandomSequences = (count = 4, length = 30): string[][] => {
  return Array.from({ length: count }, () => {
    const sequence = [];
    for (let i = 0; i < length; i++) {
      sequence.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id);
    }
    return sequence;
  });
};

// 根据符号ID获取符号对象
export const getSymbolById = (symbolId: string) => {
  return SYMBOLS.find((s) => s.id === symbolId) || SYMBOLS[0];
};

// 将API结果转换为符号对象数组
export const convertResultsToSymbols = (results: string[]) => {
  return results.map((symbolId) => getSymbolById(symbolId));
};

// 惩罚状态类型
export interface PenaltyStatus {
  isActive: boolean;
  multiplier: number;
  remainingTime: number;
  violationCount: number;
  message: string | null;
}

// 初始惩罚状态
export const initialPenaltyStatus: PenaltyStatus = {
  isActive: false,
  multiplier: 1,
  remainingTime: 0,
  violationCount: 0,
  message: null,
};

// 幸运轮盘奖励类型
export interface LuckyWheelReward {
  type: string;
  value: number;
  name: string;
  betRefund?: number;
}

// 旋转历史记录类型
export interface SpinHistoryItem {
  symbols: string[];
  win: number;
  type: string;
}

// 排行榜项目类型
export interface LeaderboardItem {
  username: string;
  coins: number;
  biggestWin: number;
  totalWins: number;
}

// 消息类型
export interface SlotMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}
