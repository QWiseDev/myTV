'use client';

/**
 * 用户管理弹窗：统计与账户重置（渲染在父级 AnimatePresence 内）
 */

import { motion } from 'framer-motion';
import { Cog, X } from 'lucide-react';

import { formatCoins } from '@/lib/slot-machine-utils';

interface SlotUserPanelModalProps {
  onClose: () => void;
  coins: number;
  totalWins: number;
  biggestWin: number;
  chestCount: number;
  onResetAccount: (initialCoins: number) => void;
}

export function SlotUserPanelModal({
  onClose,
  coins,
  totalWins,
  biggestWin,
  chestCount,
  onResetAccount,
}: SlotUserPanelModalProps) {
  return (
    <motion.div
      key="user-panel"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        exit={{ y: 20 }}
        className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Cog className="w-5 h-5" />
            用户管理
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 用户统计 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {formatCoins(coins)}
            </div>
            <div className="text-sm text-gray-300">当前金币</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{totalWins}</div>
            <div className="text-sm text-gray-300">获胜次数</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-400">
              {formatCoins(biggestWin)}
            </div>
            <div className="text-sm text-gray-300">最大赢取</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-purple-400">
              {chestCount}
            </div>
            <div className="text-sm text-gray-300">宝箱数量</div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-300 mb-2 block">
              重置账户（选择初始金币）
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onResetAccount(500)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                500金币
              </button>
              <button
                onClick={() => onResetAccount(1000)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                1000金币
              </button>
              <button
                onClick={() => onResetAccount(5000)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                5000金币
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-400 text-center">
          提示：重置账户将清空所有游戏记录和统计数据
        </div>
      </motion.div>
    </motion.div>
  );
}
