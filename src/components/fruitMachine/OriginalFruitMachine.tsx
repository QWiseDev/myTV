'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useRef,useState } from 'react';

import './OriginalFruitMachine.css';

import { SoundManager } from './SoundManager';

// 水果图标映射 - 使用emoji模拟原版图片效果
const FRUIT_ICONS = {
  1: '🍎', // 苹果
  2: '🍊', // 橙子
  3: '🍋', // 柠檬
  4: '🍉', // 西瓜
  5: '🔔', // 铃铛
  6: '⭐', // 星星
  7: '7️⃣', // 七七
  8: '🍇', // 葡萄
};

// 投注按钮图标映射
const BUTTON_ICONS = {
  1: '🍎', // 苹果
  2: '🍊', // 橙子
  3: '🍋', // 柠檬
  4: '🍉', // 西瓜
  5: '🔔', // 铃铛
  6: '⭐', // 星星
  7: '💎', // 钻石
  8: '7️⃣', // 七七
};

interface OriginalFruitMachineProps {
  coins: number;
  onCoinsChange: (newCoins: number) => void;
  onClose: () => void;
}

export default function OriginalFruitMachine({ coins, onCoinsChange, onClose }: OriginalFruitMachineProps) {
  const router = useRouter();

  // 音效管理器
  const soundManagerRef = useRef<SoundManager | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // 游戏状态
  const [ownedScore, setOwnedScore] = useState(coins);
  const [rewardScore, setRewardScore] = useState(0);
  const [currentLightPosition, setCurrentLightPosition] = useState(0);
  const [bigOrSmallNumber, setBigOrSmallNumber] = useState(0);
  const [isBigOrSmallBtnSwitch, setIsBigOrSmallBtnSwitch] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAuto, setActiveAuto] = useState(false);
  const [winFruitList, setWinFruitList] = useState<number[]>([]);
  const [isBigOrSmallRunning, setIsBigOrSmallRunning] = useState(false);

  // 投注按钮状态
  const [betButtons, setBetButtons] = useState([
    { num: 0, serial_number: 0 },
    { num: 0, serial_number: 0 },
    { num: 0, serial_number: 0 },
    { num: 0, serial_number: 0 },
    { num: 0, serial_number: 0 },
    { num: 0, serial_number: 0 },
    { num: 0, serial_number: 0 },
    { num: 0, serial_number: 0 },
  ]);

  // 定时器
  const runningTimer = useRef<NodeJS.Timeout | null>(null);
  const bigOrSmallTimer = useRef<NodeJS.Timeout | null>(null);
  const bigOrSmallBtnTimer = useRef<NodeJS.Timeout | null>(null);
  const autoTimeout = useRef<NodeJS.Timeout | null>(null);

  // 音效播放
  const playSound = useCallback((type: string) => {
    // 异步播放音效，不阻塞UI
    soundManagerRef.current?.play(type).catch(error => {
      console.warn('音效播放失败:', error);
    });
  }, []);

  // 音效停止
  const stopSound = useCallback(() => {
    soundManagerRef.current?.stopAll();
  }, []);

  // 切换音效开关
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newEnabled = !prev;
      soundManagerRef.current?.setEnabled(newEnabled);
      return newEnabled;
    });
  }, []);

  // 同步外部金币变化
  useEffect(() => {
    setOwnedScore(coins);
  }, [coins]);

  // 初始化音效管理器
  useEffect(() => {
    if (typeof window !== 'undefined') {
      soundManagerRef.current = new SoundManager(soundEnabled);
    }

    return () => {
      soundManagerRef.current?.dispose();
    };
  }, [soundEnabled]);

  // 更新外部金币
  const updateCoins = useCallback((newCoins: number) => {
    setOwnedScore(newCoins);
    onCoinsChange(newCoins);
    localStorage.setItem('userCoins', newCoins.toString());
    localStorage.setItem('slotMachineCoins', newCoins.toString());
  }, [onCoinsChange]);

  // 投注功能
  const handleBet = useCallback((index: number) => {
    if (isRunning || isBigOrSmallRunning) {
      playSound('error');
      return;
    }

    if (rewardScore > 0) {
      playSound('error');
      return;
    }

    const betAmount = 10; // 默认投注金额
    if (ownedScore < betAmount) {
      playSound('error');
      return;
    }

    if (betButtons[index].num < 999) {
      setBetButtons(prev => {
        const newButtons = [...prev];
        if (newButtons[index].num + betAmount <= 999) {
          newButtons[index].num += betAmount;
          newButtons[index].serial_number = index + 1;
          updateCoins(ownedScore - betAmount);
          playSound('bet');
        }
        return newButtons;
      });
    }
  }, [isRunning, isBigOrSmallRunning, rewardScore, ownedScore, betButtons, updateCoins]);

  // 长按投注
  const handleBetMouseDown = useCallback((index: number) => {
    const betAmount = 10; // 默认投注金额
    const longtouchTimer = setInterval(() => {
      if (betButtons[index].num < 999 && ownedScore >= betAmount) {
        if (betButtons[index].num + betAmount <= 999) {
          setBetButtons(prev => {
            const newButtons = [...prev];
            newButtons[index].num += betAmount;
            updateCoins(ownedScore - betAmount);
            return newButtons;
          });
        }
      }
    }, 100);

    const handleMouseUp = () => {
      clearInterval(longtouchTimer);
    };

    document.addEventListener('mouseup', handleMouseUp, { once: true });
    document.addEventListener('touchend', handleMouseUp, { once: true });
  }, [betButtons, ownedScore, updateCoins]);

  // 开始游戏
  const startGame = useCallback(() => {
    const totalBet = betButtons.reduce((sum, btn) => sum + btn.num, 0);

    if (totalBet === 0) {
      playSound('error');
      return;
    }

    if (rewardScore > 0) {
      playSound('error');
      return;
    }

    setIsRunning(true);
    stopSound();
    playSound('start');

    // 重置状态
    setWinFruitList([]);
    setBetButtons(prev => prev.map(btn => ({ ...btn, serial_number: 0 })));

    // 模拟灯光旋转
    let position = 0;
    const spins = 30 + Math.floor(Math.random() * 10);

    runningTimer.current = setInterval(() => {
      position++;
      setCurrentLightPosition(position % 24);

      if (position >= spins) {
        clearInterval(runningTimer.current!);
        runningTimer.current = null;
        setIsRunning(false);

        // 生成随机中奖结果
        const winPositions = [
          Math.floor(Math.random() * 24),
          (Math.floor(Math.random() * 24) + 8) % 24,
          (Math.floor(Math.random() * 24) + 16) % 24
        ];

        const winFruitIds = winPositions.map(pos => (pos % 8) + 1);
        setWinFruitList(winFruitIds);

        // 计算中奖金额
        let totalWin = 0;
        winFruitIds.forEach(fruitId => {
          const buttonIndex = fruitId - 1;
          if (betButtons[buttonIndex].num > 0) {
            const multiplier = fruitId * 2; // 简单倍率计算
            const win = betButtons[buttonIndex].num * multiplier;
            totalWin += win;
          }
        });

        if (totalWin > 0) {
          setRewardScore(totalWin);
          playSound('win');

          // 显示大小游戏
          setTimeout(() => {
            setBigOrSmallNumber(Math.floor(Math.random() * 14) + 1);
            setIsBigOrSmallBtnSwitch(true);
            setIsBigOrSmallRunning(true);
          }, 1000);
        } else {
          playSound('lose');
          if (activeAuto) {
            setTimeout(() => {
              resetGame();
              setTimeout(() => startGame(), 100);
            }, 2000);
          }
        }
      }
    }, 50); // 50ms间隔，与原版一致
  }, [betButtons, rewardScore, activeAuto, stopSound, playSound]);

  // 大小游戏
  const handleBigOrSmall = useCallback((isBig: boolean) => {
    setIsBigOrSmallBtnSwitch(false);

    setTimeout(() => {
      const won = isBig
        ? bigOrSmallNumber > 7
        : bigOrSmallNumber <= 7;

      if (won) {
        const doubledReward = rewardScore * 2;
        setRewardScore(doubledReward);
        playSound('bigWin');
      } else {
        setRewardScore(0);
        playSound('lose');
      }

      setIsBigOrSmallRunning(false);
      setIsBigOrSmallBtnSwitch(false);
      setBigOrSmallNumber(0);

      if (activeAuto && rewardScore > 0) {
        setTimeout(() => {
          collectScore();
          setTimeout(() => resetGame(), 1000);
          setTimeout(() => startGame(), 2000);
        }, 1500);
      }
    }, 1000);
  }, [bigOrSmallNumber, rewardScore, activeAuto, playSound]);

  // 收分
  const collectScore = useCallback(() => {
    if (rewardScore > 0) {
      updateCoins(ownedScore + rewardScore);
      playSound('collect');
    }

    setRewardScore(0);
    setBigOrSmallNumber(0);
    setIsBigOrSmallBtnSwitch(false);
    setIsBigOrSmallRunning(false);

    if (activeAuto) {
      setTimeout(() => {
        resetGame();
        setTimeout(() => startGame(), 1000);
      }, 1000);
    }
  }, [rewardScore, ownedScore, activeAuto, updateCoins, playSound]);

  // 重置游戏
  const resetGame = useCallback(() => {
    setBetButtons(prev => prev.map(btn => ({ ...btn, num: 0, serial_number: 0 })));
    setRewardScore(0);
    setWinFruitList([]);
    setBigOrSmallNumber(0);
    setIsBigOrSmallBtnSwitch(false);
    setIsBigOrSmallRunning(false);
    setCurrentLightPosition(0);
  }, []);

  // 自动模式
  const toggleAuto = useCallback(() => {
    if (activeAuto) {
      setActiveAuto(false);
      if (autoTimeout.current) {
        clearTimeout(autoTimeout.current);
        autoTimeout.current = null;
      }
    } else {
      setActiveAuto(true);
      if (!isRunning && !isBigOrSmallRunning) {
        startGame();
      }
    }
  }, [activeAuto, isRunning, isBigOrSmallRunning, startGame]);

  // 大小按钮和收分闪动
  const setBigOrSmallBtnTimer = useCallback(() => {
    setIsBigOrSmallBtnSwitch(true);
    bigOrSmallBtnTimer.current = setInterval(() => {
      setIsBigOrSmallBtnSwitch(prev => !prev);
    }, 100);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (runningTimer.current) clearInterval(runningTimer.current);
      if (bigOrSmallTimer.current) clearInterval(bigOrSmallTimer.current);
      if (bigOrSmallBtnTimer.current) clearInterval(bigOrSmallBtnTimer.current);
      if (autoTimeout.current) clearTimeout(autoTimeout.current);
      stopSound();
    };
  }, [stopSound]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="machine-main">
        {/* 顶部导航 */}
        <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center">
          <button
            onClick={() => router.push('/slot')}
            className="bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg hover:bg-opacity-70 transition-colors"
          >
            ← 返回老虎机
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="bg-black bg-opacity-50 text-white p-2 rounded-lg hover:bg-opacity-70 transition-colors"
              title={soundEnabled ? "关闭音效" : "开启音效"}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <div className="bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg">
              金币: {ownedScore.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 分数显示 */}
        <section className="score-container">
          <div className="score-item reward-score">
            <span className="score-text">{rewardScore}</span>
          </div>
          <div className="score-item owned-score">
            <span className="score-text">{ownedScore}</span>
          </div>
        </section>

        {/* 游戏面板 */}
        <section className="game-panel">
          <ul className="bet-list">
            {Array.from({ length: 24 }, (_, index) => {
              const position = index + 1;
              const fruitId = position % 8 === 0 ? 8 : position % 8;
              const isLightOn = (currentLightPosition === index ||
                (currentLightPosition - 1 === index && isRunning)) &&
                (true); // 简化判断逻辑

              return (
                <li
                  key={index}
                  className={`bet-item bet-item${position} ${
                    isLightOn ? 'light-on' : ''
                  } ${
                    winFruitList.includes(fruitId) ? 'winning' : ''
                  }`}
                >
                  {FRUIT_ICONS[fruitId as keyof typeof FRUIT_ICONS]}
                </li>
              );
            })}
          </ul>

          {/* 中心大图 */}
          <div className="big-item-image">
            {/* 这里可以放中心装饰图片 */}
          </div>

          {/* 大小游戏 */}
          <div className="big-or-small">
            <span className="big-or-small-number">
              {bigOrSmallNumber === 0 ? "" : bigOrSmallNumber}
            </span>
            <i
              className={`big-or-small-lighton ${
                bigOrSmallNumber === 0 ? 'display-none' : ''
              } ${
                bigOrSmallNumber <= 7 ? 'left' : 'right'
              }`}
            />
          </div>
        </section>

        {/* 功能按钮 */}
        <section className="bet-active-buttons">
          <div
            className={`button-circle reset-button ${activeAuto ? 'auto-launching-lock' : ''}`}
            onClick={resetGame}
          />
          <div
            className={`button-circle small-button ${isBigOrSmallBtnSwitch && !isBigOrSmallRunning ? 'btn-on' : ''}`}
            onClick={() => bigOrSmallNumber > 0 && !isBigOrSmallRunning ? handleBigOrSmall(false) : undefined}
          />
          <div
            className={`button-circle big-button ${isBigOrSmallBtnSwitch && !isBigOrSmallRunning ? 'btn-on' : ''}`}
            onClick={() => bigOrSmallNumber > 0 && !isBigOrSmallRunning ? handleBigOrSmall(true) : undefined}
          />
          <div
            className={`button-circle auto-button ${activeAuto ? 'auto-button-lock' : ''}`}
            onClick={toggleAuto}
          />
          <div
            className={`button-circle start-button ${rewardScore > 0 ? 'btn-on' : ''}`}
            onClick={rewardScore > 0 ? collectScore : startGame}
          />
          <div
            className={`button-rectangle ${rewardScore > 0 ? 'btn-on' : ''}`}
            onClick={rewardScore > 0 ? collectScore : undefined}
          />
        </section>

        {/* 投注数字显示 */}
        <section className="number-of-bet">
          {betButtons.map((button, index) => (
            <div key={index} className="number-count-item">
              {button.num}
            </div>
          ))}
        </section>

        {/* 投注按钮 */}
        <section className="bet-buttons">
          {betButtons.map((button, index) => (
            <div
              key={index}
              className={`bet-button-item bet-button-item${index + 1}`}
              onMouseDown={() => handleBetMouseDown(index)}
              onClick={() => handleBet(index)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}