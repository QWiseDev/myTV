'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import SlotMachine from '@/components/SlotMachine';

export default function SlotMachinePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* 导航栏 */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>返回首页</span>
            </Link>

            <h1 className="text-xl font-bold text-white">幸运老虎机</h1>

            <div className="w-20"></div> {/* 占位符保持居中 */}
          </div>
        </div>
      </div>

      {/* 老虎机主体 - 作为普通组件集成 */}
      <div className="max-w-4xl mx-auto p-4">
        <SlotMachine initialCoins={1000} showTitle={false} compact={false} />
      </div>
    </div>
  );
}