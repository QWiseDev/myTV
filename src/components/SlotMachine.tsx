'use client';

import { AnimatePresence,motion } from 'framer-motion';
import { Cherry,Cog,Coins, Gift, Music, Play, Sparkles, Star, Trophy, User, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef,useState } from 'react';

import './SlotMachine.css';

import {
  checkWin,
  getDebugInfo,
  getDynamicSymbols,
  getRandomSymbol,
  HOUZONG_VIDEO_PATH,
  PUNISHMENTS as BASE_PUNISHMENTS,
  SLOT_SYMBOLS,
  SYMBOL_IMAGES,
  WINNING_COMBINATIONS as BASE_WINNING_COMBINATIONS} from '../lib/slot-config';

// 将符号配置与图片路径合并
const SYMBOLS = SLOT_SYMBOLS.map(symbol => ({
  ...symbol,
  image: SYMBOL_IMAGES[symbol.id]
}));

// 前端专用的中奖组合配置（包含颜色信息）
const WIN_COMBINATIONS = {
  // 超级大奖
  jiniTaimei: { ...BASE_WINNING_COMBINATIONS.jiniTaimei, color: 'from-purple-600 to-purple-400' },
  basketballAmbassador: { ...BASE_WINNING_COMBINATIONS.basketballAmbassador, color: 'from-orange-600 to-orange-400' },

  // 大奖（前端特有的UI组合）
  chickenNotTooBeautiful: { multiplier: 16, name: '鸡你不太美', color: 'from-pink-500 to-pink-400', symbols: ['j', 'n', 't', 'm'] },
  liBuLiNiKunGe: { multiplier: 16, name: '厉不厉害你坤哥', color: 'from-blue-500 to-blue-400', symbols: ['bj', 'zft', 'bdk', 'lq'] },

  // 特殊奖励（添加颜色信息）
  fourKun: { ...BASE_WINNING_COMBINATIONS.fourKun, color: 'from-yellow-500 to-yellow-400' },
  fourSame: { ...BASE_WINNING_COMBINATIONS.fourSame, color: 'from-green-500 to-green-400' },
  threeKun: { ...BASE_WINNING_COMBINATIONS.threeKun, color: 'from-red-500 to-red-400' },
  normalFourSame: { ...BASE_WINNING_COMBINATIONS.normalFourSame, color: 'from-indigo-500 to-indigo-400' },
  symmetric: { ...BASE_WINNING_COMBINATIONS.symmetric, color: 'from-teal-500 to-teal-400' },
  twoKun: { ...BASE_WINNING_COMBINATIONS.twoKun, color: 'from-amber-500 to-amber-400' },
  normalTwoSame: { ...BASE_WINNING_COMBINATIONS.normalTwoSame, color: 'from-gray-500 to-gray-400' },

  // 侯总特殊奖励（添加颜色信息）
  fourHz: { ...BASE_WINNING_COMBINATIONS.fourHz, color: 'from-red-600 to-red-400' },
  threeHz: { ...BASE_WINNING_COMBINATIONS.threeHz, color: 'from-orange-600 to-orange-400' },
  twoHz: { ...BASE_WINNING_COMBINATIONS.twoHz, color: 'from-yellow-600 to-yellow-400' },
};

// 律师函惩罚配置（前端使用）
const PUNISHMENTS = BASE_PUNISHMENTS;

// 投注金额限制配置
const BET_CONFIG = {
  MAX_BET_AMOUNT: 100000,  // 最大投注金额10万（总投注：基础投注×倍率）
  DEFAULT_BET: 100,        // 默认投注金额
  MAX_BASE_BET: 20000,     // 最大基础投注（5倍率时刚好10万）
};

// 计算在不同倍率下允许的最大基础投注
const getMaxBetForMultiplier = (multiplier: number) => {
  return Math.floor(BET_CONFIG.MAX_BET_AMOUNT / multiplier);
};

interface SlotMachineProps {
  initialCoins?: number;
  showTitle?: boolean;
  compact?: boolean;
}

export default function SlotMachine({ initialCoins = 10000, showTitle = true, compact = false }: SlotMachineProps) {
  const router = useRouter();
  const [coins, setCoins] = useState(initialCoins);
  const [bet, setBet] = useState(100); // 更新默认投注为100
  const [reels, setReels] = useState([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2], SYMBOLS[3]]);
  const [spinning, setSpinning] = useState([false, false, false, false]);
  const [scrollOffsets, setScrollOffsets] = useState([0, 0, 0, 0]);
  const [randomSymbolSequences, setRandomSymbolSequences] = useState<string[][]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [showWin, setShowWin] = useState(false);
  const [winType, setWinType] = useState<'three' | 'two' | 'special' | 'punishment' | null>(null);
  const [resultName, setResultName] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bgMusicEnabled, setBgMusicEnabled] = useState(true);
  const [bgMusicAudio, setBgMusicAudio] = useState<HTMLAudioElement | null>(null);
  const [currentBgMusicIndex, setCurrentBgMusicIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [spinHistory, setSpinHistory] = useState<Array<{symbols: string[], win: number, type: string}>>([]);
  const [totalWins, setTotalWins] = useState(0);
  const [biggestWin, setBiggestWin] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [progressiveJackpot, setProgressiveJackpot] = useState(5000);
  const [showJackpot, setShowJackpot] = useState(false);
  const [showJackpotReduction, setShowJackpotReduction] = useState(false);
  const [jackpotReductionAmount, setJackpotReductionAmount] = useState(0);
  const [showXqCard, setShowXqCard] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [loseStreak, setLoseStreak] = useState(0);
  const [chestCount, setChestCount] = useState(0);
  const [showLuckyWheel, setShowLuckyWheel] = useState(false);
  const [luckyWheelReward, setLuckyWheelReward] = useState<{type: string; value: number; name: string; betRefund?: number} | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showChestNotif, setShowChestNotif] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{username: string; coins: number; biggestWin: number; totalWins: number}>>([]);
  const [leaderboardType, setLeaderboardType] = useState<'coins' | 'biggestWin' | 'totalWins'>('coins');

  // 侯总视频弹窗和奖池翻倍状态
  const [showHouZongVideo, setShowHouZongVideo] = useState(false);
  const [showJackpotDouble, setShowJackpotDouble] = useState(false);
  const [jackpotDoubleAmount, setJackpotDoubleAmount] = useState(0);
  const [isHouZongBonus, setIsHouZongBonus] = useState(false);
  const [houZongVideoSrc, setHouZongVideoSrc] = useState(HOUZONG_VIDEO_PATH);

  // 律师函gif播放状态
  const [showLawyerGif, setShowLawyerGif] = useState(false);

  // 小米汽车gif播放状态
  const [showMiCarGif, setShowMiCarGif] = useState(false);

  // 两张惩罚牌弹窗状态
  const [showTwoPunishmentGif, setShowTwoPunishmentGif] = useState(false);

  // 法务部出动弹窗状态
  const [showLegalDepartmentGif, setShowLegalDepartmentGif] = useState(false);

  // 超级惩罚模式状态
  const [showSuperPenaltyMode, setShowSuperPenaltyMode] = useState(false);

  // 限速惩罚状态
  const [penaltyStatus, setPenaltyStatus] = useState<{
    isActive: boolean;
    multiplier: number;
    remainingTime: number;
    violationCount: number;
    message: string | null;
  }>({ isActive: false, multiplier: 1, remainingTime: 0, violationCount: 0, message: null });
  const [showPenaltyWarning, setShowPenaltyWarning] = useState(false);
  const [penaltyWarningMessage, setPenaltyWarningMessage] = useState('');

  // 金币格式化函数
  const formatCoins = useCallback((amount: number): string => {
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
  }, []);

  // 全局AudioContext实例（避免重复创建导致内存泄漏）
  const audioContextRef = useRef<AudioContext | null>(null);

  // 音效系统 - 使用真实音频文件 + Web Audio API生成合成音效
  const playSound = useCallback((type: 'spin' | 'win' | 'bet' | 'bigwin' | 'stop' | 'jackpot' | 'coin' | 'lose') => {
    if (!soundEnabled || typeof window === 'undefined') return;

    try {
      // 播放真实音频文件 - 确保用户交互后播放
      const playAudioFile = (filename: string) => {
        const audio = new Audio(`/sounds/${filename}`);
        audio.volume = 0.3;
        // 确保音频可以播放，如果失败则使用合成音效作为后备
        audio.play().catch(e => {
          console.log('Audio play failed, using synthesized sound:', e);
          // 使用合成音效作为后备
          if (type === 'win' || type === 'bigwin') {
            // 获取或创建全局AudioContext实例（避免重复创建）
            if (!audioContextRef.current) {
              audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const audioContext = audioContextRef.current;
            const winNotes = [523, 659, 784]; // C, E, G
            winNotes.forEach((freq, i) => {
              setTimeout(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = freq;
                gainNode.gain.value = 0.08;
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
                oscillator.stop(audioContext.currentTime + 0.2);
              }, i * 80);
            });
          }
        });
      };

      // 获取或创建全局AudioContext实例（避免重复创建）
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      const playTone = (frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.1) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gainNode.gain.value = volume;

        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        oscillator.stop(audioContext.currentTime + duration);
      };

      switch (type) {
        case 'spin':
          // 播放老虎机旋转音效
          playAudioFile('mixkit-slot-machine-win-1928.wav');
          break;

        case 'stop':
          // 使用合成音效：清脆的点击声
          playTone(1200, 0.05, 'square', 0.1);
          setTimeout(() => playTone(800, 0.05, 'square', 0.08), 50);
          break;

        case 'bet':
          // 使用合成音效：低沉的确认声
          playTone(150, 0.2, 'sine', 0.12);
          break;

        case 'coin':
          // 使用合成音效：清脆的金属声
          playTone(2000, 0.05, 'square', 0.06);
          setTimeout(() => playTone(2500, 0.03, 'square', 0.04), 30);
          break;

        case 'win':
          // 播放真实音频文件 + 合成和声
          playAudioFile('mixkit-coin-win-notification-1992.wav');
          // 添加装饰性合成音效
          setTimeout(() => {
            const winNotes = [523, 659, 784]; // C, E, G
            winNotes.forEach((freq, i) => {
              setTimeout(() => playTone(freq, 0.2, 'sine', 0.08), i * 80);
            });
          }, 200);
          break;

        case 'bigwin':
          // 播放金币获胜音频文件 + 更丰富的合成和声
          playAudioFile('mixkit-coin-win-notification-1992.wav');
          // 添加辉煌的合成和弦
          setTimeout(() => {
            const bigwinNotes = [523, 659, 784, 1047]; // C, E, G, High C
            bigwinNotes.forEach((freq, i) => {
              setTimeout(() => playTone(freq, 0.4, 'sine', 0.15), i * 120);
            });
            // 添加装饰音
            setTimeout(() => playTone(1319, 0.3, 'triangle', 0.1), 600);
          }, 300);
          break;

        case 'jackpot':
          // 播放大胜利音频文件 + 华丽的合成效果
          playAudioFile('mixkit-slot-machine-win-1928.wav');
          // 添加累积大奖的特殊合成音效
          setTimeout(() => {
            const jackpotMelody = [
              { freq: 523, duration: 0.3, delay: 0 },
              { freq: 659, duration: 0.3, delay: 200 },
              { freq: 784, duration: 0.3, delay: 400 },
              { freq: 1047, duration: 0.5, delay: 600 },
              { freq: 1319, duration: 0.5, delay: 1000 },
              { freq: 1568, duration: 0.7, delay: 1500 }
            ];

            jackpotMelody.forEach(({ freq, duration, delay }) => {
              setTimeout(() => {
                playTone(freq, duration, 'sine', 0.2);
                // 添加和声
                if (freq > 500) {
                  setTimeout(() => playTone(freq * 1.5, duration * 0.8, 'triangle', 0.08), 50);
                }
              }, delay);
            });

            // 添加打击乐效果
            setTimeout(() => playTone(100, 0.15, 'square', 0.15), 2200);
          }, 500);

          // 添加额外的金币音效
          for (let i = 0; i < 3; i++) {
            setTimeout(() => playSound('coin'), 1000 + i * 300);
          }
          break;

        case 'lose':
          // 使用下载的惩罚音效
          playAudioFile('ngmhhy.mp3');
          break;
      }
    } catch (error) {
      console.log(`Playing sound: ${type}`, error);
    }
  }, [soundEnabled]);

  // 消息提示函数
  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 旋转老虎机 - 调用后端API
  const spin = useCallback(async () => {
    if (coins < bet * multiplier || isPlaying) return;

    // 计算实际投注金额（基础投注 × 倍率）
    const actualBet = bet * multiplier;

    // 前端验证：检查实际投注金额是否超过限制
    if (actualBet > BET_CONFIG.MAX_BET_AMOUNT) {
      const suggestion = bet <= BET_CONFIG.MAX_BET_AMOUNT
        ? `建议将倍率降低到 ${Math.floor(BET_CONFIG.MAX_BET_AMOUNT / bet)} 倍或以下`
        : `建议基础投注不超过 ${Math.floor(BET_CONFIG.MAX_BET_AMOUNT / multiplier)} 金币（当前倍率${multiplier}x）`;

      showMessage('error',
        `总投注金额（${bet.toLocaleString()} × ${multiplier} = ${actualBet.toLocaleString()}）超出限制，最大允许 ${BET_CONFIG.MAX_BET_AMOUNT.toLocaleString()} 金币。${suggestion}`
      );
      return;
    }
    setLastWin(0);
    setShowWin(false);
    setWinType(null);
    setShowJackpot(false);

    setIsPlaying(true);
    playSound('bet');
    playSound('spin');

    // 增加累积奖金池（每次下注的50%加入奖池，确保至少增加5金币）
    const jackpotIncrease = Math.max(5, Math.floor(actualBet * 0.5));
    setProgressiveJackpot(prev => prev + jackpotIncrease);

    // 启动4个转轴旋转
    setSpinning([true, true, true, true]);

    // 为每个转轴生成长随机符号序列，确保滚动连续
    const sequences = Array.from({ length: 4 }, () => {
      const sequence = [];
      // 生成足够长的序列来确保无缝滚动
      for (let i = 0; i < 30; i++) {
        sequence.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id);
      }
      return sequence;
    });
    setRandomSymbolSequences(sequences);

    try {
      // 调用后端API
      const response = await fetch('/api/slot/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          betAmount: bet,
          multiplier: multiplier
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '服务器错误');
      }

      const data = await response.json();

      // 将API结果转换为符号
      const resultSymbols = data.results.map((symbolId: string) =>
        SYMBOLS.find(s => s.id === symbolId) || SYMBOLS[0]
      );

      // 更新用户数据
      setCoins(data.user.coins);
      setTotalWins(data.user.totalWins);
      setBiggestWin(data.user.biggestWin);
      setLoseStreak(data.user.loseStreak || 0);
      setChestCount(data.user.chestCount || 0);

      // 调试信息：打印金币变化
      console.log('老虎机结果:', {
        result: data.result,
        coinChange: data.result.coinChange,
        newCoins: data.user.coins,
        winAmount: data.result.winAmount,
        betAmount: data.result.betAmount
      });

      
      // 逐个停止转轴，增加悬念感
      for (let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 250 + i * 100));
        setReels(prev => {
          const newReels = [...prev];
          newReels[i] = resultSymbols[i];
          return newReels;
        });
        setSpinning(prev => {
          const newSpinning = [...prev];
          newSpinning[i] = false;
          return newSpinning;
        });
        playSound('stop');
      }

      // 等待所有转轴停止后显示结果
      await new Promise(resolve => setTimeout(resolve, 125));

      const { result } = data;
      setLastWin(result.winAmount);
      setResultName(result.name);

      // 宝箱通知
      if (data.chestEarned > 0) {
        setShowChestNotif(true);
        playSound('coin');
        setTimeout(() => setShowChestNotif(false), 3000);
      }

      // 幸运轮盘奖励
      if (data.luckyWheel) {
        setLuckyWheelReward(data.luckyWheel);
        setShowLuckyWheel(true);
        playSound('bigwin');
        setTimeout(() => setShowLuckyWheel(false), 2000); // 缩短到2秒
      }

      // 处理惩罚状态
      if (data.penalty) {
        setPenaltyStatus(data.penalty);
        if (data.penalty.isActive && data.penalty.message) {
          setPenaltyWarningMessage(data.penalty.message);
          setShowPenaltyWarning(true);
          playSound('lose'); // 播放惩罚音效
          setTimeout(() => setShowPenaltyWarning(false), 5000); // 5秒后自动隐藏
        }
      }

      // 处理结果
      if (result.type === 'punishment') {
        setLastWin(-result.betAmount); // 显示实际扣除的金额（正数显示为负数）

        // 计算惩罚牌数量并处理累积大奖
        const lawyerCount = data.results.filter((s: string) => s === 'lawyer').length;
        const miCarIds = ['mi_car', 'mi_car_fire1', 'mi_car_fire2', 'mi_car_logo', 'mi_car_model'];
        const miCarCount = data.results.filter((s: string) => miCarIds.includes(s)).length;
        const totalPunishmentCount = lawyerCount + miCarCount;

        // 检查超级惩罚模式
        const isSuperPenaltyMode = (miCarCount >= 3 && lawyerCount >= 1) || (miCarCount >= 2 && lawyerCount >= 2);

        // 检查惩罚牌数量并处理弹窗
        if (totalPunishmentCount >= 2) {
          if (isSuperPenaltyMode) {
            // 超级惩罚模式：小米汽车3张+律师函1张 或 小米汽车2张+律师函2张
            setShowSuperPenaltyMode(true);
            // 缩短显示时间以减少性能消耗
            setTimeout(() => setShowSuperPenaltyMode(false), 5000); // 5秒动画

            // 超级惩罚：20倍投注扣除
            const currentBet = bet * multiplier;
            const superPenaltyAmount = currentBet * 20;
            setCoins(prev => Math.max(0, prev - superPenaltyAmount));
            setLastWin(-superPenaltyAmount);

            // 累积奖池清空
            setProgressiveJackpot(0);
          } else if (lawyerCount >= 1 && miCarCount >= 1 && totalPunishmentCount === 2) {
            // 法务部出动组合（律师函+任意小米汽车）
            setShowLegalDepartmentGif(true);
            setTimeout(() => setShowLegalDepartmentGif(false), 5000);
          } else if (totalPunishmentCount === 2) {
            // 其他2张惩罚牌：显示小米弹窗2.png
            setShowTwoPunishmentGif(true);
            setTimeout(() => setShowTwoPunishmentGif(false), 5000);
          } else if (totalPunishmentCount >= 3) {
            // 3张或以上惩罚牌：累积大奖减少
            const oldJackpot = progressiveJackpot;
            let newJackpot = oldJackpot;

            if (totalPunishmentCount === 3) {
              // 3张惩罚牌：累积大奖减少一半 + 显示gif动画
              newJackpot = Math.floor(oldJackpot / 2);
              if (miCarCount >= 3) {
                setShowMiCarGif(true);
              } else {
                setShowLawyerGif(true);
              }
            } else if (totalPunishmentCount === 4) {
              // 4张惩罚牌：累积大奖直接清空 + 显示gif动画
              newJackpot = 0;
              if (miCarCount >= 3) {
                setShowMiCarGif(true);
              } else {
                setShowLawyerGif(true);
              }
            }

            // 显示累积大奖减少的动画效果
            const jackpotChange = newJackpot - oldJackpot;
            if (jackpotChange < 0) {
              setJackpotReductionAmount(Math.abs(jackpotChange));
              setShowJackpotReduction(true);
              setTimeout(() => setShowJackpotReduction(false), 2500);
            }

            setProgressiveJackpot(newJackpot);

            // 5秒后自动关闭gif弹窗
            setTimeout(() => {
              setShowLawyerGif(false);
              setShowMiCarGif(false);
            }, 5000);
          }
        }

        // 记录惩罚历史
        setSpinHistory(prev => [{
          symbols: data.results,
          win: -result.betAmount, // 记录为负数表示扣除
          type: result.name
        }, ...prev.slice(0, 10)]);

        setShowWin(true);
        setWinType('punishment' as any);
        playSound('lose');

        // 3秒后隐藏提示
        setTimeout(() => setShowWin(false), 3000);
      } else if (result.winAmount > 0) {
        // 记录历史
        setSpinHistory(prev => [{
          symbols: data.results,
          win: result.winAmount,
          type: result.name
        }, ...prev.slice(0, 10)]);

        // 判断是否大奖
        const isJackpot = result.multiplier >= 50;

        // 判断是否徐棋隐藏卡触发
        const isXqBonus = result.name === 'xqBonus' || result.name === 'xqOnly';

        // 判断是否侯总奖励触发
        const isHouZongBonus = ['fourHz', 'threeHz', 'twoHz'].includes(result.name);
        if (isHouZongBonus) {
          setIsHouZongBonus(true);
        }

        if (isXqBonus) {
          // 徐棋隐藏卡特效
          setShowJackpot(true);
          setShowXqCard(true);
          playSound('jackpot');

          // 徐棋卡获得累积大奖的一半（忽略后端的普通倍数计算，只使用奖池奖金）
          const jackpotPrize = Math.floor(progressiveJackpot / 2);

          // 添加调试日志和防护措施
          console.log('徐棋卡中奖调试信息:', {
            奖池余额: progressiveJackpot,
            实际奖池奖金: jackpotPrize,
            后端计算奖金: result.winAmount,
            投注金额: actualBet,
            用户余额: coins
          });

          // 防护措施：确保奖池奖金不超过奖池余额的10倍
          const safeJackpotPrize = Math.min(jackpotPrize, Math.floor(progressiveJackpot * 10));

          setCoins(prev => prev + safeJackpotPrize);
          setProgressiveJackpot(prev => prev - safeJackpotPrize);

          // 修正显示的中奖金额为实际奖池奖金，而不是后端计算的普通倍数
          setLastWin(safeJackpotPrize);

          // 更新最大赢取和总获胜
          setBiggestWin(prev => Math.max(prev, safeJackpotPrize));
          setTotalWins(prev => prev + 1);

          // 4秒后隐藏徐棋卡特效
          setTimeout(() => setShowXqCard(false), 4000);
        } else if (isHouZongBonus) {
          // 侯总特殊奖励 - 播放视频并翻倍奖池
          setShowHouZongVideo(true);
          playSound('jackpot');

          // 计算侯总数量并翻倍奖池
          const houZongIds = ['hz', 'hz2', 'hz3', 'hz4'];
          const houZongCount = data.results.filter((s: string) => houZongIds.includes(s)).length;

          if (houZongCount >= 2) {
            // 奖池翻倍动画
            const oldJackpot = progressiveJackpot;
            const newJackpot = oldJackpot * 2;
            const jackpotIncrease = newJackpot - oldJackpot;

            setJackpotDoubleAmount(jackpotIncrease);
            setShowJackpotDouble(true);
            setProgressiveJackpot(newJackpot);

            // 奖励也翻倍
            const doubledReward = result.winAmount * 2;
            setCoins(prev => prev + (doubledReward - result.winAmount));
            setLastWin(doubledReward);

            // 更新统计
            setBiggestWin(prev => Math.max(prev, doubledReward));
            setTotalWins(prev => prev + 1);

            // 3秒后隐藏奖池翻倍动画
            setTimeout(() => setShowJackpotDouble(false), 3000);
          }

          // 8秒后隐藏视频弹窗
          setTimeout(() => setShowHouZongVideo(false), 8000);
        } else if (isJackpot) {
          setShowJackpot(true);
          playSound('jackpot');

          // 中超级大奖：获得一半累积大奖，累积奖金池保留另一半（忽略后端普通倍数计算）
          const jackpotPrize = Math.floor(progressiveJackpot / 2);

          // 添加调试日志和防护措施
          console.log('超级大奖中奖调试信息:', {
            奖池余额: progressiveJackpot,
            实际奖池奖金: jackpotPrize,
            后端计算奖金: result.winAmount,
            投注金额: actualBet,
            用户余额: coins
          });

          // 防护措施：确保奖池奖金不超过奖池余额的10倍
          const safeJackpotPrize = Math.min(jackpotPrize, Math.floor(progressiveJackpot * 10));

          setCoins(prev => prev + safeJackpotPrize);
          setProgressiveJackpot(prev => prev - safeJackpotPrize);

          // 修正显示的中奖金额为实际奖池奖金，而不是后端计算的普通倍数
          setLastWin(safeJackpotPrize);

          // 更新最大赢取和总获胜
          setBiggestWin(prev => Math.max(prev, safeJackpotPrize));
          setTotalWins(prev => prev + 1);
        } else {
          setWinStreak(prev => prev + 1);
          if (result.winAmount >= actualBet * 10) {
            playSound('bigwin');
          } else {
            playSound('win');
          }
        }

        setShowWin(true);
        setWinType(result.multiplier >= 10 ? 'special' : result.multiplier >= 5 ? 'three' : 'two');

        // 3秒后隐藏提示
        setTimeout(() => setShowWin(false), 3000);
      } else {
        // 未中奖
        setLastWin(0);
        setResultName(result.name);
        playSound('lose');
        setWinStreak(0);

        // 记录未中奖历史
        setSpinHistory(prev => [{
          symbols: data.results,
          win: 0,
          type: result.name
        }, ...prev.slice(0, 10)]);
      }

    } catch (error: any) {
      console.error('抽奖失败:', error);

      // 尝试解析错误响应中的惩罚信息
      let penaltyData = null;
      if (error.response?.data?.penalty) {
        penaltyData = error.response.data.penalty;
      } else if (error.message && error.message.includes('penalty')) {
        try {
          const match = error.message.match(/penalty.*?{[^}]+}/);
          if (match) {
            penaltyData = JSON.parse(match[0].replace('penalty', ''));
          }
        } catch (e) {
          console.log('Failed to parse penalty from error message');
        }
      }

      // 显示错误信息
      if (error.message?.includes('请求过于频繁') || error.message?.includes('RATE_LIMIT_EXCEEDED')) {
        let errorMessage = '操作过于频繁，请稍后再试（每分钟最多30次）';

        if (penaltyData && penaltyData.message) {
          errorMessage = penaltyData.message + '\n\n' + errorMessage;
        }

        alert(errorMessage);
        // 如果是速率限制错误，停止自动播放
        setAutoPlay(false);

        // 更新惩罚状态
        if (penaltyData) {
          setPenaltyStatus(penaltyData);
          if (penaltyData.isActive && penaltyData.message) {
            setPenaltyWarningMessage(penaltyData.message);
            setShowPenaltyWarning(true);
            setTimeout(() => setShowPenaltyWarning(false), 5000);
          }
        }
      } else {
        alert(error.message || '网络错误，请稍后重试');
      }

      // 停止所有转轴
      setSpinning([false, false, false, false]);

      // 如果是金币不足错误，更新状态
      if (error.message?.includes('金币不足')) {
        // 可以在这里更新UI显示金币不足
      }
    } finally {
      setIsPlaying(false);
    }
  }, [coins, bet, isPlaying, multiplier, playSound]);

  // 预加载所有符号图片，避免滚动时加载卡顿
  useEffect(() => {
    const preloadImages = () => {
      SYMBOLS.forEach(symbol => {
        const img = new Image();
        img.src = symbol.image;
        img.loading = 'eager';
      });
    };

    preloadImages();
  }, []);

  // 初始化用户数据
  useEffect(() => {
    const initUserData = async () => {
      try {
        const response = await fetch('/api/slot/spin');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            setCoins(data.user.coins);
            setTotalWins(data.user.totalWins);
            setBiggestWin(data.user.biggestWin);
            setLoseStreak(data.user.loseStreak || 0);
            setChestCount(data.user.chestCount || 0);
          }
        }
      } catch (error) {
        console.error('初始化用户数据失败:', error);
      }
    };

    initUserData();
  }, []);

  // 获取排行榜
  const fetchLeaderboard = useCallback(async (type: 'coins' | 'biggestWin' | 'totalWins' = 'coins') => {
    try {
      const response = await fetch(`/api/slot/leaderboard?type=${type}`);
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data.leaderboard || []);
        setLeaderboardType(type);
      }
    } catch (error) {
      console.error('获取排行榜失败:', error);
    }
  }, []);

  // 重置用户账户
  const resetAccount = useCallback(async (initialCoins = 1000) => {
    try {
      const confirmed = window.confirm(`确定要重置账户吗？\n\n这将清空所有记录，并重新开始游戏。\n初始金币: ${initialCoins}`);
      if (!confirmed) return;

      const response = await fetch('/api/slot/user', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initialCoins }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '重置失败');
      }

      const data = await response.json();

      // 重置前端状态
      setCoins(data.user.coins);
      setTotalWins(data.user.totalWins);
      setBiggestWin(data.user.biggestWin);
      setSpinHistory([]);
      setWinStreak(0);
      setLoseStreak(0);
      setChestCount(0);
      setShowUserPanel(false);

      alert('账户已重置成功！');
      playSound('coin');

    } catch (error: any) {
      console.error('重置账户失败:', error);
      alert(error.message || '重置失败，请稍后重试');
    }
  }, [playSound]);

  // 新的复杂中奖计算函数
  const calculateWin = (symbols: typeof SYMBOLS[0][], betAmount: number) => {
    let totalWinAmount = 0;
    let winType: string | null = null;
    let isPunishment = false;
    let banHours: number | null = null;
    const results: Array<{amount: number, type: string, independent?: boolean, combinable?: boolean, specialVideo?: boolean, jackpotDouble?: boolean}> = [];

    // 检查律师函惩罚（优先检查）
    const lawyerCount = symbols.filter(s => s.id === 'lawyer').length;
    if (lawyerCount > 0) {
      isPunishment = true;
      switch (lawyerCount) {
        case 1:
          results.push({ amount: -betAmount * 2, type: 'oneLawyer' }); // 多扣除1倍
          break;
        case 2:
          results.push({ amount: -betAmount * 3, type: 'twoLawyers' }); // 多扣除2倍
          break;
        case 3:
          results.push({ amount: -betAmount * 3, type: 'threeLawyers' });
          banHours = 2;
          break;
        case 4:
          results.push({ amount: -betAmount * 4, type: 'fourLawyers' });
          banHours = 5;
          break;
      }
    }

    // 如果有律师函，直接返回惩罚结果
    if (isPunishment) {
      const punishment = results[0];
      return {
        amount: punishment.amount,
        type: punishment.type,
        banHours,
        isPunishment: true
      };
    }

    // 检查超级大奖（需要精确顺序）
    const symbolIds = symbols.map(s => s.id);

    // 姬霓太美 - 精确顺序
    if (JSON.stringify(symbolIds) === JSON.stringify(['j', 'n', 't', 'm'])) {
      results.push({ amount: betAmount * 128, type: 'jiniTaimei' });
    }

    // 篮球大使 - 精确顺序
    if (JSON.stringify(symbolIds) === JSON.stringify(['bj', 'zft', 'bdk', 'lq'])) {
      results.push({ amount: betAmount * 128, type: 'basketballAmbassador' });
    }

    // 检查4坤
    const kunCount = symbols.filter(s => s.id === 'm').length;
    if (kunCount === 4) {
      results.push({ amount: betAmount * 50, type: 'fourKun', independent: true });
    }

    // 检查4个相同符号
    const symbolCounts = symbols.reduce((acc, symbol) => {
      acc[symbol.id] = (acc[symbol.id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const fourSameSymbol = Object.entries(symbolCounts).find(([_, count]) => count === 4);
    if (fourSameSymbol && kunCount !== 4) { // 排除4坤的情况
      results.push({ amount: betAmount * 32, type: 'fourSame' });
    }

    // 检查鸡你不太美（包含j,n,t,m，顺序不限）
    const hasAllJNTM = ['j', 'n', 't', 'm'].every(id => symbolIds.includes(id));
    if (hasAllJNTM) {
      results.push({ amount: betAmount * 16, type: 'chickenNotTooBeautiful' });
    }

    // 检查厉不厉害你坤哥（包含bj,zft,bdk,lq，顺序不限）
    const hasAllBJZFTBDKLQ = ['bj', 'zft', 'bdk', 'lq'].every(id => symbolIds.includes(id));
    if (hasAllBJZFTBDKLQ) {
      results.push({ amount: betAmount * 16, type: 'liBuLiNiKunGe' });
    }

    // 检查3坤
    if (kunCount === 3) {
      results.push({ amount: betAmount * 18, type: 'threeKun' });
    }

    // 检查普通3个相同符号
    const threeSameSymbol = Object.entries(symbolCounts).find(([_, count]) => count === 3);
    if (threeSameSymbol && kunCount !== 3) {
      results.push({ amount: betAmount * 8, type: 'normalFourSame' });
    }

    // 检查对称奖励 ABBA
    if (symbolIds[0] === symbolIds[3] && symbolIds[1] === symbolIds[2] && symbolIds[0] !== symbolIds[1]) {
      results.push({ amount: betAmount * 10, type: 'symmetric' });
    }

    // 检查2坤（可组合）
    if (kunCount === 2) {
      results.push({ amount: betAmount * 10, type: 'twoKun', combinable: true });
    }

    // 使用共享函数检查侯总特殊奖励
    const winResult = checkWin(symbolIds);
    if (winResult.hasSpecialReward && winResult.specialVideo) {
      const multiplier = winResult.multiplier;
      results.push({
        amount: betAmount * multiplier,
        type: winResult.name,
        independent: true,
        specialVideo: true,
        jackpotDouble: winResult.jackpotDouble || false
      });
    }

    // 检查普通2个相同符号
    const twoSameSymbol = Object.entries(symbolCounts).find(([id, count]) => count === 2 && id !== 'm');
    if (twoSameSymbol && kunCount !== 2) {
      results.push({ amount: betAmount * 4, type: 'normalTwoSame' });
    }

    // 计算总奖励
    const independentResults = results.filter(r => r.independent);
    const combinableResults = results.filter(r => r.combinable);
    const normalResults = results.filter(r => !r.independent && !r.combinable);

    // 独立奖励只取最高
    if (independentResults.length > 0) {
      totalWinAmount = Math.max(...independentResults.map(r => r.amount));
      winType = independentResults.find(r => r.amount === totalWinAmount)?.type || null;
    } else {
      // 普通奖励取最高
      if (normalResults.length > 0) {
        totalWinAmount = Math.max(...normalResults.map(r => r.amount));
        winType = normalResults.find(r => r.amount === totalWinAmount)?.type || null;
      }

      // 可组合奖励可以累加
      if (combinableResults.length > 0) {
        totalWinAmount += combinableResults.reduce((sum, r) => sum + r.amount, 0);
        if (!winType && combinableResults.length > 0) {
          winType = combinableResults[0].type;
        }
      }
    }

    // 检查徐棋隐藏卡
    const hasXq = symbolIds.includes('xq');
    if (hasXq) {
      // 如果有徐棋卡，奖励至少10倍，或者其他奖励*10
      if (totalWinAmount > 0) {
        totalWinAmount *= 10;
        winType = 'xqBonus';
      } else {
        totalWinAmount = betAmount * 10; // 至少10倍投注
        winType = 'xqOnly';
      }
    }

    return {
      amount: totalWinAmount,
      type: winType,
      banHours: banHours || null,
      isPunishment: false
    };
  };

  // 背景音乐管理
  const bgMusicTracks = useMemo(() => [
    '/sounds/Deadman.mp3',
    '/sounds/M5000024gAky3Rea5y.mp3',
    '/sounds/M500002EkwTe07C94Z.mp3',
    '/sounds/M500002PEyle3ZaThJ.mp3',
    '/sounds/M500003HXtM72sZgql.mp3',
    '/sounds/M500003HyuIp2qeHJL.mp3',
    '/sounds/M500004X6Ef33lOLzx.mp3',
    '/sounds/sjsdehjm.mp3',
    '/sounds/mb.mp3'
  ], []);

  // 背景音乐名称映射
  const bgMusicNames = useMemo(() => [
    'Deadman',
    'M5000024gAky3Rea5y',
    'M500002EkwTe07C94Z',
    'M500002PEyle3ZaThJ',
    'M500003HXtM72sZgql',
    'M500003HyuIp2qeHJL',
    'M500004X6Ef33lOLzx',
    'sjsdehjm',
    'mb'
  ], []);

  // 背景音乐初始化和开关控制
  useEffect(() => {
    if (bgMusicEnabled) {
      // 随机选择一个背景音乐
      const randomIndex = Math.floor(Math.random() * bgMusicTracks.length);
      setCurrentBgMusicIndex(randomIndex);

      // 创建新的音频实例
      const audio = new Audio(bgMusicTracks[randomIndex]);
      audio.volume = 0.3;

      // 播放结束后自动切换下一首
      const handleEnded = () => {
        const nextIndex = (randomIndex + 1) % bgMusicTracks.length;
        setCurrentBgMusicIndex(nextIndex);
        audio.src = bgMusicTracks[nextIndex];
        audio.play().catch(e => console.log('Next track play failed:', e));
      };

      audio.addEventListener('ended', handleEnded);
      setBgMusicAudio(audio);
      audio.play().catch(e => {
        console.log('Background music play failed:', e);
      });

      return () => {
        audio.removeEventListener('ended', handleEnded);
        audio.pause();
        audio.src = '';
      };
    } else if (bgMusicAudio) {
      bgMusicAudio.pause();
    }
  }, [bgMusicEnabled, bgMusicTracks]);

  // 使用共享的动态权重计算函数
  const getDynamicSymbolsCallback = useCallback(() => {
    return getDynamicSymbols(SYMBOLS, coins);
  }, [coins]);

  // 使用共享的调试函数
  const getDebugInfoCallback = useCallback(() => {
    return getDebugInfo(SYMBOLS, coins);
  }, [coins]);

  // 基于权重的符号生成函数 - 使用共享函数
  const generateWeightedSymbol = useCallback(() => {
    const symbolId = getRandomSymbol(SYMBOLS, coins);
    return SYMBOLS.find(s => s.id === symbolId) || SYMBOLS[0];
  }, [coins]);

  // 测试函数：强制生成100个符号，统计侯总出现次数
  const testSymbolGeneration = useCallback(() => {
    if (typeof window === 'undefined' || (process.env.NODE_ENV !== 'development' && window.location.hostname !== 'localhost')) {
      return;
    }

    console.log('=== 开始符号生成测试 ===');
    const testResults = [];
    let hzCount = 0;

    for (let i = 0; i < 100; i++) {
      const symbol = generateWeightedSymbol();
      testResults.push(symbol.id);
      if (symbol.id.startsWith('hz')) {
        hzCount++;
      }
    }

    const actualPercentage = (hzCount / 100 * 100).toFixed(2);
    const expectedPercentage = getDebugInfoCallback().hzPercentage;

    console.log('=== 测试结果 ===');
    console.log('测试次数:', 100);
    console.log('侯总出现次数:', hzCount);
    console.log('实际出现率:', actualPercentage + '%');
    console.log('期望出现率:', expectedPercentage + '%');
    console.log('测试结果分布:', testResults.join(', '));
    console.log('==================');
  }, [generateWeightedSymbol, getDebugInfoCallback]);

  // 优化的滚动动画 - 降低帧率以减少CPU使用
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = 0;

    const animate = (currentTime: number) => {
      if (lastTime === 0) lastTime = currentTime;

      const deltaTime = currentTime - lastTime;

      // 降低帧率到30fps，减少CPU使用率
      if (deltaTime >= 33) { // 约30fps
        setScrollOffsets(prev => prev.map((offset, index) =>
          spinning[index] ? (offset + 20) % (30 * 80) : offset // 稍微慢一点的滚动速度
        ));
        lastTime = currentTime;
      }

      if (spinning.some(s => s)) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    if (spinning.some(s => s)) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [spinning]);

  // 自动播放 - 限制为每分钟30次（至少2秒间隔）
  useEffect(() => {
    if (autoPlay && !isPlaying && coins >= bet * multiplier) {
      const timer = setTimeout(spin, 3000); // 3秒间隔，确保每分钟不超过20次
      return () => clearTimeout(timer);
    } else if (coins < bet * multiplier) {
      setAutoPlay(false);
    }
  }, [autoPlay, isPlaying, coins, bet, multiplier, spin]);

  // 性能监控和资源清理
  useEffect(() => {
    // 检测页面可见性，隐藏时暂停动画
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏时暂停背景音乐
        if (bgMusicAudio) {
          bgMusicAudio.pause();
        }
        // 可以在这里暂停其他动画
      } else {
        // 页面显示时恢复背景音乐
        if (bgMusicAudio && bgMusicEnabled) {
          bgMusicAudio.play().catch(e => console.log('Resume play failed:', e));
        }
      }
    };

    // 开发环境性能监控
    let performanceMonitor: number;
    if (process.env.NODE_ENV === 'development') {
      const monitorPerformance = () => {
        const memInfo = (performance as any).memory;
        if (memInfo) {
          // console.log('🔥 Performance Monitor:', { // 减少控制台噪音
          //   used: `${(memInfo.usedJSHeapSize / 1048576).toFixed(2)} MB`,
          //   total: `${(memInfo.totalJSHeapSize / 1048576).toFixed(2)} MB`,
          //   limit: `${(memInfo.jsHeapSizeLimit / 1048576).toFixed(2)} MB`,
          //   spinning: spinning.some(s => s),
          //   showSuperPenalty: showSuperPenaltyMode
          // });
        }
      };

      // 每5秒监控一次性能
      performanceMonitor = window.setInterval(monitorPerformance, 5000);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // 清理背景音乐
      if (bgMusicAudio) {
        bgMusicAudio.pause();
        bgMusicAudio.src = '';
      }

      // 清理全局AudioContext
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          console.log('AudioContext cleanup error:', e);
        }
        audioContextRef.current = null;
      }

      // 移除事件监听器
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // 清理性能监控
      if (performanceMonitor) {
        clearInterval(performanceMonitor);
      }
    };
  }, [bgMusicAudio, bgMusicEnabled, spinning, showSuperPenaltyMode]);

  return (
    <div className={`w-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-2xl shadow-2xl border border-purple-500/30 ${compact ? 'p-2' : 'p-4'} relative overflow-hidden`}>
      {/* 消息提示 */}
      {message && (
        <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-pulse ${
          message.type === 'success' ? 'bg-green-500 text-white' :
          message.type === 'error' ? 'bg-red-500 text-white' :
          'bg-blue-500 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* 背景装饰 */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-32 h-32 bg-yellow-400 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-pink-400 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-400 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10">
          {/* 累积大奖显示 */}
          <div className="text-center mb-4">
            <motion.div
              className="inline-block bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 px-4 py-2 rounded-full shadow-xl"
              animate={showJackpotReduction ? {
                scale: [1, 0.95, 1.1, 1],
                background: ['from-yellow-600 via-yellow-500 to-yellow-600', 'from-red-600 via-red-500 to-red-600', 'from-yellow-600 via-yellow-500 to-yellow-600'],
              } : {
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: showJackpotReduction ? 0.6 : 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-white animate-pulse" />
                <div>
                  <div className="text-xs text-yellow-100 font-bold">累积大奖</div>
                  <motion.div
                    key={progressiveJackpot}
                    initial={{ scale: 1.2, color: '#fef08a' }}
                    animate={{ scale: 1, color: '#ffffff' }}
                    transition={{ duration: 0.5 }}
                    className="text-lg font-bold text-white"
                  >
                    {formatCoins(progressiveJackpot)}
                  </motion.div>
                </div>
                <Gift className="w-5 h-5 text-white animate-pulse" />
              </div>
            </motion.div>
            <div className="text-xs text-yellow-300 mt-1">🏆 特殊组合赢得大奖！</div>
          </div>

          {/* 累积大奖减少提示 */}
          <AnimatePresence>
            {showJackpotReduction && (
              <motion.div
                key="jackpot-reduction"
                initial={{ opacity: 0, y: -50, scale: 0.5 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: [0.5, 1.1, 1],
                }}
                exit={{ opacity: 0, y: 50, scale: 0.5 }}
                className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
              >
                <div className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-red-400">
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 0.5, repeat: 2 }}
                    >
                      <span className="text-4xl">💸</span>
                    </motion.div>
                    <div className="text-2xl font-bold text-center">
                      累积大奖减少
                    </div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                      className="text-3xl font-extrabold text-yellow-300"
                    >
                      -{formatCoins(jackpotReductionAmount)}
                    </motion.div>
                    <div className="text-sm text-red-100">金币</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 惩罚警告提示 */}
          <AnimatePresence>
            {showPenaltyWarning && (
              <motion.div
                key="penalty-warning"
                initial={{ opacity: 0, scale: 0.5, y: -100 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  x: [0, -10, 10, -10, 10, 0] // 左右晃动效果
                }}
                exit={{ opacity: 0, scale: 0.5, y: -100 }}
                transition={{
                  scale: { type: "spring", stiffness: 300, damping: 15 },
                  x: { duration: 0.5, repeat: 3 } // 重复晃动3次
                }}
                className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
              >
                <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-600 text-white px-8 py-6 rounded-2xl shadow-2xl border-4 border-red-400 max-w-md">
                  <div className="flex flex-col items-center gap-3">
                    {/* 警告图标 */}
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                      className="text-6xl"
                    >
                      ⚠️
                    </motion.div>

                    {/* 标题 */}
                    <div className="text-2xl font-bold text-center">
                      惩罚已激活！
                    </div>

                    {/* 惩罚信息 */}
                    <div className="text-center space-y-2">
                      <div className="text-lg font-semibold text-yellow-200">
                        {penaltyWarningMessage}
                      </div>
                      {penaltyStatus.violationCount > 1 && (
                        <div className="text-sm text-red-100">
                          第 {penaltyStatus.violationCount} 次违规触发
                        </div>
                      )}
                    </div>

                    {/* 律师函图标 */}
                    <div className="flex gap-2 justify-center">
                      {[...Array(Math.min(penaltyStatus.violationCount, 4))].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1, type: "spring" }}
                          className="text-3xl"
                        >
                          📜
                        </motion.div>
                      ))}
                    </div>

                    {/* 提示文字 */}
                    <div className="text-sm text-red-100 text-center">
                      律师函出现概率大幅增加！
                      <br />
                      请谨慎游戏，等待惩罚结束
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 侯总奖池翻倍提示 */}
          <AnimatePresence>
            {showJackpotDouble && (
              <motion.div
                key="jackpot-double"
                initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
                animate={{
                  opacity: 1,
                  scale: [0.5, 1.3, 1.1, 1],
                  rotate: [0, 10, -10, 0],
                }}
                exit={{ opacity: 0, scale: 0.5, rotate: 180 }}
                className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
              >
                <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-yellow-400">
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 2, repeat: 1, ease: "linear" }}
                    >
                      <span className="text-4xl">🎯</span>
                    </motion.div>
                    <div className="text-2xl font-bold text-center">
                      侯总祝福！奖池翻倍！
                    </div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                      className="text-3xl font-extrabold text-yellow-300"
                    >
                      +{formatCoins(jackpotDoubleAmount)}
                    </motion.div>
                    <div className="text-sm text-yellow-100">金币</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 侯总视频弹窗 */}
          <AnimatePresence>
            {showHouZongVideo && (
              <motion.div
                key="houzong-video"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
              >
                <motion.div
                  initial={{ scale: 0.5, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0.5, rotate: 10 }}
                  className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-yellow-500"
                  style={{ maxWidth: '90vw', maxHeight: '90vh' }}
                >
                  <div className="relative">
                    <video
                      autoPlay
                      muted={false}
                      controls={false}
                      className="max-w-full max-h-[70vh]"
                      style={{ maxHeight: '70vh' }}
                    >
                      <source src={houZongVideoSrc} type="video/mp4" />
                      您的浏览器不支持视频播放
                    </video>

                    {/* 视频标题 */}
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                      <h3 className="text-2xl font-bold text-yellow-400 text-center">
                        🎯 侯总降临！奖池翻倍！
                      </h3>
                    </div>

                    {/* 关闭按钮 */}
                    <button
                      onClick={() => setShowHouZongVideo(false)}
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-2 transition-colors z-10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* 底部提示 */}
                  <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 p-4 text-center">
                    <div className="text-xl font-bold text-white mb-2">
                      恭喜触发侯总特殊奖励！
                    </div>
                    <div className="text-lg text-yellow-100">
                      奖池已翻倍，奖励已翻倍！继续游戏赢取更多金币！
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 律师函gif弹窗 */}
          <AnimatePresence>
            {showLawyerGif && (
              <motion.div
                key="lawyer-gif"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
              >
                <motion.div
                  initial={{ scale: 0.5, rotate: 10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0.5, rotate: -10 }}
                  className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-red-500"
                  style={{ maxWidth: '90vw', maxHeight: '90vh' }}
                >
                  <div className="relative">
                    <img
                      src="/slot-symbols/gifs/regret.gif"
                      alt="律师函警告"
                      className="max-w-full max-h-[70vh]"
                      style={{ maxHeight: '70vh' }}
                    />

                    {/* gif标题 */}
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                      <h3 className="text-2xl font-bold text-red-400 text-center">
                        ⚖️ 三张律师函！奖池减少！
                      </h3>
                    </div>

                    {/* 关闭按钮 */}
                    <button
                      onClick={() => setShowLawyerGif(false)}
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-2 transition-colors z-10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* 底部提示 */}
                  <div className="bg-gradient-to-r from-red-600 to-red-500 p-4 text-center">
                    <div className="text-xl font-bold text-white mb-2">
                      哎呀！触发律师函惩罚！
                    </div>
                    <div className="text-lg text-red-100">
                      累积大奖已被减少，下次好运！
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 小米汽车gif弹窗 */}
          <AnimatePresence>
            {showMiCarGif && (
              <motion.div
                key="mi-car-gif"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
              >
                <motion.div
                  initial={{ scale: 0.5, rotate: 10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0.5, rotate: -10 }}
                  className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-orange-500"
                  style={{ maxWidth: '90vw', maxHeight: '90vh' }}
                >
                  <div className="relative">
                    <img
                      src="/slot-symbols/mi/小米弹窗.png"
                      alt="小米汽车警告"
                      className="max-w-full max-h-[70vh]"
                      style={{ maxHeight: '70vh' }}
                    />

                    {/* gif标题 */}
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                      <h3 className="text-2xl font-bold text-orange-400 text-center">
                        🚗 三张小米汽车！奖池减少！
                      </h3>
                    </div>

                    {/* 关闭按钮 */}
                    <button
                      onClick={() => setShowMiCarGif(false)}
                      className="absolute top-2 right-2 bg-orange-600 hover:bg-orange-500 text-white rounded-full p-2 transition-colors z-10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* 底部提示 */}
                  <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-4 text-center">
                    <div className="text-xl font-bold text-white mb-2">
                      哎呀！触发小米汽车惩罚！
                    </div>
                    <div className="text-lg text-orange-100">
                      累积大奖已被减少，下次好运！
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 两张惩罚牌弹窗 */}
          <AnimatePresence>
            {showTwoPunishmentGif && (
              <motion.div
                key="two-punishment-gif"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
              >
                <motion.div
                  initial={{ scale: 0.5, rotate: 10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0.5, rotate: -10 }}
                  className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-purple-500"
                  style={{ maxWidth: '90vw', maxHeight: '90vh' }}
                >
                  <div className="relative">
                    <img
                      src="/slot-symbols/mi/小米弹窗2.png"
                      alt="两张惩罚牌警告"
                      className="max-w-full max-h-[70vh]"
                      style={{ maxHeight: '70vh' }}
                    />

                    {/* gif标题 */}
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                      <h3 className="text-2xl font-bold text-purple-400 text-center">
                        ⚠️ 两张惩罚牌！小心谨慎！
                      </h3>
                    </div>

                    {/* 关闭按钮 */}
                    <button
                      onClick={() => setShowTwoPunishmentGif(false)}
                      className="absolute top-2 right-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full p-2 transition-colors z-10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* 底部提示 */}
                  <div className="bg-gradient-to-r from-purple-600 to-purple-500 p-4 text-center">
                    <div className="text-xl font-bold text-white mb-2">
                      警告！出现两张惩罚牌！
                    </div>
                    <div className="text-lg text-purple-100">
                      请谨慎游戏，避免更多惩罚！
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 法务部出动弹窗 */}
          <AnimatePresence>
            {showLegalDepartmentGif && (
              <motion.div
                key="legal-department-gif"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
              >
                <motion.div
                  initial={{ scale: 0.5, rotate: 10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0.5, rotate: -10 }}
                  className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-red-700"
                  style={{ maxWidth: '90vw', maxHeight: '90vh' }}
                >
                  <div className="relative">
                    <img
                      src="/slot-symbols/mi/法务部出动.png"
                      alt="法务部出动警告"
                      className="max-w-full max-h-[70vh]"
                      style={{ maxHeight: '70vh' }}
                    />

                    {/* gif标题 */}
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                      <h3 className="text-2xl font-bold text-red-500 text-center">
                        ⚠️ 法务部出动！
                      </h3>
                    </div>

                    {/* 关闭按钮 */}
                    <button
                      onClick={() => setShowLegalDepartmentGif(false)}
                      className="absolute top-2 right-2 bg-red-700 hover:bg-red-600 text-white rounded-full p-2 transition-colors z-10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* 底部提示 */}
                  <div className="bg-gradient-to-r from-red-700 to-red-600 p-4 text-center">
                    <div className="text-xl font-bold text-white mb-2">
                      警告！法务部出动！
                    </div>
                    <div className="text-lg text-red-100">
                      请谨言慎行，避免更多惩罚！
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 超级惩罚模式弹窗 */}
          <AnimatePresence>
            {showSuperPenaltyMode && (
              <motion.div
                key="super-penalty-mode"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/95 flex items-center justify-center z-50"
              >
                {/* 全屏飘动的律师函动画 - 优化版本 */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={`lawyer-${i}`}
                    className="absolute pointer-events-none"
                    initial={{
                      x: typeof window !== 'undefined' ? Math.random() * window.innerWidth : 0,
                      y: -100,
                      rotate: Math.random() * 360,
                      scale: 0.5 + Math.random() * 0.5
                    }}
                    animate={{
                      y: typeof window !== 'undefined' ? window.innerHeight + 100 : 1000,
                      rotate: Math.random() * 720,
                      x: typeof window !== 'undefined' ? Math.random() * window.innerWidth - window.innerWidth / 2 : 0
                    }}
                    transition={{
                      duration: 4 + Math.random() * 2, // 稍微慢一点
                      repeat: 3, // 限制重复次数而不是无限
                      delay: Math.random() * 2,
                      ease: "linear"
                    }}
                  >
                    <img
                      src="/slot-symbols/lsh.png"
                      alt="律师函"
                      className="w-12 h-12 md:w-16 md:h-16 opacity-60" // 稍微小一点
                    />
                  </motion.div>
                ))}

                {/* 惩罚恶魔动画 - 优化版本 */}
                <motion.div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  initial={{ scale: 0, rotate: 0 }}
                  animate={{ scale: [0, 1.2, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 1, repeat: 2, repeatType: "reverse" }}
                >
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 2, repeat: 4 }} // 限制重复次数
                    className="text-6xl md:text-8xl" // 稍微小一点
                  >
                    😈
                  </motion.div>
                </motion.div>

                {/* 主要弹窗内容 */}
                <motion.div
                  initial={{ scale: 0.1, rotate: 180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0.1, rotate: -180 }}
                  className="relative bg-gradient-to-b from-red-900 via-black to-red-900 rounded-3xl overflow-hidden shadow-2xl border-8 border-red-600"
                  style={{ maxWidth: '95vw', maxHeight: '95vh', zIndex: 10 }}
                >
                  <div className="relative p-8 md:p-12">
                    {/* 背景火焰效果 - 优化版本 */}
                    <div className="absolute inset-0 opacity-20">
                      {[...Array(3)].map((_, i) => (
                        <motion.div
                          key={`flame-${i}`}
                          className="absolute bg-gradient-to-t from-red-600 to-orange-400 rounded-full blur-xl"
                          style={{
                            left: `${30 + i * 25}%`,
                            bottom: 0,
                            width: '50px',
                            height: '80px'
                          }}
                          animate={{
                            height: ['80px', '120px', '80px'],
                            opacity: [0.2, 0.5, 0.2],
                          }}
                          transition={{
                            duration: 1.5 + i * 0.3,
                            repeat: 5, // 限制重复次数
                            delay: i * 0.2
                          }}
                        />
                      ))}
                    </div>

                    {/* 标题 */}
                    <motion.div
                      initial={{ y: -50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="relative text-center mb-6"
                    >
                      <motion.h1
                        animate={{
                          textShadow: [
                            "0 0 10px #ff0000",
                            "0 0 20px #ff0000",
                            "0 0 30px #ff0000",
                            "0 0 40px #ff0000"
                          ]
                        }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="text-4xl md:text-6xl font-black text-red-500 mb-4"
                      >
                        ⚠️ 超级惩罚！！！ ⚠️
                      </motion.h1>
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="text-2xl md:text-3xl font-bold text-orange-400"
                      >
                        雷总憔悴，小米报案！！
                      </motion.div>
                    </motion.div>

                    {/* 惩罚详情 */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="relative bg-black/60 rounded-2xl p-6 mb-6 border-4 border-red-500"
                    >
                      <div className="text-center space-y-4">
                        <motion.div
                          animate={{ x: [-10, 10, -10] }}
                          transition={{ duration: 0.5, repeat: Infinity }}
                          className="text-xl md:text-2xl font-bold text-red-300"
                        >
                          💣 20倍投注扣除 💣
                        </motion.div>
                        <motion.div
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="text-lg md:text-xl text-orange-300"
                        >
                          累积大奖池已清空！！！
                        </motion.div>
                        <div className="text-red-400 font-bold text-lg">
                          惩罚金额: -{(bet * multiplier * 20).toLocaleString()} 金币
                        </div>
                      </div>
                    </motion.div>

                    {/* 恶魔笑声文字 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="relative text-center"
                    >
                      <motion.div
                        animate={{
                          scale: [1, 1.1, 1],
                          rotate: [-2, 2, -2]
                        }}
                        transition={{ duration: 0.3, repeat: Infinity }}
                        className="text-3xl md:text-4xl font-black text-red-600"
                      >
                        哈哈哈哈！！！
                      </motion.div>
                      <div className="text-red-400 text-lg mt-2">
                        这就是超级惩罚的威力！！！
                      </div>
                    </motion.div>

                    {/* 关闭按钮 */}
                    <motion.button
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 1.5 }}
                      onClick={() => setShowSuperPenaltyMode(false)}
                      className="absolute top-4 right-4 bg-red-700 hover:bg-red-600 text-white rounded-full p-3 transition-all transform hover:scale-110 z-20"
                    >
                      <X className="w-8 h-8" />
                    </motion.button>
                  </div>

                  {/* 底部惩罚提示 */}
                  <div className="bg-gradient-to-r from-red-800 via-orange-700 to-red-800 p-4 text-center">
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-xl font-bold text-white"
                    >
                      ⚖️ 法务部全面出击 ⚖️
                    </motion.div>
                    <div className="text-red-100 text-sm mt-1">
                      小米法务部已全面出动，请立即停止违法行为！
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {showTitle && (
            <>
              {/* 标题和统计信息 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center md:text-left">
                  <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-1 flex items-center justify-center md:justify-start gap-2">
                    <Sparkles className="w-4 h-4 md:w-6 md:h-6" />
                    幸运老虎机
                    <Sparkles className="w-4 h-4 md:w-6 md:h-6" />
                  </h1>
                  <p className="text-xs md:text-sm text-gray-300">试试你的运气，赢取金币奖励！</p>
                </div>

                {/* 统计数据 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
                    <Trophy className="w-4 h-4 md:w-6 md:h-6 text-yellow-400 mx-auto mb-1" />
                    <div className="text-sm md:text-lg font-bold text-white">{totalWins}</div>
                    <div className="text-xs text-gray-300">总获胜</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
                    <Zap className="w-4 h-4 md:w-6 md:h-6 text-orange-400 mx-auto mb-1" />
                    <div className="text-sm md:text-lg font-bold text-white">{biggestWin}</div>
                    <div className="text-xs text-gray-300">最大赢取</div>
                  </div>
                </div>

                {/* 金币显示和用户管理 */}
                <div className="flex justify-center md:justify-end items-center gap-2">
                  <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                    <Coins className="w-4 h-4 md:w-6 md:h-6 text-white" />
                    <span className="text-white font-bold text-lg">{formatCoins(coins)}</span>
                  </div>
                  {/* 水果机按钮 - 余额超过200万时显示 */}
                  {coins >= 1000000 && (
                    <button
                      onClick={() => {
                        // 这里可以添加跳转到水果机的逻辑
                        router.push('/fruit-machine');
                      }}
                      className="p-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-400 hover:to-pink-400 rounded-full transition-all transform hover:scale-105 shadow-lg relative animate-pulse"
                      title="水果机 (余额≥100万解锁)"
                    >
                      <Cherry className="w-5 h-5 text-white" />
                      <div className="absolute -top-1 -right-1 bg-yellow-400 text-red-600 px-1.5 py-0.5 rounded-full flex items-center justify-center shadow-lg border-2 border-red-300">
                        <span className="text-xs font-bold">VIP</span>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowLeaderboard(!showLeaderboard);
                      if (!showLeaderboard) fetchLeaderboard('coins');
                    }}
                    className="p-2 bg-orange-600 hover:bg-orange-500 rounded-full transition-colors relative"
                    title="排行榜"
                  >
                    <Trophy className="w-5 h-5 text-white" />
                    {chestCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-600 to-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-orange-400">
                        <Gift className="w-3 h-3 text-white" />
                        <span className="text-white font-bold text-xs">{chestCount}</span>
                      </div>
                    )}
                  </button>
                  {coins >= 1000000 && (
                    <button
                      onClick={() => {
                        console.log('跳转到水果机页面，当前金币:', coins);
                        // 保存当前金币到localStorage，供水果机页面使用
                        localStorage.setItem('userCoins', coins.toString());
                        router.push('/fruit-machine');
                      }}
                      className="p-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 rounded-full transition-all relative animate-pulse"
                      title={`水果机 (100万金币解锁) - 当前: ${formatCoins(coins)}`}
                    >
                      <Cherry className="w-5 h-5 text-white" />
                      <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-600 to-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-orange-400">
                        <span className="text-white font-bold text-xs">NEW</span>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => setShowUserPanel(!showUserPanel)}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors"
                    title="用户管理"
                  >
                    <User className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </>
          )}

          {!showTitle && (
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-2">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
                  <Trophy className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                  <div className="text-xs font-bold text-white">{totalWins}</div>
                  <div className="text-xs text-gray-300">总获胜</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
                  <Zap className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                  <div className="text-xs font-bold text-white">{formatCoins(biggestWin)}</div>
                  <div className="text-xs text-gray-300">最大赢取</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-3 py-1 rounded-full flex items-center gap-2 shadow-lg">
                  <Coins className="w-4 h-4 text-white" />
                  <span className="text-white font-bold">{formatCoins(coins)}</span>
                </div>
                {/* 水果机按钮 - 紧凑模式，余额超过100万时显示 */}
                {coins >= 1000000 && (
                  <button
                    onClick={() => {
                      localStorage.setItem('userCoins', coins.toString());
                      router.push('/fruit-machine');
                    }}
                    className="p-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 rounded-full transition-all transform hover:scale-105 shadow-lg relative animate-pulse"
                    title="水果机 (余额≥100万解锁)"
                  >
                    <Cherry className="w-4 h-4 text-white" />
                    <div className="absolute -top-1 -right-1 bg-yellow-400 text-red-600 px-1 py-0.5 rounded-full flex items-center justify-center shadow-lg border-2 border-red-300">
                      <span className="text-xs font-bold">VIP</span>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowLeaderboard(!showLeaderboard);
                    if (!showLeaderboard) fetchLeaderboard('coins');
                  }}
                  className="p-2 bg-orange-600 hover:bg-orange-500 rounded-full transition-colors relative"
                  title="排行榜"
                >
                  <Trophy className="w-4 h-4 text-white" />
                  {chestCount > 0 && (
                    <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-600 to-blue-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-lg border border-orange-400">
                      <Gift className="w-2.5 h-2.5 text-white" />
                      <span className="text-white font-bold text-xs">{chestCount}</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 老虎机主体 */}
          <div className="bg-gradient-to-b from-red-800 to-red-900 rounded-xl p-4 mb-4 shadow-inner border-4 border-yellow-600">
            <div className="bg-black/50 rounded-lg p-4">
              {/* 转轴 - 4转轴系统 */}
              <div className="flex justify-center gap-2 mb-4">
                {reels.map((symbol, index) => (
                  <div
                    key={index}
                    className="slot-reel-container relative w-20 h-20 border-4 border-yellow-500 rounded-lg overflow-hidden bg-gradient-to-b from-blue-900 to-purple-900 shadow-2xl"
                    style={{
                      boxShadow: 'rgba(251, 191, 36, 0.6) 0px 0px 20px, rgba(0, 0, 0, 0.5) 0px 0px 20px inset'
                    }}
                  >
                    <div
                      className="slot-reel relative h-full w-full overflow-hidden"
                      style={{
                        transform: 'translateZ(0)',
                        backfaceVisibility: 'hidden',
                        perspective: '1000px'
                      }}
                    >
                      <div
                        className="slot-symbols relative w-full flex flex-col"
                        style={{
                          willChange: 'transform',
                          transform: spinning[index]
                            ? `translateZ(0) translateY(${-scrollOffsets[index]}px)`
                            : `translateZ(0) translateY(0)`,
                          backfaceVisibility: 'hidden',
                          transition: spinning[index] ? 'none' : 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                        }}
                      >
                        {/* 老虎机滚动效果 - 使用预生成的随机序列 */}
                        {spinning[index] ? (
                          // 旋转时显示预生成的随机符号序列
                          randomSymbolSequences[index].map((symbolId, i) => {
                            const symbol = SYMBOLS.find(s => s.id === symbolId) || SYMBOLS[0];
                            return (
                              <div
                                key={i}
                                className="slot-symbol w-full h-20 flex items-center justify-center p-2 flex-shrink-0"
                                style={{
                                  contain: 'layout style paint'
                                }}
                              >
                                <img
                                  src={symbol.image}
                                  alt={symbol.name}
                                  className="max-w-full max-h-full object-contain"
                                  style={{
                                    filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 4px 8px)',
                                    imageRendering: 'crisp-edges',
                                    transform: 'translateZ(0)',
                                    willChange: 'transform'
                                  }}
                                  loading="eager"
                                />
                              </div>
                            );
                          })
                        ) : (
                          // 停止时只显示当前符号
                          <div className="slot-symbol w-full h-20 flex items-center justify-center p-2 flex-shrink-0">
                            <img
                              src={symbol.image}
                              alt={symbol.name}
                              className="max-w-full max-h-full object-contain"
                              style={{
                                filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 4px 8px)',
                                imageRendering: 'crisp-edges',
                                transform: 'translateZ(0)'
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 旋转时的边框动画 */}
                    {spinning[index] && (
                      <div
                        className="absolute inset-0 border-4 border-yellow-400 rounded-lg pointer-events-none animate-pulse"
                        style={{
                          boxShadow: 'rgba(251, 191, 36, 0.8) 0px 0px 20px inset'
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* 中奖提示 */}
              <AnimatePresence>
                {showJackpot && (
                  <motion.div
                    key="jackpot"
                    initial={{ opacity: 0, scale: 0.3, y: 100, rotate: -10 }}
                    animate={{
                      opacity: 1,
                      scale: [1, 1.2, 1.1, 1],
                      y: 0,
                      rotate: [0, 5, -3, 0],
                    }}
                    exit={{ opacity: 0, scale: 0.5, y: -50 }}
                    className="text-center py-2"
                    transition={{ duration: 0.8 }}
                  >
                    <div className="relative">
                      {/* 光环效果 */}
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur-xl opacity-50"
                        animate={{
                          scale: [1, 1.3, 1],
                          opacity: [0.5, 0.8, 0.5],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      />

                      <div className="relative bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white px-6 py-3 rounded-full inline-block shadow-2xl">
                        <div className="flex flex-col items-center gap-1">
                          <motion.div
                            className="flex items-center gap-2"
                            animate={{
                              x: [0, 3, -3, 0],
                            }}
                            transition={{
                              duration: 0.5,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                          >
                            <motion.div
                              animate={{ rotate: [0, 360] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            >
                              <Trophy className="w-5 h-5 md:w-7 md:h-7 text-yellow-200" />
                            </motion.div>
                            <span className="font-bold text-base md:text-xl">🏆 累积大奖！🏆</span>
                            <motion.div
                              animate={{ rotate: [0, -360] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            >
                              <Trophy className="w-5 h-5 md:w-7 md:h-7 text-yellow-200" />
                            </motion.div>
                          </motion.div>
                          <motion.span
                            className="font-bold text-sm md:text-base text-yellow-100"
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                          >
                            恭喜赢得 {formatCoins(lastWin)} 金币！
                          </motion.span>
                        </div>
                      </div>

                      {/* 飘落效果 */}
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute top-0 left-1/2 w-2 h-2 bg-yellow-400 rounded-full"
                          animate={{
                            y: [0, 100],
                            x: [0, (Math.random() - 0.5) * 100],
                            opacity: [1, 0],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            delay: i * 0.3,
                            ease: "easeIn"
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* 徐棋隐藏卡特效 */}
                <AnimatePresence>
                  {showXqCard && (
                    <motion.div
                      key="xq-card"
                      initial={{ opacity: 0, scale: 0.5, y: -100 }}
                      animate={{
                        opacity: 1,
                        scale: [0.5, 1.2, 1],
                        y: 0,
                      }}
                      exit={{ opacity: 0, scale: 0.5, y: 100 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
                    >
                      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white px-12 py-8 rounded-3xl shadow-2xl border-4 border-yellow-400 relative overflow-hidden">
                        {/* 背景光晕 */}
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 via-transparent to-yellow-400/20 animate-pulse" />

                        {/* 顶部图标 */}
                        <motion.div
                          className="flex justify-center gap-4 mb-4"
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <motion.div
                            animate={{ rotate: [0, 360] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          >
                            <Sparkles className="w-8 h-8 text-yellow-300" />
                          </motion.div>
                          <img src="/slot-symbols/xq.jpg" alt="徐棋" className="w-16 h-16 rounded-full border-4 border-yellow-300 shadow-lg" />
                          <motion.div
                            animate={{ rotate: [360, 0] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          >
                            <Sparkles className="w-8 h-8 text-yellow-300" />
                          </motion.div>
                        </motion.div>

                        {/* 文字 */}
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="text-center"
                        >
                          <div className="text-3xl font-bold mb-2 bg-gradient-to-r from-yellow-300 to-yellow-100 bg-clip-text text-transparent">
                            🎴 徐棋隐藏卡！
                          </div>
                          <div className="text-5xl font-extrabold mb-2 text-yellow-300">
                            ✨ 十倍奖励 ✨
                          </div>
                          <div className="text-2xl font-bold text-yellow-100">
                            恭喜获得 {formatCoins(Math.floor(progressiveJackpot / 2))} 金币！
                          </div>
                        </motion.div>

                        {/* 飘落特效 */}
                        {[...Array(20)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                            style={{
                              left: `${Math.random() * 100}%`,
                              top: '-10px',
                            }}
                            animate={{
                              y: [0, 400],
                              opacity: [1, 1, 0],
                            }}
                            transition={{
                              duration: 2 + Math.random(),
                              repeat: Infinity,
                              delay: Math.random() * 2,
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {showWin && !showJackpot && (
                  <motion.div
                    key="win"
                    initial={{ opacity: 0, scale: 0.5, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 50 }}
                    className="text-center py-2"
                  >
                    <div className={`bg-gradient-to-r ${
                      winType === 'punishment' ? 'from-red-600 to-red-400' :
                      winType === 'special' ? 'from-purple-600 to-purple-400' :
                      winType === 'three' ? 'from-blue-500 to-blue-400' :
                      winType === 'two' ? 'from-green-500 to-green-400' :
                      'from-gray-400 to-gray-600'
                    } text-white px-4 py-2 rounded-full inline-block shadow-xl`}>
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 md:w-6 md:h-6" />
                          <span className="font-bold text-xs md:text-sm">
                            {winType === 'punishment' && '⚠️ 惩罚！'}
                            {winType === 'three' && '🎉 三连大奖！'}
                            {winType === 'two' && '✨ 二连中奖！'}
                            {winType === 'special' && '🏆 超级大奖！'}
                            {lastWin > 0 && `赢得 ${formatCoins(lastWin)} 金币！`}
                            {lastWin < 0 && `扣除 ${formatCoins(Math.abs(lastWin))} 金币！`}
                            {lastWin === 0 && !winType && '未中奖'}
                          </span>
                          <Star className="w-4 h-4 md:w-6 md:h-6" />
                        </div>
                        {resultName && (
                          <span className="text-xs text-white/90">
                            {resultName}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 旋转按钮 - 移动到投注区上方 */}
          <div className="text-center mb-6">
            <button
              onClick={spin}
              disabled={isPlaying || coins < bet * multiplier}
              className={`px-8 py-4 rounded-full font-bold text-lg transition-all transform hover:scale-105 active:scale-95 shadow-2xl ${
                isPlaying || coins < bet * multiplier
                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white hover:shadow-xl'
              }`}
            >
              {isPlaying ? (
                <span className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  旋转中...
                </span>
              ) : (
                <span className="flex items-center gap-3">
                  <Zap className="w-6 h-6" />
                  旋转 (💰{formatCoins(bet)})
                  {multiplier > 1 && <span className="text-yellow-300 text-sm">({multiplier}x)</span>}
                </span>
              )}
            </button>
          </div>

          {/* 下注控制 - 独立一行 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-4">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-center justify-center text-lg">
              <Coins className="w-6 h-6 text-yellow-400" />
              刺激投注区
              <Coins className="w-6 h-6 text-yellow-400" />
            </h3>

            {/* 投注金额选择 - 新的刺激方案 */}
            <div className="mb-4">
              <div className="text-center text-sm text-gray-300 mb-2 font-semibold">选择投注金额</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[BET_CONFIG.DEFAULT_BET, 500, 1000, 5000, 10000, BET_CONFIG.MAX_BASE_BET].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setBet(amount)}
                    disabled={isPlaying || amount * multiplier > coins}
                    className={`py-3 px-4 rounded-xl font-bold text-sm transition-all transform hover:scale-105 shadow-lg relative overflow-hidden ${
                      bet === amount
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black shadow-xl ring-4 ring-yellow-400/50'
                        : amount === BET_CONFIG.MAX_BASE_BET
                        ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 text-white hover:from-yellow-500 hover:to-yellow-600 animate-pulse shadow-2xl ring-4 ring-yellow-500/30'
                        : amount === 10000
                        ? 'bg-gradient-to-r from-pink-600 to-pink-700 text-white hover:from-pink-500 hover:to-pink-600 shadow-lg'
                        : amount >= 5000
                        ? 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600'
                        : amount >= 1000
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-500 hover:to-purple-600'
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600'
                    } ${isPlaying || amount * multiplier > coins ? 'opacity-50 cursor-not-allowed transform-none' : ''}`}
                  >
                    {/* 背景光效 */}
                    <div className={`absolute inset-0 opacity-20 ${
                      bet === amount ? 'animate-pulse' : ''
                    }`}>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent"></div>
                    </div>

                    <div className="relative z-10">
                      <div className="text-base md:text-lg font-extrabold">{formatCoins(amount)}</div>
                      <div className="text-xs opacity-80">
                        {amount === 100 && '入门投注'}
                        {amount === 500 && '进阶投注'}
                        {amount === 1000 && '高手投注'}
                        {amount === 5000 && '🔥 极限挑战 🔥'}
                        {amount === 10000 && '💎 豪华投注 💎'}
                        {amount === BET_CONFIG.MAX_BASE_BET && `👑 至尊${multiplier === 5 ? '(5×)' : multiplier === 4 ? '(4×)' : '(×3)'}`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 倍数和连胜信息显示 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 倍数控制 */}
              <div>
                <div className="text-center text-sm text-gray-300 mb-2 font-semibold">倍数加成</div>
                <div className="flex gap-2">
                  {[1, 2, 3, 5].map(mult => (
                    <button
                      key={mult}
                      onClick={() => setMultiplier(mult)}
                      disabled={isPlaying || bet * mult > coins}
                      className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                        multiplier === mult
                          ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      } ${isPlaying || bet * mult > coins ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {mult}x
                    </button>
                  ))}
                </div>
              </div>

              {/* 当前投注信息 */}
              <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 rounded-lg p-3 border border-yellow-500/30">
                <div className="text-center">
                  <div className="text-xs text-gray-300 mb-1">当前投注</div>
                  <div className="text-lg font-extrabold text-yellow-400">
                    {formatCoins(bet * multiplier)}
                    <span className="text-xs text-yellow-300 ml-1">({bet}×{multiplier})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 连胜显示 */}
            {winStreak > 0 && (
              <div className="mt-4 text-center bg-gradient-to-r from-orange-600/20 to-red-600/20 rounded-lg p-3 border border-orange-500/30">
                <div className="text-sm font-bold text-orange-400">
                  🔥 连胜 {winStreak} 次！奖励加成 +{Math.floor(winStreak * 10)}%
                </div>
              </div>
            )}
          </div>

          {/* 游戏设置 - 独立一行 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 mb-4">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
              <Cog className="w-4 h-4" />
              游戏设置
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="bg-white/20 hover:bg-white/30 text-white py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="text-xs">音效</span>
              </button>
              <button
                onClick={() => setBgMusicEnabled(!bgMusicEnabled)}
                className={`py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1 ${
                  bgMusicEnabled
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
                title={bgMusicEnabled ? `当前播放: ${bgMusicNames[currentBgMusicIndex] || '未知'}` : '背景音乐已关闭 - 点击开启以享受游戏音乐'}
              >
                <div className={`relative ${bgMusicEnabled ? 'text-white' : 'opacity-50'}`}>
                  <Music className="w-4 h-4" />
                  {bgMusicEnabled && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  )}
                </div>
                <span className="text-xs">
                  {bgMusicEnabled ? `音乐${currentBgMusicIndex + 1}` : '音乐关'}
                </span>
              </button>
              <button
                onClick={() => setAutoPlay(!autoPlay)}
                disabled={coins < bet || penaltyStatus.isActive}
                className={`py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1 ${
                  autoPlay
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                } ${(coins < bet || penaltyStatus.isActive) ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={autoPlay ? "自动播放中（每分钟最多30次）" : penaltyStatus.isActive ? "惩罚激活中，无法自动播放" : "开启自动播放"}
              >
                <Play className="w-4 h-4" />
                <span className="text-xs">{autoPlay ? '自动中' : '自动'}</span>
              </button>
              <button
                className={`py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1 ${
                  penaltyStatus.isActive
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg animate-pulse'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
                title={penaltyStatus.isActive ? `惩罚激活中！律师函概率${penaltyStatus.multiplier}倍` : "无惩罚状态"}
              >
                <span className="text-xl">⚠️</span>
                <span className="text-xs text-center">
                  {penaltyStatus.isActive
                    ? `惩罚${penaltyStatus.multiplier}x`
                    : '正常'
                  }
                </span>
              </button>
            </div>

            {/* 惩罚状态详情 */}
            {penaltyStatus.isActive && (
              <div className="mt-2 p-2 bg-red-500/20 border border-red-400 rounded-lg text-center">
                <div className="text-xs text-red-200 space-y-1">
                  <div className="font-bold text-red-100">
                    ⚠️ 惩罚激活中
                  </div>
                  <div>
                    律师函概率: {penaltyStatus.multiplier}倍
                  </div>
                  <div>
                    剩余时间: {Math.ceil(penaltyStatus.remainingTime / 1000 / 60)}分钟
                  </div>
                  {penaltyStatus.violationCount > 1 && (
                    <div className="text-red-300">
                      第 {penaltyStatus.violationCount} 次违规
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

  
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 游戏规则 - 原网站规则 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
                <Gift className="w-4 h-4" />
                游戏规则 (4转轴)
              </h3>
              <div className="space-y-1 text-xs text-gray-300 max-h-48 overflow-y-auto">
                <div className="space-y-1">
                  <p className="font-bold text-purple-400">🎯 超级大奖 (128x):</p>
                  <div className="ml-2 space-y-1">
                    <div>• 姬霓太美 (j→n→t→m): 精确顺序</div>
                    <div>• 篮球大使 (bj→zft→bdk→lq): 精确顺序</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-pink-400">🎊 大奖 (16x):</p>
                  <div className="ml-2 space-y-1">
                    <div>• 鸡你不太美 (j,n,t,m): 包含即可</div>
                    <div>• 厉不厉害你坤哥 (bj,zft,bdk,lq): 包含即可</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-yellow-400">🏆 特殊奖励:</p>
                  <div className="ml-2 space-y-1">
                    <div>• 4坤 (4个美): 50x <span className="text-red-400">[独立奖励]</span></div>
                    <div>• 4🐔 (任意4个相同): 32x</div>
                    <div>• 3坤 (3个美): 18x</div>
                    <div>• 普通3🐔 (任意3个相同): 8x</div>
                    <div>• 🔄 对称奖励 (ABBA): 10x</div>
                    <div>• 2坤 (2个美): 10x <span className="text-green-400">[可组合]</span></div>
                    <div>• 普通双🐔 (任意2个相同): 4x</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-red-600">🎯 侯总特殊奖励:</p>
                  <div className="ml-2 space-y-1">
                    <div>• 4侯总: 200x <span className="text-purple-400">[视频弹窗 + 奖池翻倍]</span></div>
                    <div>• 3侯总: 100x <span className="text-purple-400">[视频弹窗 + 奖池翻倍]</span></div>
                    <div>• 2侯总: 50x <span className="text-purple-400">[视频弹窗 + 奖池翻倍]</span></div>
                    <div>• 抽到2个以上侯总自动播放视频，奖池翻倍，奖励翻倍</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-red-400">⚖️ 惩罚机制:</p>
                  <div className="ml-2 space-y-1">
                    <div>• 1律师函: 扣除2倍投注 (多扣1倍)</div>
                    <div>• 2律师函: 扣除3倍投注 (多扣2倍)</div>
                    <div>• 3律师函: 扣除3倍 + 累积大奖减半</div>
                    <div>• 4律师函: 扣除4倍 + 累积大奖清空</div>
                    <div>• <span className="text-orange-400">基础概率: 2.86% (已提高一倍)</span></div>
                    <div>• <span className="text-red-400">动态调整: 金币&gt;1000w时再提高2倍</span></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-blue-400">📐 奖励规则:</p>
                  <div className="ml-2 space-y-1">
                    <div>• <span className="text-red-400">独立奖励</span>: 只取最高奖励</div>
                    <div>• <span className="text-green-400">可组合奖励</span>: 可与其他奖励累加</div>
                    <div>• 普通奖励: 取最高，不累加</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-green-400">📊 权重配置 (总权重1048 + 动态调整):</p>
                  <div className="ml-2 space-y-1">
                    <div>• 姬/霓/太/美: 各140权重 (13.36%)</div>
                    <div>• 中分头: 80权重 (7.63%)</div>
                    <div>• 篮球: 70权重 (6.68%)</div>
                    <div>• 中分头(特殊): 100权重 (9.54%)</div>
                    <div>• 背带裤: 90权重 (8.59%)</div>
                    <div>• 律师函: <span className="text-red-400">30-60权重 (2.86-5.71%) - 动态调整</span></div>
                    <div>• 🎴 徐棋: <span className="text-yellow-400">10权重 (0.95%) - 隐藏卡</span></div>
                    <div>• 🎯 侯总(4种变体): <span className="text-red-400">10-50权重/种 (总计3.82-19.1%) - 动态调整</span></div>
                    <div>• &nbsp;&nbsp;- 侯总当权、开蚌、蝙蝠侠、望远镜</div>
                    <div>• <span className="text-purple-400">⚡ 动态规则: 救济模式下侯总概率提高5倍</span></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-indigo-400">🎴 徐棋隐藏卡:</p>
                  <div className="ml-2 space-y-1">
                    <div>• 出现概率: 1.00% (极稀有)</div>
                    <div>• 奖励机制: 如果有其他奖励，所有奖励×10</div>
                    <div>• 如果无其他奖励，至少获得10倍投注</div>
                    <div>• 触发时自动获得一半累积大奖池</div>
                    <div>• 特殊视觉效果，极具戏剧性</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-red-500">🎯 侯总特殊卡 (4种变体):</p>
                  <div className="ml-2 space-y-1">
                    <div>• 基础概率: 总计3.82% (稀有) <span className="text-orange-400">[概率提高5倍]</span></div>
                    <div>• 4种变体: 当权、开蚌、蝙蝠侠、望远镜</div>
                    <div>• 触发条件: 抽到2个或以上任意侯总变体</div>
                    <div>• 特殊效果: 自动播放侯总视频弹窗</div>
                    <div>• 奖池翻倍: 累积大奖池直接翻倍</div>
                    <div>• 奖励翻倍: 当前奖励金额翻倍</div>
                    <div>• 视频时长: 8秒自动播放，可手动关闭</div>
                    <div>• 视觉效果: 华丽动画和音效</div>
                    <div>• 混合奖励: 不同侯总变体可组合触发奖励</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-purple-500">⚖️ 动态规则 (当前状态):</p>
                  <div className="ml-2 space-y-1">
                    <div>• 🎯 侯总概率: {typeof window !== 'undefined' && coins < 1000000 ? <span className="text-green-400">提高5倍 (救济模式)</span> : <span className="text-gray-400">标准概率</span>}</div>
                    <div>• ⚖️ 律师函概率: {typeof window !== 'undefined' && coins >= 10000000 ? <span className="text-red-400">提高2倍 (平衡模式)</span> : <span className="text-gray-400">标准概率</span>}</div>
                    <div>• 💎 当前金币: {formatCoins(coins)}</div>
                    <div>• 📈 规则说明: 金币&lt;100w时侯总强力助力，金币&gt;1000w时律师函平衡</div>
                  </div>
                </div>

                {/* 调试面板 - 仅开发环境显示 */}
                {typeof window !== 'undefined' && (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') && (
                  <div className="space-y-1">
                    <p className="font-bold text-yellow-400">🔧 调试信息:</p>
                    <div className="ml-2 space-y-1 bg-gray-800/50 p-2 rounded text-xs">
                      <div>• 环境: {process.env.NODE_ENV || 'unknown'}</div>
                      <div>• 模式: {getDebugInfoCallback().isReliefMode ? '救济模式' : '标准模式'}</div>
                      <div>• 当前金币: {formatCoins(getDebugInfoCallback().coins)}</div>
                      <div>• 侯总总权重: {getDebugInfoCallback().hzTotalWeight}</div>
                      <div>• 总权重: {getDebugInfoCallback().totalWeight}</div>
                      <div>• 侯总概率: {getDebugInfoCallback().hzPercentage}%</div>
                      <div>• 侯总变体: {getDebugInfoCallback().hzWeights.map((w: any) => `${w.variant}(${w.weight})`).join(', ')}</div>
                      <div>• 律师函权重: {getDebugInfoCallback().lawyerWeight}</div>
                      <div className="mt-2 pt-2 border-t border-gray-600">
                        <button
                          onClick={testSymbolGeneration}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs transition-colors"
                        >
                          🧪 测试100次生成
                        </button>
                        <span className="text-gray-400 ml-2">检查侯总实际出现率</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="font-bold text-orange-400">💰 累积大奖:</p>
                  <div className="ml-2 space-y-1">
                    <div>• 每次下注的50%进入累积奖池</div>
                    <div>• 中超级大奖(≥50x)可赢取一半累积奖池</div>
                    <div>• 累积奖池保留一半，继续累积</div>
                    <div>• 3-4张律师函会减少累积奖池</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 历史记录 */}
            {spinHistory.length > 0 && (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
                  <Star className="w-4 h-4" />
                  最近记录 (最近10次)
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
                  {spinHistory.map((record, index) => (
                    <div key={index} className="flex items-center justify-between text-xs bg-white/5 rounded p-2 hover:bg-white/10 transition-colors">
                      <div className="flex gap-1">
                        {record.symbols.slice(0, 4).map((symbolId, i) => {
                          const symbol = SYMBOLS.find(s => s.id === symbolId);
                          return symbol ? (
                            <img
                              key={i}
                              src={symbol.image}
                              alt={symbol.name}
                              className="w-5 h-5 object-contain"
                            />
                          ) : null;
                        })}
                        {record.symbols.length > 4 && (
                          <span className="text-gray-400 text-xs">...</span>
                        )}
                      </div>
                      <span className={`font-bold ${
                        record.win > 0 ? 'text-green-400' : record.win < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {record.win > 0 ? `+${formatCoins(record.win)}` : record.win < 0 ? `-${formatCoins(Math.abs(record.win))}` : '未中奖'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 幸运轮盘 */}
          <AnimatePresence>
            {showLuckyWheel && luckyWheelReward && (
              <motion.div
                key="lucky-wheel"
                initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 180 }}
                transition={{ duration: 0.3 }}
                className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40"
              >
                <div className="bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 p-6 rounded-2xl shadow-2xl text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    className="text-4xl mb-2"
                  >
                    🎡
                  </motion.div>
                  <h3 className="text-xl font-bold text-white mb-1">幸运轮盘！</h3>
                  <p className="text-sm text-white mb-2">连续未中奖安慰奖</p>
                  <div className="bg-white/20 rounded-lg p-3">
                    <div className="text-2xl font-bold text-white">{luckyWheelReward.name}</div>
                    {luckyWheelReward.betRefund && (
                      <div className="text-sm text-yellow-200 mt-1">
                        + 投注返还 {luckyWheelReward.betRefund} 金币
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
            {showChestNotif && (
              <motion.div
                key="chest-notification"
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 rounded-full shadow-xl"
              >
                <div className="flex items-center gap-2 text-white font-bold">
                  <Gift className="w-5 h-5" />
                  <span>获得1个宝箱！</span>
                </div>
              </motion.div>
            )}
            {showLeaderboard && (
              <motion.div
                key="leaderboard"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
                onClick={() => setShowLeaderboard(false)}
              >
                <motion.div
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  exit={{ y: 20 }}
                  className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-yellow-400" />
                      排行榜
                    </h3>
                    <button
                      onClick={() => setShowLeaderboard(false)}
                      className="p-1 hover:bg-gray-700 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* 排行榜类型切换 */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => fetchLeaderboard('coins')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
                        leaderboardType === 'coins'
                          ? 'bg-yellow-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      金币榜
                    </button>
                    <button
                      onClick={() => fetchLeaderboard('biggestWin')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
                        leaderboardType === 'biggestWin'
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      最大赢取
                    </button>
                    <button
                      onClick={() => fetchLeaderboard('totalWins')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
                        leaderboardType === 'totalWins'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      获胜次数
                    </button>
                  </div>

                  {/* 排行榜列表 */}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {leaderboard.length === 0 ? (
                      <div className="text-center text-gray-400 py-8">暂无数据</div>
                    ) : (
                      leaderboard.map((user, index) => (
                        <div
                          key={user.username}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            index === 0
                              ? 'bg-gradient-to-r from-yellow-600/30 to-yellow-500/30 border border-yellow-500/50'
                              : index === 1
                              ? 'bg-gradient-to-r from-gray-600/30 to-gray-500/30 border border-gray-500/50'
                              : index === 2
                              ? 'bg-gradient-to-r from-orange-600/30 to-orange-500/30 border border-orange-500/50'
                              : 'bg-gray-700/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                index === 0
                                  ? 'bg-yellow-500 text-white'
                                  : index === 1
                                  ? 'bg-gray-400 text-white'
                                  : index === 2
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-gray-600 text-gray-300'
                              }`}
                            >
                              {index + 1}
                            </div>
                            <div>
                              <div className="text-white font-bold">{user.username}</div>
                              <div className="text-xs text-gray-400">
                                {leaderboardType === 'coins' && `${formatCoins(user.coins)} 金币`}
                                {leaderboardType === 'biggestWin' && `最大赢取 ${formatCoins(user.biggestWin)}`}
                                {leaderboardType === 'totalWins' && `${user.totalWins} 次获胜`}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-yellow-400">
                              {leaderboardType === 'coins' && formatCoins(user.coins)}
                              {leaderboardType === 'biggestWin' && formatCoins(user.biggestWin)}
                              {leaderboardType === 'totalWins' && user.totalWins}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
            {showUserPanel && (
              <motion.div
                key="user-panel"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
                onClick={() => setShowUserPanel(false)}
              >
                <motion.div
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  exit={{ y: 20 }}
                  className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Cog className="w-5 h-5" />
                      用户管理
                    </h3>
                    <button
                      onClick={() => setShowUserPanel(false)}
                      className="p-1 hover:bg-gray-700 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* 用户统计 */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-yellow-400">{formatCoins(coins)}</div>
                      <div className="text-sm text-gray-300">当前金币</div>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">{totalWins}</div>
                      <div className="text-sm text-gray-300">获胜次数</div>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{formatCoins(biggestWin)}</div>
                      <div className="text-sm text-gray-300">最大赢取</div>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">{chestCount}</div>
                      <div className="text-sm text-gray-300">宝箱数量</div>
                    </div>
                  </div>

                  
                  {/* 操作按钮 */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-300 mb-2 block">重置账户（选择初始金币）</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => resetAccount(500)}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                        >
                          500金币
                        </button>
                        <button
                          onClick={() => resetAccount(1000)}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                        >
                          1000金币
                        </button>
                        <button
                          onClick={() => resetAccount(5000)}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                        >
                          5000金币
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowUserPanel(false)}
                      className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="mt-4 text-xs text-gray-400 text-center">
                    提示：重置账户将清空所有游戏记录和统计数据
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>
    </div>
  );
}

