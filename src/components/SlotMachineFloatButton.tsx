'use client';

import { motion } from 'framer-motion';
import { Coins, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

export default function SlotMachineFloatButton() {
  const pathname = usePathname();

  // 只在首页显示
  if (pathname !== '/') {
    return null;
  }

  return (
    <Link href="/slot">
      <motion.button
        className="fixed bottom-8 right-4 z-[1002] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full p-3 shadow-xl hover:shadow-2xl transition-all group animate-pulse"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{
          opacity: 1,
          scale: [1, 1.2, 1],
          rotate: [0, 5, -5, 0]
        }}
        transition={{
          opacity: { duration: 0.3, delay: 1 },
          scale: {
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1.5
          },
          rotate: {
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }
        }}
      >
        <div className="relative">
          {/* 旋转动画背景 */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 opacity-0 group-hover:opacity-100 animate-ping"></div>

          {/* 主图标 */}
          <div className="relative flex items-center justify-center">
            <Coins className="w-5 h-5 sm:w-6 sm:h-6" />
            <Sparkles className="w-2 h-2 sm:w-3 sm:h-3 absolute -top-1 -right-1 text-yellow-300" />
          </div>

          {/* 发光效果 */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 opacity-20 animate-pulse"></div>
        </div>

        {/* 提示文字 */}
        <div className="absolute bottom-full right-0 mb-2 bg-gray-800 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          幸运老虎机
        </div>
      </motion.button>
    </Link>
  );
}