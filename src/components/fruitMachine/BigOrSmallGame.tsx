'use client';

import { AnimatePresence,motion } from 'framer-motion';
import { TrendingDown, TrendingUp, Zap } from 'lucide-react';
import React, { useState } from 'react';

import { GAME_CONFIG } from '../../lib/fruit-machine-config';

interface BigOrSmallGameProps {
  number: number;
  isSwitching: boolean;
  onBigOrSmall: (isBig: boolean) => void;
  baseAmount: number;
}

export function BigOrSmallGame({ number, isSwitching, onBigOrSmall, baseAmount }: BigOrSmallGameProps) {
  const [hasChosen, setHasChosen] = useState(false);

  const handleChoice = (isBig: boolean) => {
    if (hasChosen || isSwitching) return;

    setHasChosen(true);
    onBigOrSmall(isBig);
  };

  const isSmall = GAME_CONFIG.bigOrSmallRange.small.includes(number);
  const smallNumbers = GAME_CONFIG.bigOrSmallRange.small;
  const bigNumbers = GAME_CONFIG.bigOrSmallRange.big;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="bg-gradient-to-br from-purple-900 to-purple-800 rounded-2xl p-6 max-w-md w-full mx-4 border-4 border-yellow-500 shadow-2xl"
      >
        <h2 className="text-2xl font-bold text-center text-white mb-4 flex items-center justify-center gap-2">
          <Zap className="w-6 h-6 text-yellow-400" />
          猜大小
        </h2>

        {/* 奖池显示 */}
        <div className="bg-black bg-opacity-30 rounded-lg p-3 mb-4 text-center">
          <div className="text-yellow-300 text-sm mb-1">可翻倍金额</div>
          <div className="text-2xl font-bold text-yellow-200">{baseAmount} 金币</div>
          <div className="text-green-300 text-sm mt-1">猜对可翻倍至 {baseAmount * 2} 金币!</div>
        </div>

        {/* 数字显示区域 */}
        <div className="bg-black bg-opacity-50 rounded-lg p-4 mb-4 relative overflow-hidden">
          {/* 闪烁的数字 */}
          <motion.div
            className="text-6xl font-bold text-center text-yellow-400"
            animate={{
              scale: isSwitching ? [1, 1.2, 1] : 1,
              opacity: isSwitching ? [1, 0.3, 1] : 1
            }}
            transition={{
              duration: 0.5,
              repeat: isSwitching ? Infinity : 0,
              ease: "easeInOut"
            }}
          >
            {isSwitching ? '?' : number}
          </motion.div>

          {/* 数字范围指示器 */}
          <div className="absolute top-2 right-2 text-xs text-yellow-200 opacity-75">
            1-14
          </div>

          {/* 选择结果指示 */}
          {hasChosen && !isSwitching && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`absolute inset-0 flex items-center justify-center bg-opacity-80 rounded ${
                isSmall ? 'bg-blue-600' : 'bg-red-600'
              }`}
            >
              <div className="text-white text-center">
                <div className="text-4xl font-bold mb-2">{number}</div>
                <div className="text-xl">{isSmall ? '小' : '大'}</div>
              </div>
            </motion.div>
          )}
        </div>

        {/* 大小提示 */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-center text-white text-sm">
          <div className="bg-blue-600 bg-opacity-30 rounded-lg p-2 border border-blue-500">
            <div className="text-blue-300">小 (1-7)</div>
            <div className="flex flex-wrap gap-1 justify-center mt-1">
              {smallNumbers.map(n => (
                <span key={n} className="text-xs bg-blue-700 px-1 rounded">{n}</span>
              ))}
            </div>
          </div>
          <div className="bg-red-600 bg-opacity-30 rounded-lg p-2 border border-red-500">
            <div className="text-red-300">大 (8-14)</div>
            <div className="flex flex-wrap gap-1 justify-center mt-1">
              {bigNumbers.map(n => (
                <span key={n} className="text-xs bg-red-700 px-1 rounded">{n}</span>
              ))}
            </div>
          </div>
        </div>

        {/* 选择按钮 */}
        <AnimatePresence>
          {!hasChosen && (
            <div className="grid grid-cols-2 gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleChoice(false)}
                disabled={isSwitching}
              >
                <TrendingDown className="w-5 h-5" />
                选小
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleChoice(true)}
                disabled={isSwitching}
              >
                <TrendingUp className="w-5 h-5" />
                选大
              </motion.button>
            </div>
          )}
        </AnimatePresence>

        {/* 状态提示 */}
        <div className="mt-4 text-center text-yellow-200 text-sm">
          {isSwitching ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              正在随机数字...
            </div>
          ) : hasChosen ? (
            <div className="text-lg font-bold animate-pulse">
              {isSmall ? '小!' : '大!'}
            </div>
          ) : (
            '请选择大或小'
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}