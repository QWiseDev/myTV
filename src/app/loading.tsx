/**
 * 首页加载骨架屏 — 服务端数据加载期间立即展示，避免白屏
 */
import { SKELETON_CONFIG } from '@/lib/constants/home';

import SectionSkeleton from '@/components/SectionSkeleton';

export default function HomeLoading() {
  return (
    <div className='w-full min-h-screen'>
      {/* Header 骨架 */}
      <header className='fixed top-0 left-0 right-0 z-50 bg-[#ffffff]/92 backdrop-blur-xl border-b border-[#e8e8e8] dark:bg-[#0d0d0d]/92 dark:border-[#3a3a3a]'>
        <div className='relative h-16 px-3 lg:px-4 xl:px-6'>
          <div className='flex items-center justify-between h-full max-w-full xl:max-w-7xl mx-auto'>
            <div className='flex items-center gap-2'>
              <div className='h-2.5 w-2.5 rounded-full bg-[#e8e8e8] dark:bg-[#3a3a3a] animate-pulse' />
              <div className='h-6 w-24 bg-[#e8e8e8] dark:bg-[#3a3a3a] rounded animate-pulse' />
            </div>
            <div className='flex items-center gap-2'>
              <div className='h-8 w-20 bg-[#e8e8e8] dark:bg-[#3a3a3a] rounded-md animate-pulse' />
              <div className='h-8 w-8 bg-[#e8e8e8] dark:bg-[#3a3a3a] rounded-md animate-pulse' />
            </div>
          </div>
        </div>
      </header>

      {/* 内容骨架 */}
      <main
        className='flex-1 transition-all duration-300 mb-14 md:mb-0'
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className='container mx-auto px-4 lg:px-6 pt-2 pb-4 lg:pt-3 lg:pb-6'>
          {/* Tab 切换骨架 */}
          <div className='mb-4 flex justify-center'>
            <div className='h-9 w-40 bg-[#f2f2f2]/80 dark:bg-[#2a2a2a]/80 rounded-md animate-pulse' />
          </div>

          <SectionSkeleton count={SKELETON_CONFIG.CONTINUE_WATCHING_COUNT} />
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      </main>

      {/* 移动端底部导航骨架 */}
      <nav className='md:hidden fixed left-0 right-0 bottom-0 z-[600] bg-[#ffffff]/92 backdrop-blur-xl border-t border-[#e8e8e8] dark:bg-[#0d0d0d]/92 dark:border-[#3a3a3a]'>
        <div className='flex items-center justify-around h-14 px-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='flex flex-col items-center gap-1'>
              <div className='h-6 w-6 bg-[#e8e8e8] dark:bg-[#3a3a3a] rounded animate-pulse' />
              <div className='h-3 w-8 bg-[#e8e8e8] dark:bg-[#3a3a3a] rounded animate-pulse' />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
