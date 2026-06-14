'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import React from 'react';

import { FRUIT_POSITIONS, FRUIT_TYPES } from '../../lib/fruit-machine-config';

interface FruitBoardProps {
  lightPosition: number;
  winFruits: string[];
  isPlaying: boolean;
}

export const FruitBoard = React.memo(function FruitBoard({ lightPosition, winFruits, isPlaying }: FruitBoardProps) {
  return (
    <div className="relative bg-gradient-to-br from-yellow-700 to-yellow-800 rounded-2xl p-6 shadow-inner">
      {/* 中心装饰 */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full p-4 shadow-lg">
          <Sparkles className="w-8 h-8 text-yellow-900" />
        </div>
      </div>

      {/* 水果盘面 - 圆形布局 */}
      <div className="relative w-full aspect-square max-w-md mx-auto">
        {FRUIT_POSITIONS.map((position, index) => {
          const fruit = position.fruit;
          const isLightOn = lightPosition === index;
          const isWinning = winFruits.includes(fruit.id);

          // 计算圆形布局位置
          const angle = (index * 15) * Math.PI / 180; // 转换为弧度
          const radius = 45; // 百分比半径
          const x = 50 + radius * Math.cos(angle);
          const y = 50 + radius * Math.sin(angle);

          return (
            <motion.div
              key={index}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)'
              }}
              animate={{
                scale: isLightOn ? 1.2 : isWinning ? 1.1 : 1,
                rotate: isPlaying ? 360 : 0
              }}
              transition={{
                scale: { duration: 0.3 },
                rotate: { duration: 20, repeat: isPlaying ? Infinity : 0, ease: "linear" }
              }}
            >
              {/* 灯光效果 */}
              {isLightOn && (
                <motion.div
                  className="absolute inset-0 bg-yellow-300 rounded-full blur-xl z-0"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 2, opacity: 0.8 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                />
              )}

              {/* 水果容器 */}
              <div
                className={`
                  relative w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center
                  transition-all duration-300 shadow-lg
                  ${isLightOn ? 'bg-yellow-200 ring-4 ring-yellow-400' : 'bg-white bg-opacity-90'}
                  ${isWinning && !isLightOn ? 'bg-green-200 ring-4 ring-green-400' : ''}
                  ${isPlaying ? 'animate-pulse' : ''}
                `}
              >
                {/* 水果图标 */}
                <span className="text-2xl md:text-3xl select-none pointer-events-none">
                  {fruit.icon}
                </span>

                {/* 中奖星光效果 */}
                {isWinning && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  >
                    <Sparkles className="w-full h-full text-yellow-400" />
                  </motion.div>
                )}
              </div>

              {/* 位置编号（调试用，可选显示） */}
              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-yellow-300 opacity-50">
                {index + 1}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 装饰性圆环 */}
      <div className="absolute inset-0 rounded-2xl border-4 border-yellow-600 border-opacity-30 pointer-events-none" />
      <div className="absolute inset-2 rounded-2xl border-2 border-yellow-500 border-opacity-20 pointer-events-none" />

      {/* 游戏状态指示器 */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-black bg-opacity-50 px-3 py-1 rounded-full">
        <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
        <span className="text-xs text-yellow-200">
          {isPlaying ? '游戏中' : '等待投注'}
        </span>
      </div>

      {/* 中奖水果显示 */}
      {winFruits.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 px-4 py-2 rounded-full"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-yellow-200">中奖水果:</span>
            <div className="flex gap-1">
              {winFruits.map((fruitId, index) => {
                const fruit = FRUIT_TYPES.find(f => f.id === fruitId);
                return fruit ? (
                  <span key={index} className="text-lg">{fruit.icon}</span>
                ) : null;
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
});