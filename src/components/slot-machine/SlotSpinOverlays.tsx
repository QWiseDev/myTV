'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * 旋转结果全屏特效弹窗集合：奖池减少、惩罚警告、奖池翻倍、
 * 侯总视频、律师函/小米汽车/双惩罚/法务部 GIF、超级惩罚模式
 */

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { HOUZONG_VIDEO_PATH } from '@/lib/slot-config';
import type { PenaltyStatus } from '@/lib/slot-machine-utils';
import { formatCoins } from '@/lib/slot-machine-utils';

interface SlotSpinOverlaysProps {
  showJackpotReduction: boolean;
  jackpotReductionAmount: number;
  showPenaltyWarning: boolean;
  penaltyWarningMessage: string;
  penaltyStatus: PenaltyStatus;
  showJackpotDouble: boolean;
  jackpotDoubleAmount: number;
  showHouZongVideo: boolean;
  onCloseHouZongVideo: () => void;
  showLawyerGif: boolean;
  onCloseLawyerGif: () => void;
  showMiCarGif: boolean;
  onCloseMiCarGif: () => void;
  showTwoPunishmentGif: boolean;
  onCloseTwoPunishmentGif: () => void;
  showLegalDepartmentGif: boolean;
  onCloseLegalDepartmentGif: () => void;
  showSuperPenaltyMode: boolean;
  onCloseSuperPenaltyMode: () => void;
  bet: number;
  multiplier: number;
}

export function SlotSpinOverlays({
  showJackpotReduction,
  jackpotReductionAmount,
  showPenaltyWarning,
  penaltyWarningMessage,
  penaltyStatus,
  showJackpotDouble,
  jackpotDoubleAmount,
  showHouZongVideo,
  onCloseHouZongVideo,
  showLawyerGif,
  onCloseLawyerGif,
  showMiCarGif,
  onCloseMiCarGif,
  showTwoPunishmentGif,
  onCloseTwoPunishmentGif,
  showLegalDepartmentGif,
  onCloseLegalDepartmentGif,
  showSuperPenaltyMode,
  onCloseSuperPenaltyMode,
  bet,
  multiplier,
}: SlotSpinOverlaysProps) {
  return (
    <>
      {/* 累积大奖减少提示 */}
      <AnimatePresence>
        {showJackpotReduction && (
          <motion.div
            key="jackpot-reduction"
            initial={{ opacity: 0, y: -50, scale: 0.5 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: [0.5, 1.1, 1],
            }}
            exit={{ opacity: 0, y: 50, scale: 0.5 }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
          >
            <div className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-red-400">
              <div className="flex flex-col items-center gap-2">
                <motion.div
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.5, repeat: 2 }}
                >
                  <span className="text-4xl">💸</span>
                </motion.div>
                <div className="text-2xl font-bold text-center">累积大奖减少</div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="text-3xl font-extrabold text-yellow-300"
                >
                  -{formatCoins(jackpotReductionAmount)}
                </motion.div>
                <div className="text-sm text-red-100">金币</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 惩罚警告提示 */}
      <AnimatePresence>
        {showPenaltyWarning && (
          <motion.div
            key="penalty-warning"
            initial={{ opacity: 0, scale: 0.5, y: -100 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              x: [0, -10, 10, -10, 10, 0], // 左右晃动效果
            }}
            exit={{ opacity: 0, scale: 0.5, y: -100 }}
            transition={{
              scale: { type: 'spring', stiffness: 300, damping: 15 },
              x: { duration: 0.5, repeat: 3 }, // 重复晃动3次
            }}
            className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
          >
            <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-600 text-white px-8 py-6 rounded-2xl shadow-2xl border-4 border-red-400 max-w-md">
              <div className="flex flex-col items-center gap-3">
                {/* 警告图标 */}
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-6xl"
                >
                  ⚠️
                </motion.div>

                {/* 标题 */}
                <div className="text-2xl font-bold text-center">惩罚已激活！</div>

                {/* 惩罚信息 */}
                <div className="text-center space-y-2">
                  <div className="text-lg font-semibold text-yellow-200">
                    {penaltyWarningMessage}
                  </div>
                  {penaltyStatus.violationCount > 1 && (
                    <div className="text-sm text-red-100">
                      第 {penaltyStatus.violationCount} 次违规触发
                    </div>
                  )}
                </div>

                {/* 律师函图标 */}
                <div className="flex gap-2 justify-center">
                  {[...Array(Math.min(penaltyStatus.violationCount, 4))].map(
                    (_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1, type: 'spring' }}
                        className="text-3xl"
                      >
                        📜
                      </motion.div>
                    )
                  )}
                </div>

                {/* 提示文字 */}
                <div className="text-sm text-red-100 text-center">
                  律师函出现概率大幅增加！
                  <br />
                  请谨慎游戏，等待惩罚结束
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 侯总奖池翻倍提示 */}
      <AnimatePresence>
        {showJackpotDouble && (
          <motion.div
            key="jackpot-double"
            initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
            animate={{
              opacity: 1,
              scale: [0.5, 1.3, 1.1, 1],
              rotate: [0, 10, -10, 0],
            }}
            exit={{ opacity: 0, scale: 0.5, rotate: 180 }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
          >
            <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-yellow-400">
              <div className="flex flex-col items-center gap-2">
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 2, repeat: 1, ease: 'linear' }}
                >
                  <span className="text-4xl">🎯</span>
                </motion.div>
                <div className="text-2xl font-bold text-center">
                  侯总祝福！奖池翻倍！
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="text-3xl font-extrabold text-yellow-300"
                >
                  +{formatCoins(jackpotDoubleAmount)}
                </motion.div>
                <div className="text-sm text-yellow-100">金币</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 侯总视频弹窗 */}
      <AnimatePresence>
        {showHouZongVideo && (
          <motion.div
            key="houzong-video"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.5, rotate: 10 }}
              className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-yellow-500"
              style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            >
              <div className="relative">
                <video
                  autoPlay
                  muted={false}
                  controls={false}
                  className="max-w-full max-h-[70vh]"
                  style={{ maxHeight: '70vh' }}
                >
                  <source src={HOUZONG_VIDEO_PATH} type="video/mp4" />
                  您的浏览器不支持视频播放
                </video>

                {/* 视频标题 */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                  <h3 className="text-2xl font-bold text-yellow-400 text-center">
                    🎯 侯总降临！奖池翻倍！
                  </h3>
                </div>

                {/* 关闭按钮 */}
                <button
                  onClick={onCloseHouZongVideo}
                  className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-2 transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* 底部提示 */}
              <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 p-4 text-center">
                <div className="text-xl font-bold text-white mb-2">
                  恭喜触发侯总特殊奖励！
                </div>
                <div className="text-lg text-yellow-100">
                  奖池已翻倍，奖励已翻倍！继续游戏赢取更多金币！
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 律师函gif弹窗 */}
      <AnimatePresence>
        {showLawyerGif && (
          <motion.div
            key="lawyer-gif"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: 10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.5, rotate: -10 }}
              className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-red-500"
              style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            >
              <div className="relative">
                <img
                  src="/slot-symbols/gifs/regret.gif"
                  alt="律师函警告"
                  className="max-w-full max-h-[70vh]"
                  style={{ maxHeight: '70vh' }}
                />

                {/* gif标题 */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                  <h3 className="text-2xl font-bold text-red-400 text-center">
                    ⚖️ 三张律师函！奖池减少！
                  </h3>
                </div>

                {/* 关闭按钮 */}
                <button
                  onClick={onCloseLawyerGif}
                  className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-2 transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* 底部提示 */}
              <div className="bg-gradient-to-r from-red-600 to-red-500 p-4 text-center">
                <div className="text-xl font-bold text-white mb-2">
                  哎呀！触发律师函惩罚！
                </div>
                <div className="text-lg text-red-100">
                  累积大奖已被减少，下次好运！
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 小米汽车gif弹窗 */}
      <AnimatePresence>
        {showMiCarGif && (
          <motion.div
            key="mi-car-gif"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: 10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.5, rotate: -10 }}
              className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-orange-500"
              style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            >
              <div className="relative">
                <img
                  src="/slot-symbols/mi/小米弹窗.png"
                  alt="小米汽车警告"
                  className="max-w-full max-h-[70vh]"
                  style={{ maxHeight: '70vh' }}
                />

                {/* gif标题 */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                  <h3 className="text-2xl font-bold text-orange-400 text-center">
                    🚗 三张小米汽车！奖池减少！
                  </h3>
                </div>

                {/* 关闭按钮 */}
                <button
                  onClick={onCloseMiCarGif}
                  className="absolute top-2 right-2 bg-orange-600 hover:bg-orange-500 text-white rounded-full p-2 transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* 底部提示 */}
              <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-4 text-center">
                <div className="text-xl font-bold text-white mb-2">
                  哎呀！触发小米汽车惩罚！
                </div>
                <div className="text-lg text-orange-100">
                  累积大奖已被减少，下次好运！
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 两张惩罚牌弹窗 */}
      <AnimatePresence>
        {showTwoPunishmentGif && (
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

                {/* gif标题 */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                  <h3 className="text-2xl font-bold text-purple-400 text-center">
                    ⚠️ 两张惩罚牌！小心谨慎！
                  </h3>
                </div>

                {/* 关闭按钮 */}
                <button
                  onClick={onCloseTwoPunishmentGif}
                  className="absolute top-2 right-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full p-2 transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* 底部提示 */}
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

      {/* 法务部出动弹窗 */}
      <AnimatePresence>
        {showLegalDepartmentGif && (
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

                {/* gif标题 */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                  <h3 className="text-2xl font-bold text-red-500 text-center">
                    ⚠️ 法务部出动！
                  </h3>
                </div>

                {/* 关闭按钮 */}
                <button
                  onClick={onCloseLegalDepartmentGif}
                  className="absolute top-2 right-2 bg-red-700 hover:bg-red-600 text-white rounded-full p-2 transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* 底部提示 */}
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

      {/* 超级惩罚模式弹窗 */}
      <AnimatePresence>
        {showSuperPenaltyMode && (
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
                  scale: 0.5 + Math.random() * 0.5,
                }}
                animate={{
                  y: typeof window !== 'undefined' ? window.innerHeight + 100 : 1000,
                  rotate: Math.random() * 720,
                  x:
                    typeof window !== 'undefined'
                      ? Math.random() * window.innerWidth - window.innerWidth / 2
                      : 0,
                }}
                transition={{
                  duration: 4 + Math.random() * 2, // 稍微慢一点
                  repeat: 3, // 限制重复次数而不是无限
                  delay: Math.random() * 2,
                  ease: 'linear',
                }}
              >
                <img
                  src="/slot-symbols/lsh.png"
                  alt="律师函"
                  className="w-12 h-12 md:w-16 md:h-16 opacity-60" // 稍微小一点
                />
              </motion.div>
            ))}

            {/* 惩罚恶魔动画 - 优化版本 */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ scale: 0, rotate: 0 }}
              animate={{ scale: [0, 1.2, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 1, repeat: 2, repeatType: 'reverse' }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{ duration: 2, repeat: 4 }} // 限制重复次数
                className="text-6xl md:text-8xl" // 稍微小一点
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
                        height: '80px',
                      }}
                      animate={{
                        height: ['80px', '120px', '80px'],
                        opacity: [0.2, 0.5, 0.2],
                      }}
                      transition={{
                        duration: 1.5 + i * 0.3,
                        repeat: 5, // 限制重复次数
                        delay: i * 0.2,
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
                        '0 0 10px #ff0000',
                        '0 0 20px #ff0000',
                        '0 0 30px #ff0000',
                        '0 0 40px #ff0000',
                      ],
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
                      惩罚金额: -{(bet * multiplier * 20).toLocaleString()} 金币
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
                      rotate: [-2, 2, -2],
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
                  onClick={onCloseSuperPenaltyMode}
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
    </>
  );
}
