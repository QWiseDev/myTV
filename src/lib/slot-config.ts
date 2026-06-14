/**
 * 老虎机共享配置文件
 * 统一前端和后端的概率、符号和奖励配置
 */

// 基础符号配置
export const SLOT_SYMBOLS = [
  { id: 'j', name: '姬', weight: 140, value: 10, rarity: 'common' },
  { id: 'n', name: '霓', weight: 140, value: 15, rarity: 'common' },
  { id: 't', name: '太', weight: 140, value: 15, rarity: 'common' },
  { id: 'm', name: '美', weight: 140, value: 20, rarity: 'common' }, // man作为坤坤
  { id: 'zft', name: '中分头', weight: 80, value: 25, rarity: 'uncommon' },
  { id: 'lq', name: '篮球', weight: 70, value: 30, rarity: 'uncommon' },
  { id: 'bj', name: '中分头', weight: 100, value: 35, rarity: 'rare' },
  { id: 'bdk', name: '背带裤', weight: 90, value: 40, rarity: 'rare' },
  { id: 'lawyer', name: '律师函', weight: 30, value: -20, rarity: 'danger', dynamic: true }, // 惩罚符号 (动态调整)
  { id: 'xq', name: '徐棋', weight: 10, value: 100, rarity: 'legendary' }, // 隐藏卡
  // 小米汽车惩罚牌 - 多种变体 (基础概率，动态调整)
  { id: 'mi_car', name: '小米汽车', weight: 25, value: -20, rarity: 'danger', dynamic: true, variant: '标准版' },
  { id: 'mi_car_fire1', name: '小米汽车起火', weight: 20, value: -25, rarity: 'danger', dynamic: true, variant: '起火版1' },
  { id: 'mi_car_fire2', name: '小米汽车起火', weight: 20, value: -25, rarity: 'danger', dynamic: true, variant: '起火版2' },
  { id: 'mi_car_logo', name: '小米', weight: 15, value: -15, rarity: 'danger', dynamic: true, variant: 'Logo' },
  { id: 'mi_car_model', name: '小米汽车', weight: 20, value: -20, rarity: 'danger', dynamic: true, variant: '模型' },
  // 侯总隐藏卡 - 多种变体 (基础概率，动态调整)
  { id: 'hz', name: '侯总', weight: 10, value: 150, rarity: 'legendary', special: true, variant: '当权', dynamic: true },
  { id: 'hz2', name: '侯总', weight: 10, value: 150, rarity: 'legendary', special: true, variant: '开蚌', dynamic: true },
  { id: 'hz3', name: '侯总', weight: 10, value: 150, rarity: 'legendary', special: true, variant: '蝙蝠侠', dynamic: true },
  { id: 'hz4', name: '侯总', weight: 10, value: 150, rarity: 'legendary', special: true, variant: '望远镜', dynamic: true },
];

// 中奖组合配置
export const WINNING_COMBINATIONS = {
  // 超级大奖
  jiniTaimei: { multiplier: 128, name: '姬霓太美', pattern: ['j', 'n', 't', 'm'] },
  basketballAmbassador: { multiplier: 128, name: '篮球大使', pattern: ['bj', 'zft', 'bdk', 'lq'] },

  // 大奖
  fourKun: { multiplier: 50, name: '4坤', symbols: ['m'], count: 4, independent: true },
  fourSame: { multiplier: 32, name: '4🐔', count: 4, freeSpin: true },
  threeKun: { multiplier: 18, name: '3坤', symbols: ['m'], count: 3 },
  normalFourSame: { multiplier: 8, name: '普通3🐔', count: 4 },
  symmetric: { multiplier: 10, name: '🔄 对称奖励(ABBA)' },
  twoKun: { multiplier: 10, name: '2坤', symbols: ['m'], count: 2, combinable: true },
  normalTwoSame: { multiplier: 4, name: '普通双🐔', count: 2 },

  // 侯总特殊奖励 - 支持所有变体
  fourHz: { multiplier: 200, name: '4侯总', symbols: ['hz', 'hz2', 'hz3', 'hz4'], count: 4, independent: true, specialVideo: true },
  threeHz: { multiplier: 100, name: '3侯总', symbols: ['hz', 'hz2', 'hz3', 'hz4'], count: 3, specialVideo: true },
  twoHz: { multiplier: 50, name: '2侯总', symbols: ['hz', 'hz2', 'hz3', 'hz4'], count: 2, specialVideo: true, jackpotDouble: true },
};

// 惩罚组合配置
export const PUNISHMENTS = {
  oneLawyer: { multiplier: -1, name: '1个律师函', penalty: 1 },
  twoLawyers: { multiplier: -2, name: '2个律师函', penalty: 2 },
  threeLawyers: { multiplier: -3, name: '3个律师函', penalty: 3, ban: 2 },
  fourLawyers: { multiplier: -4, name: '4个律师函', penalty: 4, ban: 5 },
};

// 动态权重调整配置
export const DYNAMIC_WEIGHT_CONFIG = {
  relief: {
    threshold: 1000000, // 100w金币以下
    multiplier: 5,      // 侯总概率提高5倍
    symbols: ['hz', 'hz2', 'hz3', 'hz4'],
    penaltyMultiplier: 0.2, // 惩罚牌概率降低到20%
    penaltySymbols: ['lawyer', 'mi_car', 'mi_car_fire1', 'mi_car_fire2', 'mi_car_logo', 'mi_car_model']
  },
  balance: {
    threshold: 10000000, // 1000w金币以上
    multiplier: 2,       // 律师函和小米汽车概率提高2倍
    symbols: ['lawyer', 'mi_car', 'mi_car_fire1', 'mi_car_fire2', 'mi_car_logo', 'mi_car_model']
  },
  superPenalty: {
    threshold: 100000000, // 1亿金币以上
    multiplier: 3,       // 小米汽车概率提高3倍，更容易触发超级惩罚
    symbols: ['mi_car', 'mi_car_fire1', 'mi_car_fire2', 'mi_car_logo', 'mi_car_model'],
    lawyerMultiplier: 1.5, // 律师函概率也适当提高
    lawyerSymbols: ['lawyer']
  }
};

// 动态权重计算函数
export function getDynamicSymbols(symbols: any[], userCoins: number) {
  return symbols.map(symbol => {
    let adjustedWeight = symbol.weight;

    if (symbol.dynamic) {
      // 救济模式：侯总概率提高5倍，惩罚牌概率降低到20%
      if (userCoins < DYNAMIC_WEIGHT_CONFIG.relief.threshold) {
        if (DYNAMIC_WEIGHT_CONFIG.relief.symbols.includes(symbol.id)) {
          adjustedWeight = symbol.weight * DYNAMIC_WEIGHT_CONFIG.relief.multiplier;
        } else if (DYNAMIC_WEIGHT_CONFIG.relief.penaltySymbols.includes(symbol.id)) {
          adjustedWeight = symbol.weight * DYNAMIC_WEIGHT_CONFIG.relief.penaltyMultiplier;
        }
      }

      // 平衡模式：律师函和小米汽车概率提高2倍
      if (userCoins >= DYNAMIC_WEIGHT_CONFIG.balance.threshold &&
          userCoins < DYNAMIC_WEIGHT_CONFIG.superPenalty.threshold &&
          DYNAMIC_WEIGHT_CONFIG.balance.symbols.includes(symbol.id)) {
        adjustedWeight = symbol.weight * DYNAMIC_WEIGHT_CONFIG.balance.multiplier;
      }

      // 超级惩罚模式：1亿金币以上，大幅提高小米汽车概率，适度提高律师函概率
      if (userCoins >= DYNAMIC_WEIGHT_CONFIG.superPenalty.threshold) {
        if (DYNAMIC_WEIGHT_CONFIG.superPenalty.symbols.includes(symbol.id)) {
          // 小米汽车概率提高3倍，更容易触发超级惩罚模式
          adjustedWeight = symbol.weight * DYNAMIC_WEIGHT_CONFIG.superPenalty.multiplier;
        } else if (DYNAMIC_WEIGHT_CONFIG.superPenalty.lawyerSymbols.includes(symbol.id)) {
          // 律师函概率也适当提高，增加超级惩罚触发机会
          adjustedWeight = symbol.weight * DYNAMIC_WEIGHT_CONFIG.superPenalty.lawyerMultiplier;
        }
      }
    }

    return { ...symbol, weight: adjustedWeight };
  });
}

// 权重随机选择函数
export function getRandomSymbol(symbols: any[], userCoins: number) {
  const dynamicSymbols = getDynamicSymbols(symbols, userCoins);
  const totalWeight = dynamicSymbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let random = Math.random() * totalWeight;

  for (const symbol of dynamicSymbols) {
    random -= symbol.weight;
    if (random <= 0) {
      return symbol.id;
    }
  }

  return dynamicSymbols[0].id;
}

// 检查中奖组合函数
export function checkWin(results: string[]) {
  const symbolCounts: Record<string, number> = {};
  for (const symbol of results) {
    symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
  }

  // 首先检查惩罚组合（优先级最高）
  const lawyerCount = symbolCounts['lawyer'] || 0;
  const miCarIds = ['mi_car', 'mi_car_fire1', 'mi_car_fire2', 'mi_car_logo', 'mi_car_model'];
  const miCarCount = miCarIds.reduce((count, id) => count + (symbolCounts[id] || 0), 0);
  const totalPunishmentCount = lawyerCount + miCarCount;

  if (totalPunishmentCount >= 1) {
    if (totalPunishmentCount >= 4) {
      return { multiplier: -4, name: '4个惩罚牌', type: 'punishment' };
    } else if (totalPunishmentCount >= 3) {
      return { multiplier: -3, name: '3个惩罚牌', type: 'punishment' };
    } else if (totalPunishmentCount >= 2) {
      return { multiplier: -2, name: '2个惩罚牌', type: 'punishment' };
    } else {
      return { multiplier: -1, name: '1个惩罚牌', type: 'punishment' };
    }
  }

  const allResults = [];

  // 检查侯总特殊奖励 - 支持所有变体
  const hzIds = ['hz', 'hz2', 'hz3', 'hz4'];
  const hzCount = results.filter(s => hzIds.includes(s)).length;
  if (hzCount >= 2) {
    let multiplier = 0;
    let name = '';

    if (hzCount === 4) {
      multiplier = 200;
      name = '4侯总';
    } else if (hzCount === 3) {
      multiplier = 100;
      name = '3侯总';
    } else if (hzCount === 2) {
      multiplier = 50;
      name = '2侯总';
    }

    allResults.push({
      amount: multiplier,
      type: 'hz',
      independent: true,
      specialVideo: true,
      jackpotDouble: hzCount >= 2
    });
  }

  // 检查2坤（可组合）
  const kunCount = symbolCounts['m'] || 0;
  if (kunCount === 2) {
    allResults.push({ amount: 10, type: 'twoKun', combinable: true });
  }

  // 检查对称奖励 (ABBA)
  if (results[0] === results[3] && results[1] === results[2] && results[0] !== results[1]) {
    allResults.push({ amount: 10, type: 'symmetric' });
  }

  // 检查超级大奖组合
  for (const [key, combo] of Object.entries(WINNING_COMBINATIONS)) {
    if ('pattern' in combo && combo.pattern && JSON.stringify(results) === JSON.stringify(combo.pattern)) {
      allResults.push({ amount: combo.multiplier, type: key });
    }
  }

  // 检查4坤
  if (kunCount === 4) {
    allResults.push({ amount: 50, type: 'fourKun', independent: true });
  }

  // 检查4个相同符号
  for (const [symbol, count] of Object.entries(symbolCounts)) {
    if (count === 4) {
      allResults.push({ amount: 32, type: 'fourSame', independent: true });
    }
  }

  // 检查3个相同符号（坤坤除外）
  for (const [symbol, count] of Object.entries(symbolCounts)) {
    if (count === 3 && symbol !== 'm') {
      allResults.push({ amount: 18, type: 'threeSame', independent: true });
    }
  }

  // 检查普通2个相同符号（坤坤和侯总除外）
  for (const [symbol, count] of Object.entries(symbolCounts)) {
    if (count === 2 && symbol !== 'm' && !hzIds.includes(symbol)) {
      allResults.push({ amount: 4, type: 'normalTwoSame' });
    }
  }

  // 计算总奖励
  if (allResults.length > 0) {
    const independentResults = allResults.filter(r => r.independent);
    const combinableResults = allResults.filter(r => r.combinable);
    const normalResults = allResults.filter(r => !r.independent && !r.combinable);

    let totalAmount = 0;
    let resultName = '';
    let hasSpecialReward = false;
    let specialVideo = false;
    let jackpotDouble = false;

    // 独立奖励只取最高
    if (independentResults.length > 0) {
      const highest = independentResults.reduce((prev, current) =>
        current.amount > prev.amount ? current : prev
      );
      totalAmount = highest.amount;
      resultName = highest.type;
      hasSpecialReward = true;
      specialVideo = highest.specialVideo || false;
      jackpotDouble = highest.jackpotDouble || false;
    } else if (normalResults.length > 0) {
      // 普通奖励取最高
      totalAmount = Math.max(...normalResults.map(r => r.amount));
      resultName = normalResults.find(r => r.amount === totalAmount)?.type || '';
    }

    // 可组合奖励可以累加
    if (combinableResults.length > 0) {
      totalAmount += combinableResults.reduce((sum, r) => sum + r.amount, 0);
      if (!resultName && combinableResults.length > 0) {
        resultName = combinableResults[0].type;
      }
    }

    return {
      multiplier: totalAmount,
      name: resultName || '中奖',
      type: 'win',
      hasSpecialReward,
      specialVideo,
      jackpotDouble
    };
  }

  return { multiplier: 0, name: '未中奖', type: 'none' };
}

// 获取调试信息函数
export function getDebugInfo(symbols: any[], userCoins: number) {
  const dynamicSymbols = getDynamicSymbols(symbols, userCoins);
  const hzSymbols = dynamicSymbols.filter(s => s.id.startsWith('hz'));
  const lawyerSymbols = dynamicSymbols.filter(s => s.id === 'lawyer');
  const miCarSymbols = dynamicSymbols.filter(s => s.id.startsWith('mi_car'));

  const hzTotalWeight = hzSymbols.reduce((sum, s) => sum + s.weight, 0);
  const totalWeight = dynamicSymbols.reduce((sum, s) => sum + s.weight, 0);
  const hzPercentage = (hzTotalWeight / totalWeight * 100).toFixed(2);
  const miCarTotalWeight = miCarSymbols.reduce((sum, s) => sum + s.weight, 0);
  const miCarPercentage = (miCarTotalWeight / totalWeight * 100).toFixed(2);

  return {
    coins: userCoins,
    isReliefMode: userCoins < 1000000,
    isBalanceMode: userCoins >= 10000000 && userCoins < 100000000,
    isSuperPenaltyMode: userCoins >= 100000000,
    hzTotalWeight,
    totalWeight,
    hzPercentage,
    miCarTotalWeight,
    miCarPercentage,
    hzWeights: hzSymbols.map(s => ({ id: s.id, weight: s.weight, variant: s.variant })),
    lawyerWeight: lawyerSymbols[0]?.weight || 30,
    miCarWeights: miCarSymbols.map(s => ({ id: s.id, weight: s.weight, variant: s.variant })),
    mode: userCoins >= 100000000 ? '超级惩罚模式' : userCoins >= 10000000 ? '平衡模式' : userCoins < 1000000 ? '救济模式' : '普通模式'
  };
}

// 符号图片路径映射（前端专用）
export const SYMBOL_IMAGES: Record<string, string> = {
  'j': '/slot-symbols/j.png',
  'n': '/slot-symbols/n.png',
  't': '/slot-symbols/t.png',
  'm': '/slot-symbols/man.png',
  'zft': '/slot-symbols/zft.png',
  'lq': '/slot-symbols/lq.jpg',
  'bj': '/slot-symbols/zft.png',
  'bdk': '/slot-symbols/bdk.jpg',
  'lawyer': '/slot-symbols/lsh.png',
  'xq': '/slot-symbols/xq.jpg',
  'hz': '/slot-symbols/hongzong/tp/houzong.webp',
  'hz2': '/slot-symbols/hongzong/tp/houzong_2.jpeg',
  'hz3': '/slot-symbols/hongzong/tp/houzong_bfx.webp',
  'hz4': '/slot-symbols/hongzong/tp/houzong_wyj.png',
  // 小米汽车系列图片
  'mi_car': '/slot-symbols/mi/小米汽车.png',
  'mi_car_fire1': '/slot-symbols/mi/小米汽车起火1.webp',
  'mi_car_fire2': '/slot-symbols/mi/小米汽车起火3.png',
  'mi_car_logo': '/slot-symbols/mi/小米.webp',
  'mi_car_model': '/slot-symbols/mi/小米汽车22.jpg',
};

// 侯总视频路径（前端专用）
export const HOUZONG_VIDEO_PATH = '/slot-symbols/hongzong/sp/侯总.mp4';