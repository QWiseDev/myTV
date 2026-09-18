'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * 转轴区内中奖提示：累积大奖庆祝、徐棋隐藏卡特效、普通中奖/惩罚提示
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Star, Trophy } from 'lucide-react';

import type { SlotWinType } from '@/lib/slot-machine-utils';
import { formatCoins } from '@/lib/slot-machine-utils';

interface SlotWinBannersProps {
  showJackpot: boolean;
  lastWin: number;
  showXqCard: boolean;
  progressiveJackpot: number;
  showWin: boolean;
  winType: SlotWinType;
  resultName: string;
}

export function SlotWinBanners({
  showJackpot,
  lastWin,
  showXqCard,
  progressiveJackpot,
  showWin,
  winType,
  resultName,
}: SlotWinBannersProps) {
  return (
    <AnimatePresence>
      {showJackpot && (
        <motion.div
          key="jackpot"
          initial={{ opacity: 0, scale: 0.3, y: 100, rotate: -10 }}
          animate={{
            opacity: 1,
            scale: [1, 1.2, 1.1, 1],
            y: 0,
            rotate: [0, 5, -3, 0],
          }}
          exit={{ opacity: 0, scale: 0.5, y: -50 }}
          className="text-center py-2"
          transition={{ duration: 0.8 }}
        >
          <div className="relative">
            {/* 光环效果 */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur-xl opacity-50"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            <div className="relative bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white px-6 py-3 rounded-full inline-block shadow-2xl">
              <div className="flex flex-col items-center gap-1">
                <motion.div
                  className="flex items-center gap-2"
                  animate={{
                    x: [0, 3, -3, 0],
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Trophy className="w-5 h-5 md:w-7 md:h-7 text-yellow-200" />
                  </motion.div>
                  <span className="font-bold text-base md:text-xl">
                    🏆 累积大奖！🏆
                  </span>
                  <motion.div
                    animate={{ rotate: [0, -360] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Trophy className="w-5 h-5 md:w-7 md:h-7 text-yellow-200" />
                  </motion.div>
                </motion.div>
                <motion.span
                  className="font-bold text-sm md:text-base text-yellow-100"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  恭喜赢得 {formatCoins(lastWin)} 金币！
                </motion.span>
              </div>
            </div>

            {/* 飘落效果 */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute top-0 left-1/2 w-2 h-2 bg-yellow-400 rounded-full"
                animate={{
                  y: [0, 100],
                  x: [0, (Math.random() - 0.5) * 100],
                  opacity: [1, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: 'easeIn',
                }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* 徐棋隐藏卡特效 */}
      <AnimatePresence>
        {showXqCard && (
          <motion.div
            key="xq-card"
            initial={{ opacity: 0, scale: 0.5, y: -100 }}
            animate={{
              opacity: 1,
              scale: [0.5, 1.2, 1],
              y: 0,
            }}
            exit={{ opacity: 0, scale: 0.5, y: 100 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
          >
            <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white px-12 py-8 rounded-3xl shadow-2xl border-4 border-yellow-400 relative overflow-hidden">
              {/* 背景光晕 */}
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 via-transparent to-yellow-400/20 animate-pulse" />

              {/* 顶部图标 */}
              <motion.div
                className="flex justify-center gap-4 mb-4"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="w-8 h-8 text-yellow-300" />
                </motion.div>
                <img
                  src="/slot-symbols/xq.jpg"
                  alt="徐棋"
                  className="w-16 h-16 rounded-full border-4 border-yellow-300 shadow-lg"
                />
                <motion.div
                  animate={{ rotate: [360, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="w-8 h-8 text-yellow-300" />
                </motion.div>
              </motion.div>

              {/* 文字 */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <div className="text-3xl font-bold mb-2 bg-gradient-to-r from-yellow-300 to-yellow-100 bg-clip-text text-transparent">
                  🎴 徐棋隐藏卡！
                </div>
                <div className="text-5xl font-extrabold mb-2 text-yellow-300">
                  ✨ 十倍奖励 ✨
                </div>
                <div className="text-2xl font-bold text-yellow-100">
                  恭喜获得 {formatCoins(Math.floor(progressiveJackpot / 2))} 金币！
                </div>
              </motion.div>

              {/* 飘落特效 */}
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: '-10px',
                  }}
                  animate={{
                    y: [0, 400],
                    opacity: [1, 1, 0],
                  }}
                  transition={{
                    duration: 2 + Math.random(),
                    repeat: Infinity,
                    delay: Math.random() * 2,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showWin && !showJackpot && (
        <motion.div
          key="win"
          initial={{ opacity: 0, scale: 0.5, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 50 }}
          className="text-center py-2"
        >
          <div
            className={`bg-gradient-to-r ${
              winType === 'punishment'
                ? 'from-red-600 to-red-400'
                : winType === 'special'
                ? 'from-purple-600 to-purple-400'
                : winType === 'three'
                ? 'from-blue-500 to-blue-400'
                : winType === 'two'
                ? 'from-green-500 to-green-400'
                : 'from-gray-400 to-gray-600'
            } text-white px-4 py-2 rounded-full inline-block shadow-xl`}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 md:w-6 md:h-6" />
                <span className="font-bold text-xs md:text-sm">
                  {winType === 'punishment' && '⚠️ 惩罚！'}
                  {winType === 'three' && '🎉 三连大奖！'}
                  {winType === 'two' && '✨ 二连中奖！'}
                  {winType === 'special' && '🏆 超级大奖！'}
                  {lastWin > 0 && `赢得 ${formatCoins(lastWin)} 金币！`}
                  {lastWin < 0 &&
                    `扣除 ${formatCoins(Math.abs(lastWin))} 金币！`}
                  {lastWin === 0 && !winType && '未中奖'}
                </span>
                <Star className="w-4 h-4 md:w-6 md:h-6" />
              </div>
              {resultName && (
                <span className="text-xs text-white/90">{resultName}</span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
