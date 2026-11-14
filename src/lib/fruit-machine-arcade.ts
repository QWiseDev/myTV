/**
 * 街机水果机（怀旧水果机）盘面配置与核心逻辑。
 *
 * 盘面还原游戏厅机台：24 格圆盘、8 种押注图案、每种图案分"小格/大格"，
 * 大格出现少但赔得高。跑灯落格概率由逐格权重控制（与真实机台的
 * "可控概率"同机制），权重整体调校为约 90% 返还率、偏娱乐。
 * 想让庄家更黑：把 WEIGHTS 系数整体调低即可。
 */

export type FruitGroupId =
  | 'apple'
  | 'orange'
  | 'bell'
  | 'mango'
  | 'melon'
  | 'star'
  | 'seven'
  | 'bar';

export interface FruitGroup {
  id: FruitGroupId;
  name: string;
  /** emoji 图案；文字类图案（77/BAR）用 text */
  icon?: string;
  text?: string;
  /** 小格赔率（含本金，×3 = 押 1 赔 3） */
  smallOdds: number;
  /** 大格赔率（含本金） */
  bigOdds: number;
  /** 单个小格权重（决定跑灯落格概率） */
  smallWeight: number;
  /** 单个大格权重 */
  bigWeight: number;
}

export const FRUIT_GROUPS: FruitGroup[] = [
  {
    id: 'apple',
    name: '苹果',
    icon: '🍎',
    smallOdds: 3,
    bigOdds: 8,
    smallWeight: 7,
    bigWeight: 4,
  },
  {
    id: 'orange',
    name: '橙子',
    icon: '🍊',
    smallOdds: 3,
    bigOdds: 8,
    smallWeight: 10,
    bigWeight: 4.3,
  },
  {
    id: 'bell',
    name: '铃铛',
    icon: '🔔',
    smallOdds: 4,
    bigOdds: 10,
    smallWeight: 6.8,
    bigWeight: 4,
  },
  {
    id: 'mango',
    name: '芒果',
    icon: '🥭',
    smallOdds: 5,
    bigOdds: 12,
    smallWeight: 5.8,
    bigWeight: 3,
  },
  {
    id: 'melon',
    name: '西瓜',
    icon: '🍉',
    smallOdds: 6,
    bigOdds: 15,
    smallWeight: 4.5,
    bigWeight: 2.4,
  },
  {
    id: 'star',
    name: '星星',
    icon: '⭐',
    smallOdds: 15,
    bigOdds: 30,
    smallWeight: 1.7,
    bigWeight: 1.4,
  },
  {
    id: 'seven',
    name: '77',
    text: '77',
    smallOdds: 30,
    bigOdds: 60,
    smallWeight: 2.4,
    bigWeight: 0.4,
  },
  {
    id: 'bar',
    name: 'BAR',
    text: 'BAR',
    smallOdds: 50,
    bigOdds: 100,
    smallWeight: 0.8,
    bigWeight: 0.14,
  },
];

export interface BoardCell {
  group: FruitGroupId;
  big: boolean;
}

/** 24 格盘面，顺时针排列，0 号在正上方 */
export const BOARD: BoardCell[] = [
  { group: 'apple', big: false }, // 0
  { group: 'bell', big: false }, // 1
  { group: 'mango', big: false }, // 2
  { group: 'orange', big: true }, // 3
  { group: 'melon', big: false }, // 4
  { group: 'star', big: false }, // 5
  { group: 'mango', big: true }, // 6
  { group: 'apple', big: false }, // 7
  { group: 'orange', big: false }, // 8
  { group: 'melon', big: true }, // 9
  { group: 'bell', big: false }, // 10
  { group: 'seven', big: false }, // 11
  { group: 'apple', big: true }, // 12
  { group: 'bar', big: false }, // 13
  { group: 'orange', big: false }, // 14
  { group: 'star', big: true }, // 15
  { group: 'mango', big: false }, // 16
  { group: 'apple', big: false }, // 17
  { group: 'bell', big: true }, // 18
  { group: 'bar', big: false }, // 19
  { group: 'melon', big: false }, // 20
  { group: 'seven', big: true }, // 21
  { group: 'star', big: false }, // 22
  { group: 'bar', big: true }, // 23
];

/** 押注按钮顺序（键盘 1-8 对应） */
export const BET_ORDER: FruitGroupId[] = FRUIT_GROUPS.map((g) => g.id);

/** 单枚筹码面值（分） */
export const CHIP = 10;

/** 赔率不低于该值的格子按"大奖"处理：过格回拉＋全场爆闪 */
export const BIG_PRIZE_ODDS = 15;

export function getGroup(id: FruitGroupId): FruitGroup {
  return FRUIT_GROUPS.find((g) => g.id === id) as FruitGroup;
}

/** 某格的赔率 */
export function cellOdds(cell: BoardCell): number {
  const group = getGroup(cell.group);
  return cell.big ? group.bigOdds : group.smallOdds;
}

/** 某格的落格权重 */
export function cellWeight(cell: BoardCell): number {
  const group = getGroup(cell.group);
  return cell.big ? group.bigWeight : group.smallWeight;
}

/** 按权重随机决定跑灯落点 */
export function pickTargetIndex(rng: () => number = Math.random): number {
  const weights = BOARD.map(cellWeight);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < BOARD.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return BOARD.length - 1;
}

export type BetMap = Record<FruitGroupId, number>;

export function createEmptyBets(): BetMap {
  return BET_ORDER.reduce((acc, id) => {
    acc[id] = 0;
    return acc;
  }, {} as BetMap);
}

/** 押注总额（分） */
export function totalBetAmount(bets: BetMap): number {
  return BET_ORDER.reduce((sum, id) => sum + bets[id], 0) * CHIP;
}

/**
 * 结算：跑灯落在 index，返回本局返还（分，含本金；未中为 0）。
 * 押注按"图案组"生效：落在该图案任意一格都按该格赔率返奖。
 */
export function settleWin(bets: BetMap, index: number): number {
  const cell = BOARD[index];
  const chips = bets[cell.group];
  if (!chips) return 0;
  return chips * cellOdds(cell) * CHIP;
}

/**
 * 押中后"猜大小"的骰子点数：2-13 共 12 点，≥8 为大（无平局）。
 */
export function rollDoublePoint(rng: () => number = Math.random): {
  point: number;
  big: boolean;
} {
  const point = 2 + Math.floor(rng() * 12);
  return { point, big: point >= 8 };
}
