'use client';

import { AnimatePresence,motion } from 'framer-motion';
import { Trophy, Volume2, VolumeX,X } from 'lucide-react';
import React, { useCallback, useEffect, useRef,useState } from 'react';

import './FruitMachine.css';

import { BettingPanel } from './BettingPanel';
import { BigOrSmallGame } from './BigOrSmallGame';
import { ControlPanel } from './ControlPanel';
import { FruitBoard } from './FruitBoard';
import { ScoreDisplay } from './ScoreDisplay';
import { SoundManager } from './SoundManager';
import {
  type BetButtonState,
  type GameRecord,
  type WinResult,
  FRUIT_TYPES,
  GAME_CONFIG,
  WIN_MULTIPLIERS} from '../../lib/fruit-machine-config';

interface FruitMachineProps {
  coins: number;
  onCoinsChange: (newCoins: number) => void;
  onClose: () => void;
}

export function FruitMachine({ coins, onCoinsChange, onClose }: FruitMachineProps) {
  // 基础游戏状态
  const [ownedScore, setOwnedScore] = useState(coins);
  const [rewardScore, setRewardScore] = useState(0);
  const [currentLightPosition, setCurrentLightPosition] = useState(0);
  const [winFruitList, setWinFruitList] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // 大小游戏状态
  const [showBigOrSmall, setShowBigOrSmall] = useState(false);
  const [bigOrSmallNumber, setBigOrSmallNumber] = useState(0);
  const [isBigOrSmallBtnSwitch, setIsBigOrSmallBtnSwitch] = useState(false);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);

  // 投注按钮状态
  const [betButtons, setBetButtons] = useState<BetButtonState[]>(
    FRUIT_TYPES.map(fruit => ({
      fruitId: fruit.id,
      betAmount: 0,
      isActive: false,
      isWinning: false
    }))
  );

  // 游戏历史
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [lastWinResult, setLastWinResult] = useState<WinResult | null>(null);

  // 定时器引用
  const spinningTimer = useRef<NodeJS.Timeout | null>(null);
  const autoPlayTimer = useRef<NodeJS.Timeout | null>(null);
  const soundManager = useRef<SoundManager | null>(null);

  // 初始化音效管理器
  useEffect(() => {
    soundManager.current = new SoundManager(soundEnabled);
    return () => {
      if (soundManager.current) {
        soundManager.current.stopAll();
      }
    };
  }, [soundEnabled]);

  // 同步外部金币变化
  useEffect(() => {
    setOwnedScore(coins);
  }, [coins]);

  // 更新外部金币
  const updateCoins = useCallback((newCoins: number) => {
    setOwnedScore(newCoins);
    onCoinsChange(newCoins);
  }, [onCoinsChange]);

  // 投注功能
  const handleBet = useCallback((fruitId: string, amount: number) => {
    if (isPlaying || ownedScore < amount) {
      soundManager.current?.play('error');
      return;
    }

    setBetButtons(prev => prev.map(btn => {
      if (btn.fruitId === fruitId) {
        const newAmount = Math.min(btn.betAmount + amount, GAME_CONFIG.maxBet);
        const actualAmount = newAmount - btn.betAmount;

        if (actualAmount > 0 && ownedScore >= actualAmount) {
          updateCoins(ownedScore - actualAmount);
          soundManager.current?.play('bet');
          return { ...btn, betAmount: newAmount, isActive: newAmount > 0 };
        }
      }
      return btn;
    }));
  }, [isPlaying, ownedScore, updateCoins]);

  // 快速投注（长按连续投注）
  const handleQuickBet = useCallback((fruitId: string) => {
    const quickBetInterval = setInterval(() => {
      handleBet(fruitId, GAME_CONFIG.defaultBet);
    }, 100);

    const stopQuickBet = () => {
      clearInterval(quickBetInterval);
    };

    // 鼠标松开或触摸结束时停止
    document.addEventListener('mouseup', stopQuickBet, { once: true });
    document.addEventListener('touchend', stopQuickBet, { once: true });
  }, [handleBet]);

  // 开始游戏
  const startGame = useCallback(() => {
    const totalBet = betButtons.reduce((sum, btn) => sum + btn.betAmount, 0);

    if (totalBet === 0) {
      soundManager.current?.play('error');
      return;
    }

    setIsPlaying(true);
    setShowResult(false);
    setWinFruitList([]);
    setBetButtons(prev => prev.map(btn => ({ ...btn, isWinning: false })));

    soundManager.current?.play('start');

    // 模拟灯光旋转
    let position = 0;
    const spins = 30 + Math.floor(Math.random() * 10); // 30-40圈

    spinningTimer.current = setInterval(() => {
      position++;
      setCurrentLightPosition(position % 24);

      if (position >= spins) {
        clearInterval(spinningTimer.current!);
        spinningTimer.current = null;

        // 判定结果
        const winPositions = [
          Math.floor(Math.random() * 24),
          (Math.floor(Math.random() * 24) + 8) % 24,
          (Math.floor(Math.random() * 24) + 16) % 24
        ];

        const winFruits = winPositions.map(pos => FRUIT_TYPES[pos % FRUIT_TYPES.length].id);
        setWinFruitList(winFruits);

        // 计算中奖金额
        let totalWin = 0;
        const winningButtons: string[] = [];

        winFruits.forEach(fruitId => {
          const button = betButtons.find(btn => btn.fruitId === fruitId);
          if (button && button.betAmount > 0) {
            const multiplier = WIN_MULTIPLIERS.single[fruitId as keyof typeof WIN_MULTIPLIERS.single] || 5;
            const win = button.betAmount * multiplier;
            totalWin += win;
            winningButtons.push(fruitId);
          }
        });

        if (totalWin > 0) {
          setRewardScore(totalWin);
          setBetButtons(prev => prev.map(btn => ({
            ...btn,
            isWinning: winningButtons.includes(btn.fruitId)
          })));

          soundManager.current?.play('win');

          // 显示大小游戏选项
          setTimeout(() => {
            setShowBigOrSmall(true);
            setBigOrSmallNumber(Math.floor(Math.random() * 14) + 1);
            setIsBigOrSmallBtnSwitch(true);
          }, 1000);
        } else {
          soundManager.current?.play('lose');
          if (autoPlay) {
            setTimeout(resetGame, GAME_CONFIG.autoPlayDelay);
          }
        }

        // 记录游戏历史
        const record: GameRecord = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          betAmount: totalBet,
          winAmount: totalWin,
          fruitType: winFruits[0],
          multiplier: totalWin > 0 ? totalWin / totalBet : 0
        };

        setGameHistory(prev => [record, ...prev.slice(0, 9)]);

        setIsPlaying(false);

        if (totalWin === 0) {
          setTimeout(() => setShowResult(true), 500);
        }
      }
    }, GAME_CONFIG.lightSpeed);
  }, [betButtons, autoPlay, soundManager]);

  // 大小游戏
  const handleBigOrSmall = useCallback((isBig: boolean) => {
    setIsBigOrSmallBtnSwitch(false);

    setTimeout(() => {
      const won = isBig
        ? GAME_CONFIG.bigOrSmallRange.big.includes(bigOrSmallNumber)
        : GAME_CONFIG.bigOrSmallRange.small.includes(bigOrSmallNumber);

      if (won) {
        const doubledReward = rewardScore * WIN_MULTIPLIERS.bigOrSmall;
        setRewardScore(doubledReward);
        setCurrentMultiplier(WIN_MULTIPLIERS.bigOrSmall);
        soundManager.current?.play('bigWin');
      } else {
        setRewardScore(0);
        setCurrentMultiplier(0);
        soundManager.current?.play('lose');
      }

      setShowBigOrSmall(false);

      setTimeout(() => {
        if (autoPlay && rewardScore > 0) {
          setTimeout(resetGame, GAME_CONFIG.autoPlayDelay);
        }
      }, 1000);
    }, 1000);
  }, [bigOrSmallNumber, rewardScore, autoPlay]);

  // 收分
  const collectReward = useCallback(() => {
    if (rewardScore > 0) {
      updateCoins(ownedScore + rewardScore);
      soundManager.current?.play('collect');

      if (autoPlay) {
        setTimeout(resetGame, GAME_CONFIG.autoPlayDelay);
      }
    }

    setRewardScore(0);
    setShowResult(false);
    setLastWinResult(null);
    setCurrentMultiplier(1);
  }, [rewardScore, ownedScore, updateCoins, autoPlay]);

  // 重置游戏
  const resetGame = useCallback(() => {
    setBetButtons(prev => prev.map(btn => ({
      ...btn,
      betAmount: 0,
      isActive: false,
      isWinning: false
    })));
    setRewardScore(0);
    setWinFruitList([]);
    setShowResult(false);
    setLastWinResult(null);
    setCurrentMultiplier(1);
    setCurrentLightPosition(0);

    if (autoPlay && !isPlaying) {
      startGame();
    }
  }, [autoPlay, isPlaying]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (spinningTimer.current) {
        clearInterval(spinningTimer.current);
      }
      if (autoPlayTimer.current) {
        clearTimeout(autoPlayTimer.current);
      }
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
      <div className="bg-gradient-to-br from-green-900 via-green-800 to-green-900 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border-4 border-yellow-500">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-6 h-6" />
            水果机
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-white" /> : <VolumeX className="w-5 h-5 text-white" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* 积分显示 */}
        <ScoreDisplay
          ownedScore={ownedScore}
          rewardScore={rewardScore}
          multiplier={currentMultiplier}
        />

        {/* 游戏主区域 */}
        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 水果盘面 */}
          <div className="lg:col-span-2">
            <FruitBoard
              lightPosition={currentLightPosition}
              winFruits={winFruitList}
              isPlaying={isPlaying}
            />
          </div>

          {/* 控制面板 */}
          <div className="space-y-4">
            <BettingPanel
              betButtons={betButtons}
              onBet={handleBet}
              onQuickBet={handleQuickBet}
              disabled={isPlaying}
              coins={ownedScore}
            />

            <ControlPanel
              isPlaying={isPlaying}
              autoPlay={autoPlay}
              onToggleAutoPlay={setAutoPlay}
              onStart={startGame}
              onReset={resetGame}
              onCollect={rewardScore > 0 ? collectReward : undefined}
              disabled={betButtons.every(btn => btn.betAmount === 0)}
            />
          </div>
        </div>

        {/* 大小游戏 */}
        <AnimatePresence>
          {showBigOrSmall && (
            <BigOrSmallGame
              number={bigOrSmallNumber}
              isSwitching={isBigOrSmallBtnSwitch}
              onBigOrSmall={handleBigOrSmall}
              baseAmount={rewardScore}
            />
          )}
        </AnimatePresence>

        {/* 游戏结果显示 */}
        <AnimatePresence>
          {showResult && lastWinResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-80 text-white px-6 py-3 rounded-full"
            >
              {lastWinResult.totalWin > 0
                ? `恭喜赢得 ${lastWinResult.totalWin} 金币！`
                : '很遗憾，再接再厉！'
              }
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}