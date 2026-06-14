'use client';

import { motion } from 'framer-motion';
import { Minus,Plus } from 'lucide-react';
import React from 'react';

import type { BetButtonState } from '../../lib/fruit-machine-config';
import { BETTING_BUTTONS, GAME_CONFIG } from '../../lib/fruit-machine-config';

interface BettingPanelProps {
  betButtons: BetButtonState[];
  onBet: (fruitId: string, amount: number) => void;
  onQuickBet: (fruitId: string) => void;
  disabled: boolean;
  coins: number;
}

export function BettingPanel({ betButtons, onBet, onQuickBet, disabled, coins }: BettingPanelProps) {
  const handleMouseDown = (fruitId: string) => {
    if (!disabled) {
      onQuickBet(fruitId);
    }
  };

  const handleBetIncrease = (fruitId: string) => {
    onBet(fruitId, GAME_CONFIG.defaultBet);
  };

  const handleBetDecrease = (fruitId: string) => {
    const button = betButtons.find(btn => btn.fruitId === fruitId);
    if (button && button.betAmount > 0) {
      onBet(fruitId, -Math.min(GAME_CONFIG.defaultBet, button.betAmount));
    }
  };

  const totalBet = betButtons.reduce((sum, btn) => sum + btn.betAmount, 0);

  return (
    <div className="bg-gradient-to-br from-red-800 to-red-900 rounded-xl p-4 shadow-xl">
      <h3 className="text-white text-lg font-bold mb-3 text-center">投注面板</h3>

      {/* 总投注显示 */}
      <div className="bg-black bg-opacity-30 rounded-lg p-2 mb-3 text-center">
        <div className="text-yellow-300 text-sm">总投注</div>
        <div className="text-white text-xl font-bold">{totalBet} 金币</div>
      </div>

      {/* 投注按钮网格 */}
      <div className="grid grid-cols-2 gap-2">
        {BETTING_BUTTONS.map((fruit) => {
          const buttonState = betButtons.find(btn => btn.fruitId === fruit.id);
          const canAfford = coins >= GAME_CONFIG.defaultBet;

          return (
            <motion.div
              key={fruit.id}
              className={`
                relative bg-white bg-opacity-10 rounded-lg p-3 border-2 transition-all
                ${buttonState?.isActive ? 'border-yellow-400 bg-opacity-20' : 'border-transparent'}
                ${buttonState?.isWinning ? 'border-green-400 bg-green-900 bg-opacity-30' : ''}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-opacity-20'}
              `}
              whileHover={!disabled ? { scale: 1.02 } : {}}
              whileTap={!disabled ? { scale: 0.98 } : {}}
              onMouseDown={() => handleMouseDown(fruit.id)}
            >
              {/* 水果图标 */}
              <div className="flex items-center justify-center mb-2">
                <span
                  className="text-2xl md:text-3xl"
                  style={{ color: fruit.color }}
                >
                  {fruit.icon}
                </span>
              </div>

              {/* 水果名称 */}
              <div className="text-white text-xs text-center mb-2">{fruit.name}</div>

              {/* 投注金额控制 */}
              <div className="flex items-center justify-center gap-1">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className="p-1 bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBetDecrease(fruit.id);
                  }}
                  disabled={disabled || !buttonState?.betAmount}
                >
                  <Minus className="w-3 h-3 text-white" />
                </motion.button>

                <div className="min-w-[50px] text-center">
                  <div className="text-yellow-300 text-sm font-bold">
                    {buttonState?.betAmount || 0}
                  </div>
                  <div className="text-yellow-200 text-xs">金币</div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className="p-1 bg-green-600 rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBetIncrease(fruit.id);
                  }}
                  disabled={disabled || !canAfford}
                >
                  <Plus className="w-3 h-3 text-white" />
                </motion.button>
              </div>

              {/* 中奖标记 */}
              {buttonState?.isWinning && (
                <motion.div
                  className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <span className="text-white text-xs">✓</span>
                </motion.div>
              )}

              {/* 余额不足提示 */}
              {!canAfford && !disabled && (
                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                  <span className="text-red-400 text-xs">余额不足</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* 快速投注提示 */}
      <div className="mt-3 text-center text-yellow-200 text-xs opacity-75">
        提示：点击投注按钮可连续投注
      </div>
    </div>
  );
}