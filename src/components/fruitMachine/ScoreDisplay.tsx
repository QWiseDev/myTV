'use client';

import { AnimatePresence,motion } from 'framer-motion';
import { Coins, Crown,TrendingUp } from 'lucide-react';
import React from 'react';

interface ScoreDisplayProps {
  ownedScore: number;
  rewardScore: number;
  multiplier: number;
}

export function ScoreDisplay({ ownedScore, rewardScore, multiplier }: ScoreDisplayProps) {
  const formatCoins = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toString();
  };

  return (
    <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 p-4">
      <div className="grid grid-cols-3 gap-4 text-white">
        {/* 持有金币 */}
        <motion.div
          className="bg-black bg-opacity-30 rounded-lg p-3 text-center"
          initial={{ scale: 1 }}
          animate={{ scale: ownedScore > 0 ? [1, 1.02, 1] : 1 }}
          transition={{ duration: 0.5, repeat: ownedScore > 0 ? Infinity : 0, repeatDelay: 3 }}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Coins className="w-5 h-5 text-yellow-300" />
            <span className="text-sm opacity-90">持有金币</span>
          </div>
          <div className="text-2xl font-bold text-yellow-200">
            {formatCoins(ownedScore)}
          </div>
        </motion.div>

        {/* 中奖积分 */}
        <motion.div
          className="bg-black bg-opacity-30 rounded-lg p-3 text-center"
          animate={{
            scale: rewardScore > 0 ? [1, 1.1, 1] : 1,
            backgroundColor: rewardScore > 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(0, 0, 0, 0.3)'
          }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-green-300" />
            <span className="text-sm opacity-90">中奖积分</span>
          </div>
          <div className="text-2xl font-bold text-green-200">
            {formatCoins(rewardScore)}
          </div>
          {rewardScore > 0 && (
            <motion.div
              className="text-xs text-green-300 mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              可收分
            </motion.div>
          )}
        </motion.div>

        {/* 倍率显示 */}
        <motion.div
          className="bg-black bg-opacity-30 rounded-lg p-3 text-center"
          animate={{
            scale: multiplier > 1 ? [1, 1.2, 1] : 1,
            backgroundColor: multiplier > 1 ? 'rgba(251, 191, 36, 0.3)' : 'rgba(0, 0, 0, 0.3)'
          }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-yellow-300" />
            <span className="text-sm opacity-90">当前倍率</span>
          </div>
          <div className="text-2xl font-bold text-yellow-200">
            {multiplier > 0 ? `${multiplier}x` : '-'}
          </div>
          {multiplier > 1 && (
            <motion.div
              className="text-xs text-yellow-300 mt-1"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              翻倍成功!
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* 金币变化动画指示器 */}
      <AnimatePresence>
        {rewardScore > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-3 text-center text-white text-sm bg-green-600 bg-opacity-30 rounded-full px-3 py-1 inline-block w-full"
          >
            🎉 恭喜中奖！可以选择猜大小翻倍或直接收分
          </motion.div>
        )}
      </AnimatePresence>

      {/* 余额警告 */}
      {ownedScore < 100 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mt-3 text-center text-red-200 text-sm bg-red-600 bg-opacity-30 rounded-full px-3 py-1 inline-block w-full"
        >
          ⚠️ 金币余额不足，请谨慎投注
        </motion.div>
      )}
    </div>
  );
}