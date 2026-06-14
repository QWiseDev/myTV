'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Cog, Gift, Trophy, X } from 'lucide-react';
import React, { memo } from 'react';

import { formatCoins, type LeaderboardItem, type LuckyWheelReward } from '@/lib/slot-machine-utils';

// 通用模态框属性
interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 两张惩罚牌弹窗
export const TwoPunishmentModal = memo(function TwoPunishmentModal({
  isOpen,
  onClose,
}: BaseModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="two-punishment-gif"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.5, rotate: 10 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.5, rotate: -10 }}
            className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-purple-500"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
          >
            <div className="relative">
              <img
                src="/slot-symbols/mi/小米弹窗2.png"
                alt="两张惩罚牌警告"
                className="max-w-full max-h-[70vh]"
                style={{ maxHeight: '70vh' }}
              />

              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                <h3 className="text-2xl font-bold text-purple-400 text-center">
                  ⚠️ 两张惩罚牌！小心谨慎！
                </h3>
              </div>

              <button
                onClick={onClose}
                className="absolute top-2 right-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full p-2 transition-colors z-10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-purple-500 p-4 text-center">
              <div className="text-xl font-bold text-white mb-2">
                警告！出现两张惩罚牌！
              </div>
              <div className="text-lg text-purple-100">
                请谨慎游戏，避免更多惩罚！
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 法务部出动弹窗
export const LegalDepartmentModal = memo(function LegalDepartmentModal({
  isOpen,
  onClose,
}: BaseModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="legal-department-gif"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.5, rotate: 10 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.5, rotate: -10 }}
            className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-red-700"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
          >
            <div className="relative">
              <img
                src="/slot-symbols/mi/法务部出动.png"
                alt="法务部出动警告"
                className="max-w-full max-h-[70vh]"
                style={{ maxHeight: '70vh' }}
              />

              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                <h3 className="text-2xl font-bold text-red-500 text-center">
                  ⚠️ 法务部出动！
                </h3>
              </div>

              <button
                onClick={onClose}
                className="absolute top-2 right-2 bg-red-700 hover:bg-red-600 text-white rounded-full p-2 transition-colors z-10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-gradient-to-r from-red-700 to-red-600 p-4 text-center">
              <div className="text-xl font-bold text-white mb-2">
                警告！法务部出动！
              </div>
              <div className="text-lg text-red-100">
                请谨言慎行，避免更多惩罚！
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 超级惩罚模式弹窗
interface SuperPenaltyModalProps extends BaseModalProps {
  penaltyAmount: number;
}

export const SuperPenaltyModal = memo(function SuperPenaltyModal({
  isOpen,
  onClose,
  penaltyAmount,
}: SuperPenaltyModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="super-penalty-mode"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50"
        >
          {/* 全屏飘动的律师函动画 - 优化版本 */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={`lawyer-${i}`}
              className="absolute pointer-events-none"
              initial={{
                x: typeof window !== 'undefined' ? Math.random() * window.innerWidth : 0,
                y: -100,
                rotate: Math.random() * 360,
                scale: 0.5 + Math.random() * 0.5
              }}
              animate={{
                y: typeof window !== 'undefined' ? window.innerHeight + 100 : 1000,
                rotate: Math.random() * 720,
                x: typeof window !== 'undefined' ? Math.random() * window.innerWidth - window.innerWidth / 2 : 0
              }}
              transition={{
                duration: 4 + Math.random() * 2,
                repeat: 3,
                delay: Math.random() * 2,
                ease: "linear"
              }}
            >
              <img
                src="/slot-symbols/lsh.png"
                alt="律师函"
                className="w-12 h-12 md:w-16 md:h-16 opacity-60"
              />
            </motion.div>
          ))}

          {/* 惩罚恶魔动画 - 优化版本 */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: [0, 1.2, 1], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 1, repeat: 2, repeatType: "reverse" }}
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 2, repeat: 4 }}
              className="text-6xl md:text-8xl"
            >
              😈
            </motion.div>
          </motion.div>

          {/* 主要弹窗内容 */}
          <motion.div
            initial={{ scale: 0.1, rotate: 180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.1, rotate: -180 }}
            className="relative bg-gradient-to-b from-red-900 via-black to-red-900 rounded-3xl overflow-hidden shadow-2xl border-8 border-red-600"
            style={{ maxWidth: '95vw', maxHeight: '95vh', zIndex: 10 }}
          >
            <div className="relative p-8 md:p-12">
              {/* 背景火焰效果 - 优化版本 */}
              <div className="absolute inset-0 opacity-20">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={`flame-${i}`}
                    className="absolute bg-gradient-to-t from-red-600 to-orange-400 rounded-full blur-xl"
                    style={{
                      left: `${30 + i * 25}%`,
                      bottom: 0,
                      width: '50px',
                      height: '80px'
                    }}
                    animate={{
                      height: ['80px', '120px', '80px'],
                      opacity: [0.2, 0.5, 0.2],
                    }}
                    transition={{
                      duration: 1.5 + i * 0.3,
                      repeat: 5,
                      delay: i * 0.2
                    }}
                  />
                ))}
              </div>

              {/* 标题 */}
              <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="relative text-center mb-6"
              >
                <motion.h1
                  animate={{
                    textShadow: [
                      "0 0 10px #ff0000",
                      "0 0 20px #ff0000",
                      "0 0 30px #ff0000",
                      "0 0 40px #ff0000"
                    ]
                  }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="text-4xl md:text-6xl font-black text-red-500 mb-4"
                >
                  ⚠️ 超级惩罚！！！ ⚠️
                </motion.h1>
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="text-2xl md:text-3xl font-bold text-orange-400"
                >
                  雷总憔悴，小米报案！！
                </motion.div>
              </motion.div>

              {/* 惩罚详情 */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="relative bg-black/60 rounded-2xl p-6 mb-6 border-4 border-red-500"
              >
                <div className="text-center space-y-4">
                  <motion.div
                    animate={{ x: [-10, 10, -10] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="text-xl md:text-2xl font-bold text-red-300"
                  >
                    💣 20倍投注扣除 💣
                  </motion.div>
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-lg md:text-xl text-orange-300"
                  >
                    累积大奖池已清空！！！
                  </motion.div>
                  <div className="text-red-400 font-bold text-lg">
                    惩罚金额: -{penaltyAmount.toLocaleString()} 金币
                  </div>
                </div>
              </motion.div>

              {/* 恶魔笑声文字 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="relative text-center"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [-2, 2, -2]
                  }}
                  transition={{ duration: 0.3, repeat: Infinity }}
                  className="text-3xl md:text-4xl font-black text-red-600"
                >
                  哈哈哈哈！！！
                </motion.div>
                <div className="text-red-400 text-lg mt-2">
                  这就是超级惩罚的威力！！！
                </div>
              </motion.div>

              {/* 关闭按钮 */}
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.5 }}
                onClick={onClose}
                className="absolute top-4 right-4 bg-red-700 hover:bg-red-600 text-white rounded-full p-3 transition-all transform hover:scale-110 z-20"
              >
                <X className="w-8 h-8" />
              </motion.button>
            </div>

            {/* 底部惩罚提示 */}
            <div className="bg-gradient-to-r from-red-800 via-orange-700 to-red-800 p-4 text-center">
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="text-xl font-bold text-white"
              >
                ⚖️ 法务部全面出击 ⚖️
              </motion.div>
              <div className="text-red-100 text-sm mt-1">
                小米法务部已全面出动，请立即停止违法行为！
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 幸运轮盘弹窗
interface LuckyWheelModalProps {
  isOpen: boolean;
  reward: LuckyWheelReward | null;
}

export const LuckyWheelModal = memo(function LuckyWheelModal({
  isOpen,
  reward,
}: LuckyWheelModalProps) {
  if (!reward) return null;

  return (
    <AnimatePresence>
      {isOpen && (
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
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
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
      )}
    </AnimatePresence>
  );
});

// 排行榜弹窗
interface LeaderboardModalProps extends BaseModalProps {
  leaderboard: LeaderboardItem[];
  leaderboardType: 'coins' | 'biggestWin' | 'totalWins';
  onFetchLeaderboard: (type: 'coins' | 'biggestWin' | 'totalWins') => void;
}

export const LeaderboardModal = memo(function LeaderboardModal({
  isOpen,
  onClose,
  leaderboard,
  leaderboardType,
  onFetchLeaderboard,
}: LeaderboardModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
                onClick={() => onFetchLeaderboard('coins')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
                  leaderboardType === 'coins'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                金币榜
              </button>
              <button
                onClick={() => onFetchLeaderboard('biggestWin')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
                  leaderboardType === 'biggestWin'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                最大赢取
              </button>
              <button
                onClick={() => onFetchLeaderboard('totalWins')}
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
                          {leaderboardType === 'coins' && `${formatCoins(user.coins)} 金币`}
                          {leaderboardType === 'biggestWin' && `最大赢取 ${formatCoins(user.biggestWin)}`}
                          {leaderboardType === 'totalWins' && `${user.totalWins} 次获胜`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-yellow-400">
                        {leaderboardType === 'coins' && formatCoins(user.coins)}
                        {leaderboardType === 'biggestWin' && formatCoins(user.biggestWin)}
                        {leaderboardType === 'totalWins' && user.totalWins}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 用户面板弹窗
interface UserPanelModalProps extends BaseModalProps {
  coins: number;
  totalWins: number;
  biggestWin: number;
  chestCount: number;
  onResetAccount: (initialCoins: number) => void;
}

export const UserPanelModal = memo(function UserPanelModal({
  isOpen,
  onClose,
  coins,
  totalWins,
  biggestWin,
  chestCount,
  onResetAccount,
}: UserPanelModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
                <div className="text-2xl font-bold text-yellow-400">{formatCoins(coins)}</div>
                <div className="text-sm text-gray-300">当前金币</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{totalWins}</div>
                <div className="text-sm text-gray-300">获胜次数</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{formatCoins(biggestWin)}</div>
                <div className="text-sm text-gray-300">最大赢取</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">{chestCount}</div>
                <div className="text-sm text-gray-300">宝箱数量</div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-300 mb-2 block">重置账户（选择初始金币）</label>
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
      )}
    </AnimatePresence>
  );
});

// 宝箱通知（已在 SlotMachineOverlays 中，但如果需要在这里也可以导出）
export const ChestNotificationToast = memo(function ChestNotificationToast({
  isOpen,
}: {
  isOpen: boolean;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
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
      )}
    </AnimatePresence>
  );
});
