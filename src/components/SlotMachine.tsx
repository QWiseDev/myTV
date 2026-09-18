'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import './SlotMachine.css';

import type {
  LeaderboardItem,
  LuckyWheelReward,
  PenaltyStatus,
  SlotMessage,
  SlotWinType,
  SpinHistoryItem,
} from '@/lib/slot-machine-utils';
import {
  convertResultsToSymbols,
  formatCoins,
  generateRandomSequences,
  HOUZONG_IDS,
  initialPenaltyStatus,
  MI_CAR_IDS,
  SYMBOLS,
  validateBet,
} from '@/lib/slot-machine-utils';

import { SlotBetControls } from './slot-machine/SlotBetControls';
import { SlotHistoryPanel } from './slot-machine/SlotHistoryPanel';
import {
  type LeaderboardType,
  SlotLeaderboardModal,
} from './slot-machine/SlotLeaderboardModal';
import { SlotReels } from './slot-machine/SlotReels';
import {
  SlotChestNotification,
  SlotLuckyWheelOverlay,
} from './slot-machine/SlotRewardOverlays';
import { SlotRulesPanel } from './slot-machine/SlotRulesPanel';
import { SlotSettingsPanel } from './slot-machine/SlotSettingsPanel';
import { SlotSpinOverlays } from './slot-machine/SlotSpinOverlays';
import { SlotJackpotBanner, SlotTitleHeader } from './slot-machine/SlotTopBars';
import { SlotUserPanelModal } from './slot-machine/SlotUserPanelModal';
import { SlotWinBanners } from './slot-machine/SlotWinBanners';
import { useSlotBackgroundMusic, useSlotSound } from './slot-machine/useSlotAudio';
import { getDebugInfo, getRandomSymbol } from '../lib/slot-config';

interface SlotMachineProps {
  initialCoins?: number;
  showTitle?: boolean;
  compact?: boolean;
}

export default function SlotMachine({
  initialCoins = 10000,
  showTitle = true,
  compact = false,
}: SlotMachineProps) {
  const [coins, setCoins] = useState(initialCoins);
  const [bet, setBet] = useState(100); // 更新默认投注为100
  const [reels, setReels] = useState([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2], SYMBOLS[3]]);
  const [spinning, setSpinning] = useState([false, false, false, false]);
  const [scrollOffsets, setScrollOffsets] = useState([0, 0, 0, 0]);
  const [randomSymbolSequences, setRandomSymbolSequences] = useState<string[][]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [showWin, setShowWin] = useState(false);
  const [winType, setWinType] = useState<SlotWinType>(null);
  const [resultName, setResultName] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bgMusicEnabled, setBgMusicEnabled] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [spinHistory, setSpinHistory] = useState<SpinHistoryItem[]>([]);
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
  const [_loseStreak, setLoseStreak] = useState(0);
  const [chestCount, setChestCount] = useState(0);
  const [showLuckyWheel, setShowLuckyWheel] = useState(false);
  const [luckyWheelReward, setLuckyWheelReward] = useState<LuckyWheelReward | null>(null);
  const [message, setMessage] = useState<SlotMessage | null>(null);
  const [showChestNotif, setShowChestNotif] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>('coins');

  // 侯总视频弹窗和奖池翻倍状态
  const [showHouZongVideo, setShowHouZongVideo] = useState(false);
  const [showJackpotDouble, setShowJackpotDouble] = useState(false);
  const [jackpotDoubleAmount, setJackpotDoubleAmount] = useState(0);
  const [_isHouZongBonus, setIsHouZongBonus] = useState(false);

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
  const [penaltyStatus, setPenaltyStatus] = useState<PenaltyStatus>(initialPenaltyStatus);
  const [showPenaltyWarning, setShowPenaltyWarning] = useState(false);
  const [penaltyWarningMessage, setPenaltyWarningMessage] = useState('');

  const playSound = useSlotSound(soundEnabled);
  const { currentBgMusicIndex } = useSlotBackgroundMusic(bgMusicEnabled);

  // 消息提示函数
  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 旋转老虎机 - 调用后端API
  const spin = useCallback(async () => {
    if (coins < bet * multiplier || isPlaying) return;

    // 前端验证：检查实际投注金额（基础投注 × 倍率）是否超过限制
    const betCheck = validateBet(bet, multiplier);
    if (!betCheck.valid) {
      showMessage('error', betCheck.message || '投注金额超出限制');
      return;
    }
    setLastWin(0);
    setShowWin(false);
    setWinType(null);
    setShowJackpot(false);

    setIsPlaying(true);
    playSound('bet');
    playSound('spin');

    const actualBet = bet * multiplier;

    // 增加累积奖金池（每次下注的50%加入奖池，确保至少增加5金币）
    const jackpotIncrease = Math.max(5, Math.floor(actualBet * 0.5));
    setProgressiveJackpot(prev => prev + jackpotIncrease);

    // 启动4个转轴旋转
    setSpinning([true, true, true, true]);

    // 为每个转轴生成长随机符号序列，确保滚动连续
    setRandomSymbolSequences(generateRandomSequences());

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
      const resultSymbols = convertResultsToSymbols(data.results);

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
        const miCarCount = data.results.filter((s: string) => MI_CAR_IDS.includes(s)).length;
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
        setWinType('punishment');
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
          const houZongCount = data.results.filter((s: string) => HOUZONG_IDS.includes(s)).length;

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
  // 保持原始依赖数组不变：progressiveJackpot 通过闭包读取，与重构前行为一致
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const fetchLeaderboard = useCallback(async (type: LeaderboardType = 'coins') => {
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

  const debugInfo = getDebugInfoCallback();

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
        <SlotJackpotBanner jackpot={progressiveJackpot} showReduction={showJackpotReduction} />

        {/* 旋转结果全屏特效弹窗 */}
        <SlotSpinOverlays
          showJackpotReduction={showJackpotReduction}
          jackpotReductionAmount={jackpotReductionAmount}
          showPenaltyWarning={showPenaltyWarning}
          penaltyWarningMessage={penaltyWarningMessage}
          penaltyStatus={penaltyStatus}
          showJackpotDouble={showJackpotDouble}
          jackpotDoubleAmount={jackpotDoubleAmount}
          showHouZongVideo={showHouZongVideo}
          onCloseHouZongVideo={() => setShowHouZongVideo(false)}
          showLawyerGif={showLawyerGif}
          onCloseLawyerGif={() => setShowLawyerGif(false)}
          showMiCarGif={showMiCarGif}
          onCloseMiCarGif={() => setShowMiCarGif(false)}
          showTwoPunishmentGif={showTwoPunishmentGif}
          onCloseTwoPunishmentGif={() => setShowTwoPunishmentGif(false)}
          showLegalDepartmentGif={showLegalDepartmentGif}
          onCloseLegalDepartmentGif={() => setShowLegalDepartmentGif(false)}
          showSuperPenaltyMode={showSuperPenaltyMode}
          onCloseSuperPenaltyMode={() => setShowSuperPenaltyMode(false)}
          bet={bet}
          multiplier={multiplier}
        />

        {/* 标题和统计信息 */}
        <SlotTitleHeader
          showTitle={showTitle}
          coins={coins}
          totalWins={totalWins}
          biggestWin={biggestWin}
          chestCount={chestCount}
          showLeaderboard={showLeaderboard}
          onToggleLeaderboard={() => setShowLeaderboard(!showLeaderboard)}
          onFetchLeaderboard={() => fetchLeaderboard('coins')}
          onToggleUserPanel={() => setShowUserPanel(!showUserPanel)}
        />

        {/* 老虎机主体 */}
        <div className="bg-gradient-to-b from-red-800 to-red-900 rounded-xl p-4 mb-4 shadow-inner border-4 border-yellow-600">
          <div className="bg-black/50 rounded-lg p-4">
            {/* 转轴 - 4转轴系统 */}
            <SlotReels
              reels={reels}
              spinning={spinning}
              scrollOffsets={scrollOffsets}
              randomSymbolSequences={randomSymbolSequences}
            />

            {/* 中奖提示 */}
            <SlotWinBanners
              showJackpot={showJackpot}
              lastWin={lastWin}
              showXqCard={showXqCard}
              progressiveJackpot={progressiveJackpot}
              showWin={showWin}
              winType={winType}
              resultName={resultName}
            />
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
        <SlotBetControls
          bet={bet}
          onBetChange={setBet}
          multiplier={multiplier}
          onMultiplierChange={setMultiplier}
          coins={coins}
          isPlaying={isPlaying}
          winStreak={winStreak}
        />

        {/* 游戏设置 - 独立一行 */}
        <SlotSettingsPanel
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          bgMusicEnabled={bgMusicEnabled}
          onToggleMusic={() => setBgMusicEnabled(!bgMusicEnabled)}
          currentBgMusicIndex={currentBgMusicIndex}
          autoPlay={autoPlay}
          onToggleAutoPlay={() => setAutoPlay(!autoPlay)}
          penaltyStatus={penaltyStatus}
          coins={coins}
          bet={bet}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 游戏规则 - 原网站规则 */}
          <SlotRulesPanel
            coins={coins}
            debugInfo={debugInfo}
            onTestGeneration={testSymbolGeneration}
          />

          {/* 历史记录 */}
          {spinHistory.length > 0 && <SlotHistoryPanel history={spinHistory} />}
        </div>

        {/* 幸运轮盘/宝箱/排行榜/用户管理浮层 */}
        <AnimatePresence>
          {showLuckyWheel && luckyWheelReward && (
            <SlotLuckyWheelOverlay reward={luckyWheelReward} />
          )}
          {showChestNotif && <SlotChestNotification />}
          {showLeaderboard && (
            <SlotLeaderboardModal
              onClose={() => setShowLeaderboard(false)}
              leaderboard={leaderboard}
              leaderboardType={leaderboardType}
              onSelectType={fetchLeaderboard}
            />
          )}
          {showUserPanel && (
            <SlotUserPanelModal
              onClose={() => setShowUserPanel(false)}
              coins={coins}
              totalWins={totalWins}
              biggestWin={biggestWin}
              chestCount={chestCount}
              onResetAccount={resetAccount}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
