'use client';

/**
 * 投注区：投注金额选择、倍数加成、连胜显示
 */

import { Coins } from 'lucide-react';

import { BET_CONFIG, formatCoins } from '@/lib/slot-machine-utils';

interface SlotBetControlsProps {
  bet: number;
  onBetChange: (amount: number) => void;
  multiplier: number;
  onMultiplierChange: (multiplier: number) => void;
  coins: number;
  isPlaying: boolean;
  winStreak: number;
}

export function SlotBetControls({
  bet,
  onBetChange,
  multiplier,
  onMultiplierChange,
  coins,
  isPlaying,
  winStreak,
}: SlotBetControlsProps) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-4">
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-center justify-center text-lg">
        <Coins className="w-6 h-6 text-yellow-400" />
        刺激投注区
        <Coins className="w-6 h-6 text-yellow-400" />
      </h3>

      {/* 投注金额选择 - 新的刺激方案 */}
      <div className="mb-4">
        <div className="text-center text-sm text-gray-300 mb-2 font-semibold">
          选择投注金额
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[BET_CONFIG.DEFAULT_BET, 500, 1000, 5000, 10000, BET_CONFIG.MAX_BASE_BET].map(
            (amount) => (
              <button
                key={amount}
                onClick={() => onBetChange(amount)}
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
                } ${
                  isPlaying || amount * multiplier > coins
                    ? 'opacity-50 cursor-not-allowed transform-none'
                    : ''
                }`}
              >
                {/* 背景光效 */}
                <div
                  className={`absolute inset-0 opacity-20 ${
                    bet === amount ? 'animate-pulse' : ''
                  }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent"></div>
                </div>

                <div className="relative z-10">
                  <div className="text-base md:text-lg font-extrabold">
                    {formatCoins(amount)}
                  </div>
                  <div className="text-xs opacity-80">
                    {amount === 100 && '入门投注'}
                    {amount === 500 && '进阶投注'}
                    {amount === 1000 && '高手投注'}
                    {amount === 5000 && '🔥 极限挑战 🔥'}
                    {amount === 10000 && '💎 豪华投注 💎'}
                    {amount === BET_CONFIG.MAX_BASE_BET &&
                      `👑 至尊${
                        multiplier === 5 ? '(5×)' : multiplier === 4 ? '(4×)' : '(×3)'
                      }`}
                  </div>
                </div>
              </button>
            )
          )}
        </div>
      </div>

      {/* 倍数和连胜信息显示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 倍数控制 */}
        <div>
          <div className="text-center text-sm text-gray-300 mb-2 font-semibold">
            倍数加成
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 5].map((mult) => (
              <button
                key={mult}
                onClick={() => onMultiplierChange(mult)}
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
              <span className="text-xs text-yellow-300 ml-1">
                ({bet}×{multiplier})
              </span>
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
  );
}
