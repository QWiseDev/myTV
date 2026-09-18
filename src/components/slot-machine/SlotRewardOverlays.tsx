'use client';

/**
 * 奖励提示浮层：幸运轮盘、宝箱通知
 * （渲染在父级 AnimatePresence 内，保证退出动画）
 */

import { motion } from 'framer-motion';
import { Gift } from 'lucide-react';

import type { LuckyWheelReward } from '@/lib/slot-machine-utils';

export function SlotLuckyWheelOverlay({ reward }: { reward: LuckyWheelReward }) {
  return (
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
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          className="text-4xl mb-2"
        >
          🎡
        </motion.div>
        <h3 className="text-xl font-bold text-white mb-1">幸运轮盘！</h3>
        <p className="text-sm text-white mb-2">连续未中奖安慰奖</p>
        <div className="bg-white/20 rounded-lg p-3">
          <div className="text-2xl font-bold text-white">{reward.name}</div>
          {reward.betRefund && (
            <div className="text-sm text-yellow-200 mt-1">
              + 投注返还 {reward.betRefund} 金币
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function SlotChestNotification() {
  return (
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
  );
}
