'use client';

import { Coins, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 首页幸运老虎机悬浮入口：
 * - 移除重型 framer-motion 依赖与多重无限循环动画，改用轻量 CSS 过渡并遵循 prefers-reduced-motion；
 * - 直接使用 Link 作为单一交互根节点，修复 <a><button> 非法嵌套；
 * - 移动端上移避开底部导航栏（bottom-20），层级置于模态框之下（z-40）。
 */
export default function SlotMachineFloatButton() {
  const pathname = usePathname();

  if (pathname !== '/') {
    return null;
  }

  return (
    <Link
      href='/slot'
      aria-label='幸运老虎机'
      style={{
        bottom: 'calc(4.75rem + env(safe-area-inset-bottom))',
      }}
      className='group fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-lg ring-1 ring-white/25 transition-all duration-300 hover:from-purple-700 hover:to-pink-700 hover:shadow-xl motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-105 active:scale-95 md:!bottom-7 md:right-6 md:h-12 md:w-12'
    >
      <span className='relative flex items-center justify-center'>
        <Coins className='h-5 w-5 sm:h-6 sm:w-6' aria-hidden='true' />
        <Sparkles
          className='absolute -right-1 -top-1 h-2.5 w-2.5 text-yellow-300 sm:h-3 sm:w-3'
          aria-hidden='true'
        />
      </span>

      <span className='pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-[#1c1c1c]/95 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100'>
        幸运老虎机
      </span>
    </Link>
  );
}
