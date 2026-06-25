/**
 * 水果机游戏配置文件
 * 统一管理水果机游戏的符号、概率、奖励等配置
 */

// 水果类型配置
export const FRUIT_TYPES = [
  { id: 'apple', name: '苹果', icon: '🍎', color: '#FF6B6B' },
  { id: 'orange', name: '橙子', icon: '🍊', color: '#FFA500' },
  { id: 'lemon', name: '柠檬', icon: '🍋', color: '#FFD700' },
  { id: 'watermelon', name: '西瓜', icon: '🍉', color: '#4CAF50' },
  { id: 'plum', name: '李子', icon: '🟣', color: '#9C27B0' },
  { id: 'bell', name: '铃铛', icon: '🔔', color: '#2196F3' },
  { id: 'star', name: '星星', icon: '⭐', color: '#FFC107' },
  { id: 'seven', name: '七七', icon: '7️⃣', color: '#F44336' }
];

// 水果盘面配置 - 24个位置围成圆形
export const FRUIT_POSITIONS = Array.from({ length: 24 }, (_, i) => {
  const fruitIndex = i % FRUIT_TYPES.length;
  return {
    position: i,
    fruit: FRUIT_TYPES[fruitIndex],
    angle: (i * 15) - 90 // 每个位置间隔15度，从顶部开始
  };
});

// 投注按钮配置
export const BETTING_BUTTONS = FRUIT_TYPES.map((fruit, _index) => ({
  ...fruit,
  maxBet: 999,
  defaultBet: 10
}));

// 游戏配置
export const GAME_CONFIG = {
  minBet: 1,
  maxBet: 999,
  defaultBet: 10,
  autoPlayDelay: 2000, // 自动模式延迟
  lightSpeed: 100, // 灯光移动速度(ms)
  luckModeRounds: 3, // Luck模式旋转圈数
  bigOrSmallRange: {
    small: [1, 2, 3, 4, 5, 6, 7], // 小数字范围
    big: [8, 9, 10, 11, 12, 13, 14] // 大数字范围
  }
};

// 中奖倍率配置
export const WIN_MULTIPLIERS = {
  // 单个水果中奖倍率
  single: {
    apple: 8,
    orange: 10,
    lemon: 12,
    watermelon: 15,
    plum: 18,
    bell: 20,
    star: 25,
    seven: 30
  },
  // 连续多个相同水果倍率加成
  multipliers: {
    2: 1.5,   // 2个连续
    3: 2.0,   // 3个连续
    4: 3.0    // 4个连续
  },
  // 大小游戏倍率
  bigOrSmall: 2.0
};

// 音效配置
export const SOUND_EFFECTS = {
  bet: 'bet.mp3',
  start: 'start.mp3',
  spinning: 'spinning.mp3',
  win: 'win.mp3',
  bigWin: 'big_win.mp3',
  lose: 'lose.mp3',
  bigOrSmall: 'big_or_small.mp3',
  jackpot: 'jackpot.mp3',
  click: 'click.mp3'
};

// 动画配置
export const ANIMATION_CONFIG = {
  lightDuration: 3000, // 灯光旋转持续时间
  bigOrSmallDuration: 1000, // 大小结果显示时间
  winAnimationDuration: 2000, // 中奖动画时间
  buttonPressDuration: 150 // 按钮按下动画时间
};

// 游戏状态接口定义
export interface FruitMachineState {
  ownedScore: number;         // 持有积分
  rewardScore: number;        // 中奖积分
  currentLightPosition: number; // 当前灯光位置
  winFruitList: string[];     // 中奖水果列表
  betButtons: BetButtonState[]; // 投注按钮状态
  isPlaying: boolean;         // 是否正在游戏
  autoPlay: boolean;          // 自动模式
  luckMode: boolean;          // Luck模式
  bigOrSmallNumber: number;   // 大小游戏数字
  showBigOrSmall: boolean;    // 是否显示大小游戏
  isBigOrSmallBtnSwitch: boolean; // 大小按钮闪烁状态
  gameHistory: GameRecord[];  // 游戏历史
}

// 投注按钮状态
export interface BetButtonState {
  fruitId: string;
  betAmount: number;
  isActive: boolean;
  isWinning: boolean;
}

// 游戏记录
export interface GameRecord {
  id: string;
  timestamp: number;
  betAmount: number;
  winAmount: number;
  fruitType: string;
  isBigOrSmallWin?: boolean;
  multiplier?: number;
}

// 中奖结果
export interface WinResult {
  fruitTypes: string[];
  totalWin: number;
  multiplier: number;
  isBigWin: boolean;
  positions: number[];
}