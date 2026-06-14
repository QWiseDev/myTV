'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import React, { memo } from 'react';

import { formatCoins } from '@/lib/slot-machine-utils';

// 通用模态框属性
interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 侯总视频弹窗
interface HouZongVideoModalProps extends BaseModalProps {
  videoSrc: string;
}

export const HouZongVideoModal = memo(function HouZongVideoModal({
  isOpen,
  onClose,
  videoSrc,
}: HouZongVideoModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
                <source src={videoSrc} type="video/mp4" />
                您的浏览器不支持视频播放
              </video>

              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                <h3 className="text-2xl font-bold text-yellow-400 text-center">
                  🎯 侯总降临！奖池翻倍！
                </h3>
              </div>

              <button
                onClick={onClose}
                className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-2 transition-colors z-10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

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
  );
});

// 通用GIF弹窗
interface GifModalProps extends BaseModalProps {
  gifSrc: string;
  title: string;
  subtitle: string;
  description: string;
  borderColor: string; // e.g., 'border-red-500'
  titleColor: string; // e.g., 'text-red-400'
  bgGradient: string; // e.g., 'from-red-600 to-red-500'
}

export const GifModal = memo(function GifModal({
  isOpen,
  onClose,
  gifSrc,
  title,
  subtitle,
  description,
  borderColor,
  titleColor,
  bgGradient,
}: GifModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.5, rotate: 10 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.5, rotate: -10 }}
            className={`relative bg-black rounded-2xl overflow-hidden shadow-2xl border-4 ${borderColor}`}
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
          >
            <div className="relative">
              <img
                src={gifSrc}
                alt={title}
                className="max-w-full max-h-[70vh]"
                style={{ maxHeight: '70vh' }}
              />

              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                <h3 className={`text-2xl font-bold ${titleColor} text-center`}>
                  {title}
                </h3>
              </div>

              <button
                onClick={onClose}
                className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-2 transition-colors z-10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div
              className={`bg-gradient-to-r ${bgGradient} p-4 text-center`}
            >
              <div className="text-xl font-bold text-white mb-2">{subtitle}</div>
              <div className="text-lg text-red-100">{description}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 累积大奖减少提示
interface JackpotReductionOverlayProps {
  isOpen: boolean;
  amount: number;
}

export const JackpotReductionOverlay = memo(function JackpotReductionOverlay({
  isOpen,
  amount,
}: JackpotReductionOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
                -{formatCoins(amount)}
              </motion.div>
              <div className="text-sm text-red-100">金币</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 奖池翻倍提示
interface JackpotDoubleOverlayProps {
  isOpen: boolean;
  amount: number;
}

export const JackpotDoubleOverlay = memo(function JackpotDoubleOverlay({
  isOpen,
  amount,
}: JackpotDoubleOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
                className="text-3xl font-extrabold text-white"
              >
                +{formatCoins(amount)}
              </motion.div>
              <div className="text-sm text-yellow-100">金币</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 惩罚警告提示
interface PenaltyWarningOverlayProps {
  isOpen: boolean;
  message: string;
  violationCount: number;
}

export const PenaltyWarningOverlay = memo(function PenaltyWarningOverlay({
  isOpen,
  message,
  violationCount,
}: PenaltyWarningOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="penalty-warning"
          initial={{ opacity: 0, scale: 0.5, y: -100 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            x: [0, -10, 10, -10, 10, 0],
          }}
          exit={{ opacity: 0, scale: 0.5, y: -100 }}
          transition={{
            scale: { type: 'spring', stiffness: 300, damping: 15 },
            x: { duration: 0.5, repeat: 3 },
          }}
          className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-600 text-white px-8 py-6 rounded-2xl shadow-2xl border-4 border-red-400 max-w-md">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                className="text-6xl"
              >
                ⚠️
              </motion.div>

              <div className="text-2xl font-bold text-center">惩罚已激活！</div>

              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-yellow-200">
                  {message}
                </div>
                {violationCount > 1 && (
                  <div className="text-sm text-red-100">
                    第 {violationCount} 次违规触发
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-center">
                {[...Array(Math.min(violationCount, 4))].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1, type: 'spring' }}
                    className="text-3xl"
                  >
                    📜
                  </motion.div>
                ))}
              </div>

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
  );
});

// 超级惩罚模式
interface SuperPenaltyModeOverlayProps {
  isOpen: boolean;
}

export const SuperPenaltyModeOverlay = memo(function SuperPenaltyModeOverlay({
  isOpen,
}: SuperPenaltyModeOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="super-penalty-mode"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-red-900/30 z-40 pointer-events-none"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-red-900/50 to-transparent" />
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 bg-red-500/10"
          />
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="bg-red-600/90 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
            >
              ⚠️ 超级惩罚模式 ⚠️
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 消息提示
interface MessageToastProps {
  message: { type: 'success' | 'error' | 'info'; text: string } | null;
}

export const MessageToast = memo(function MessageToast({
  message,
}: MessageToastProps) {
  if (!message) return null;

  return (
    <div
      className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-pulse ${
        message.type === 'success'
          ? 'bg-green-500 text-white'
          : message.type === 'error'
            ? 'bg-red-500 text-white'
            : 'bg-blue-500 text-white'
      }`}
    >
      {message.text}
    </div>
  );
});

// 宝箱获得通知
interface ChestNotificationProps {
  isOpen: boolean;
}

export const ChestNotification = memo(function ChestNotification({
  isOpen,
}: ChestNotificationProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.5 }}
          className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50"
        >
          <div className="bg-gradient-to-r from-amber-600 to-yellow-500 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-3">
            <motion.span
              animate={{ rotate: [0, 20, -20, 0] }}
              transition={{ duration: 0.5, repeat: 2 }}
              className="text-2xl"
            >
              🎁
            </motion.span>
            <span className="font-bold">获得 1 个宝箱！</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 背景装饰
export const BackgroundDecoration = memo(function BackgroundDecoration() {
  return (
    <div className="absolute inset-0 opacity-20">
      <div className="absolute top-0 left-0 w-32 h-32 bg-yellow-400 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-pink-400 rounded-full blur-3xl animate-pulse delay-1000" />
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-400 rounded-full blur-3xl animate-pulse delay-500" />
    </div>
  );
});
