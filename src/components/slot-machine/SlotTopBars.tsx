'use client';

/**
 * 页头组件：累积大奖横幅 + 标题/统计栏（完整与紧凑两种形态）
 */

import { motion } from 'framer-motion';
import { Cherry, Coins, Gift, Sparkles, Trophy, User, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { formatCoins } from '@/lib/slot-machine-utils';

interface SlotJackpotBannerProps {
  jackpot: number;
  showReduction: boolean;
}

export function SlotJackpotBanner({
  jackpot,
  showReduction,
}: SlotJackpotBannerProps) {
  return (
    <div className="text-center mb-4">
      <motion.div
        className="inline-block bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 px-4 py-2 rounded-full shadow-xl"
        animate={
          showReduction
            ? {
                scale: [1, 0.95, 1.1, 1],
                background: [
                  'from-yellow-600 via-yellow-500 to-yellow-600',
                  'from-red-600 via-red-500 to-red-600',
                  'from-yellow-600 via-yellow-500 to-yellow-600',
                ],
              }
            : {
                scale: [1, 1.05, 1],
              }
        }
        transition={{
          duration: showReduction ? 0.6 : 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-white animate-pulse" />
          <div>
            <div className="text-xs text-yellow-100 font-bold">累积大奖</div>
            <motion.div
              key={jackpot}
              initial={{ scale: 1.2, color: '#fef08a' }}
              animate={{ scale: 1, color: '#ffffff' }}
              transition={{ duration: 0.5 }}
              className="text-lg font-bold text-white"
            >
              {formatCoins(jackpot)}
            </motion.div>
          </div>
          <Gift className="w-5 h-5 text-white animate-pulse" />
        </div>
      </motion.div>
      <div className="text-xs text-yellow-300 mt-1">🏆 特殊组合赢得大奖！</div>
    </div>
  );
}

interface SlotTitleHeaderProps {
  showTitle: boolean;
  coins: number;
  totalWins: number;
  biggestWin: number;
  chestCount: number;
  showLeaderboard: boolean;
  onToggleLeaderboard: () => void;
  onFetchLeaderboard: () => void;
  onToggleUserPanel: () => void;
}

export function SlotTitleHeader({
  showTitle,
  coins,
  totalWins,
  biggestWin,
  chestCount,
  showLeaderboard,
  onToggleLeaderboard,
  onFetchLeaderboard,
  onToggleUserPanel,
}: SlotTitleHeaderProps) {
  const router = useRouter();

  if (showTitle) {
    return (
      <>
        {/* 标题和统计信息 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center md:text-left">
            <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-1 flex items-center justify-center md:justify-start gap-2">
              <Sparkles className="w-4 h-4 md:w-6 md:h-6" />
              幸运老虎机
              <Sparkles className="w-4 h-4 md:w-6 md:h-6" />
            </h1>
            <p className="text-xs md:text-sm text-gray-300">
              试试你的运气，赢取金币奖励！
            </p>
          </div>

          {/* 统计数据 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
              <Trophy className="w-4 h-4 md:w-6 md:h-6 text-yellow-400 mx-auto mb-1" />
              <div className="text-sm md:text-lg font-bold text-white">
                {totalWins}
              </div>
              <div className="text-xs text-gray-300">总获胜</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
              <Zap className="w-4 h-4 md:w-6 md:h-6 text-orange-400 mx-auto mb-1" />
              <div className="text-sm md:text-lg font-bold text-white">
                {biggestWin}
              </div>
              <div className="text-xs text-gray-300">最大赢取</div>
            </div>
          </div>

          {/* 金币显示和用户管理 */}
          <div className="flex justify-center md:justify-end items-center gap-2">
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
              <Coins className="w-4 h-4 md:w-6 md:h-6 text-white" />
              <span className="text-white font-bold text-lg">
                {formatCoins(coins)}
              </span>
            </div>
            {/* 水果机按钮 - 余额超过200万时显示 */}
            {coins >= 1000000 && (
              <button
                onClick={() => {
                  // 这里可以添加跳转到水果机的逻辑
                  router.push('/fruit-machine');
                }}
                className="p-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-400 hover:to-pink-400 rounded-full transition-all transform hover:scale-105 shadow-lg relative animate-pulse"
                title="水果机 (余额≥100万解锁)"
              >
                <Cherry className="w-5 h-5 text-white" />
                <div className="absolute -top-1 -right-1 bg-yellow-400 text-red-600 px-1.5 py-0.5 rounded-full flex items-center justify-center shadow-lg border-2 border-red-300">
                  <span className="text-xs font-bold">VIP</span>
                </div>
              </button>
            )}
            <button
              onClick={() => {
                onToggleLeaderboard();
                if (!showLeaderboard) onFetchLeaderboard();
              }}
              className="p-2 bg-orange-600 hover:bg-orange-500 rounded-full transition-colors relative"
              title="排行榜"
            >
              <Trophy className="w-5 h-5 text-white" />
              {chestCount > 0 && (
                <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-600 to-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-orange-400">
                  <Gift className="w-3 h-3 text-white" />
                  <span className="text-white font-bold text-xs">
                    {chestCount}
                  </span>
                </div>
              )}
            </button>
            {coins >= 1000000 && (
              <button
                onClick={() => {
                  console.log('跳转到水果机页面，当前金币:', coins);
                  // 保存当前金币到localStorage，供水果机页面使用
                  localStorage.setItem('userCoins', coins.toString());
                  router.push('/fruit-machine');
                }}
                className="p-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 rounded-full transition-all relative animate-pulse"
                title={`水果机 (100万金币解锁) - 当前: ${formatCoins(coins)}`}
              >
                <Cherry className="w-5 h-5 text-white" />
                <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-600 to-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-orange-400">
                  <span className="text-white font-bold text-xs">NEW</span>
                </div>
              </button>
            )}
            <button
              onClick={onToggleUserPanel}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors"
              title="用户管理"
            >
              <User className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex justify-between items-center mb-4">
      <div className="flex gap-2">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
          <Trophy className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <div className="text-xs font-bold text-white">{totalWins}</div>
          <div className="text-xs text-gray-300">总获胜</div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
          <Zap className="w-4 h-4 text-orange-400 mx-auto mb-1" />
          <div className="text-xs font-bold text-white">
            {formatCoins(biggestWin)}
          </div>
          <div className="text-xs text-gray-300">最大赢取</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-3 py-1 rounded-full flex items-center gap-2 shadow-lg">
          <Coins className="w-4 h-4 text-white" />
          <span className="text-white font-bold">{formatCoins(coins)}</span>
        </div>
        {/* 水果机按钮 - 紧凑模式，余额超过100万时显示 */}
        {coins >= 1000000 && (
          <button
            onClick={() => {
              localStorage.setItem('userCoins', coins.toString());
              router.push('/fruit-machine');
            }}
            className="p-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 rounded-full transition-all transform hover:scale-105 shadow-lg relative animate-pulse"
            title="水果机 (余额≥100万解锁)"
          >
            <Cherry className="w-4 h-4 text-white" />
            <div className="absolute -top-1 -right-1 bg-yellow-400 text-red-600 px-1 py-0.5 rounded-full flex items-center justify-center shadow-lg border-2 border-red-300">
              <span className="text-xs font-bold">VIP</span>
            </div>
          </button>
        )}
        <button
          onClick={() => {
            onToggleLeaderboard();
            if (!showLeaderboard) onFetchLeaderboard();
          }}
          className="p-2 bg-orange-600 hover:bg-orange-500 rounded-full transition-colors relative"
          title="排行榜"
        >
          <Trophy className="w-4 h-4 text-white" />
          {chestCount > 0 && (
            <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-600 to-blue-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-lg border border-orange-400">
              <Gift className="w-2.5 h-2.5 text-white" />
              <span className="text-white font-bold text-xs">{chestCount}</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
