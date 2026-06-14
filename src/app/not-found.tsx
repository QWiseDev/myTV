'use client';

import { ArrowLeft,Home } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* 404 动画图标 */}
        <div className="mb-8">
          <div className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 animate-pulse">
            404
          </div>
          <div className="text-2xl text-gray-400 mt-4">页面未找到</div>
        </div>

        {/* 错误信息 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-gray-700">
          <p className="text-gray-300 mb-4">
            抱歉，您访问的页面不存在或已被移动。
          </p>
          <div className="text-sm text-gray-500">
            可能的原因：
            <ul className="mt-2 space-y-1 text-left">
              <li>• 页面地址输入错误</li>
              <li>• 页面已被删除或移动</li>
              <li>• 链接已过期</li>
            </ul>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            <Home className="w-5 h-5" />
            返回首页
          </Link>

          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            <ArrowLeft className="w-5 h-5" />
            返回上页
          </button>
        </div>

        {/* 快速导航 */}
        <div className="mt-8 pt-8 border-t border-gray-700">
          <p className="text-gray-400 text-sm mb-4">快速导航：</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/"
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
            >
              首页
            </Link>
            <Link
              href="/live"
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
            >
              直播
            </Link>
            <Link
              href="/slot"
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
            >
              老虎机
            </Link>
            <Link
              href="/douban"
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
            >
              豆瓣
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}