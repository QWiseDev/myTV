'use client';

import { motion } from 'framer-motion';
import { Coins,Play, RotateCcw, Zap } from 'lucide-react';
import React from 'react';

interface ControlPanelProps {
  isPlaying: boolean;
  autoPlay: boolean;
  onToggleAutoPlay: (enabled: boolean) => void;
  onStart: () => void;
  onReset: () => void;
  onCollect?: () => void;
  disabled: boolean;
}

export function ControlPanel({
  isPlaying,
  autoPlay,
  onToggleAutoPlay,
  onStart,
  onReset,
  onCollect,
  disabled
}: ControlPanelProps) {
  return (
    <div className="bg-gradient-to-br from-purple-800 to-purple-900 rounded-xl p-4 shadow-xl space-y-3">
      <h3 className="text-white text-lg font-bold text-center">控制面板</h3>

      {/* 开始按钮 */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        animate={{
          backgroundColor: isPlaying ? '#DC2626' : '#16A34A',
        }}
        className="w-full py-3 rounded-lg text-white font-bold text-lg flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onStart}
        disabled={disabled || isPlaying}
      >
        <Play className="w-5 h-5" />
        {isPlaying ? '游戏中...' : '开始游戏'}
      </motion.button>

      {/* 自动模式开关 */}
      <div className="bg-black bg-opacity-30 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Zap className={`w-4 h-4 ${autoPlay ? 'text-yellow-400' : 'text-gray-400'}`} />
            <span className="text-sm">自动模式</span>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            className={`w-12 h-6 rounded-full p-1 transition-colors relative ${
              autoPlay ? 'bg-green-500' : 'bg-gray-600'
            }`}
            onClick={() => onToggleAutoPlay(!autoPlay)}
            disabled={isPlaying}
          >
            <motion.div
              className="w-4 h-4 bg-white rounded-full shadow-md"
              animate={{ x: autoPlay ? 24 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </motion.button>
        </div>
        {autoPlay && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-yellow-300 mt-2 text-center"
          >
            自动进行中...
          </motion.div>
        )}
      </div>

      {/* 功能按钮 */}
      <div className="grid grid-cols-2 gap-2">
        {/* 重置按钮 */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg flex items-center justify-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          onClick={onReset}
          disabled={isPlaying}
        >
          <RotateCcw className="w-4 h-4" />
          重置
        </motion.button>

        {/* 收分按钮 */}
        {onCollect && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            animate={{
              backgroundColor: ['#059669', '#10B981', '#059669'],
            }}
            transition={{ duration: 1, repeat: Infinity }}
            className="bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg flex items-center justify-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            onClick={onCollect}
            disabled={isPlaying}
          >
            <Coins className="w-4 h-4" />
            收分
          </motion.button>
        )}
      </div>

      {/* 游戏提示 */}
      <div className="bg-black bg-opacity-30 rounded-lg p-2 text-center text-xs text-yellow-200 space-y-1">
        <div>💡 游戏提示</div>
        <div className="text-yellow-100 opacity-75">
          {autoPlay ? '自动模式将连续游戏' : '点击开始后灯光将旋转'}
        </div>
        <div className="text-yellow-100 opacity-75">
          中奖后可选择猜大小翻倍
        </div>
      </div>

      {/* 游戏状态指示器 */}
      <div className="flex items-center justify-center gap-2 text-xs text-white">
        <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
        <span>{isPlaying ? '游戏进行中' : '等待开始'}</span>
        {autoPlay && (
          <div className="bg-yellow-500 px-2 py-1 rounded-full text-yellow-900 font-bold ml-2">
            AUTO
          </div>
        )}
      </div>
    </div>
  );
}