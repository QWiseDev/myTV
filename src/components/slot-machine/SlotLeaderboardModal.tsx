'use client';

/**
 * 排行榜弹窗（渲染在父级 AnimatePresence 内）
 */

import { motion } from 'framer-motion';
import { Trophy, X } from 'lucide-react';

import type { LeaderboardItem } from '@/lib/slot-machine-utils';
import { formatCoins } from '@/lib/slot-machine-utils';

export type LeaderboardType = 'coins' | 'biggestWin' | 'totalWins';

interface SlotLeaderboardModalProps {
  onClose: () => void;
  leaderboard: LeaderboardItem[];
  leaderboardType: LeaderboardType;
  onSelectType: (type: LeaderboardType) => void;
}

export function SlotLeaderboardModal({
  onClose,
  leaderboard,
  leaderboardType,
  onSelectType,
}: SlotLeaderboardModalProps) {
  return (
    <motion.div
      key="leaderboard"
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
            <Trophy className="w-5 h-5 text-yellow-400" />
            排行榜
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 排行榜类型切换 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => onSelectType('coins')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
              leaderboardType === 'coins'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            金币榜
          </button>
          <button
            onClick={() => onSelectType('biggestWin')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
              leaderboardType === 'biggestWin'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            最大赢取
          </button>
          <button
            onClick={() => onSelectType('totalWins')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
              leaderboardType === 'totalWins'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            获胜次数
          </button>
        </div>

        {/* 排行榜列表 */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {leaderboard.length === 0 ? (
            <div className="text-center text-gray-400 py-8">暂无数据</div>
          ) : (
            leaderboard.map((user, index) => (
              <div
                key={user.username}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  index === 0
                    ? 'bg-gradient-to-r from-yellow-600/30 to-yellow-500/30 border border-yellow-500/50'
                    : index === 1
                    ? 'bg-gradient-to-r from-gray-600/30 to-gray-500/30 border border-gray-500/50'
                    : index === 2
                    ? 'bg-gradient-to-r from-orange-600/30 to-orange-500/30 border border-orange-500/50'
                    : 'bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      index === 0
                        ? 'bg-yellow-500 text-white'
                        : index === 1
                        ? 'bg-gray-400 text-white'
                        : index === 2
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-600 text-gray-300'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-white font-bold">{user.username}</div>
                    <div className="text-xs text-gray-400">
                      {leaderboardType === 'coins' &&
                        `${formatCoins(user.coins)} 金币`}
                      {leaderboardType === 'biggestWin' &&
                        `最大赢取 ${formatCoins(user.biggestWin)}`}
                      {leaderboardType === 'totalWins' &&
                        `${user.totalWins} 次获胜`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-yellow-400">
                    {leaderboardType === 'coins' && formatCoins(user.coins)}
                    {leaderboardType === 'biggestWin' &&
                      formatCoins(user.biggestWin)}
                    {leaderboardType === 'totalWins' && user.totalWins}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
