/**
 * 首页加载骨架屏 — 与桌面端左侧 SideNav + 顶栏 + Hero 轮播 + 16:9 继续观看严丝合缝对齐，消除布局跳动
 */
import { SKELETON_CONFIG } from '@/lib/constants/home';

import { CONTINUE_WATCHING_CARD_WIDTH_CLASS } from '@/components/ContinueWatching';
import SectionSkeleton from '@/components/SectionSkeleton';

export default function HomeLoading() {
  return (
    <div className='min-h-screen w-full'>
      {/* 桌面端左侧固定导航骨架（与 SideNav w-44 对齐） */}
      <aside className='fixed inset-y-0 left-0 z-50 hidden w-44 flex-col border-r border-[#e8e8e8] bg-[#ffffff] px-3 py-4 dark:border-[#262626] dark:bg-[#0b0b0b] md:flex'>
        <div className='mb-5 h-7 w-24 animate-pulse rounded bg-[#e8e8e8] dark:bg-[#2a2a2a]' />
        <div className='space-y-2'>
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className='h-10 w-full animate-pulse rounded-lg bg-[#f2f2f2] dark:bg-[#1c1c1c]'
            />
          ))}
        </div>
      </aside>

      {/* Header 骨架（桌面端左偏移 md:left-44） */}
      <header className='fixed left-0 right-0 top-0 z-50 border-b border-[#e8e8e8] bg-[#ffffff]/92 backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#0d0d0d]/92 md:left-44'>
        <div className='relative h-16 px-3 lg:px-6'>
          <div className='mx-auto flex h-full max-w-full items-center justify-between gap-3'>
            <div className='flex items-center gap-2 md:hidden'>
              <div className='h-6 w-24 animate-pulse rounded bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
            </div>
            <div className='mx-auto hidden h-10 w-full max-w-xl animate-pulse rounded-full bg-[#f2f2f2] dark:bg-[#232323] md:block' />
            <div className='ml-auto flex items-center gap-2'>
              <div className='h-9 w-9 animate-pulse rounded-md bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
              <div className='h-9 w-9 animate-pulse rounded-md bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
            </div>
          </div>
        </div>
      </header>

      {/* 内容骨架（桌面端左内边距 md:pl-44，与 PageLayout 完全一致） */}
      <main
        className='mb-14 flex-1 md:mb-0 md:pl-44'
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className='container mx-auto px-4 pb-4 pt-2 lg:px-6 lg:pb-6 lg:pt-3'>
          {/* 首屏轮播骨架 */}
          <div className='mb-6 h-[220px] w-full animate-pulse rounded-xl bg-[#e8e8e8] dark:bg-[#2a2a2a] sm:h-[300px] lg:h-[360px]' />

          {/* 16:9 继续观看横版骨架 */}
          <section className='mb-8'>
            <div className='mb-4 flex items-center justify-between'>
              <div className='h-7 w-28 animate-pulse rounded bg-[#e8e8e8] dark:bg-[#2a2a2a]' />
            </div>
            <div className='flex gap-4 overflow-hidden pb-3 sm:gap-5 md:gap-6'>
              {Array.from({
                length: SKELETON_CONFIG.CONTINUE_WATCHING_COUNT,
              }).map((_, index) => (
                <div key={index} className={CONTINUE_WATCHING_CARD_WIDTH_CLASS}>
                  <div className='aspect-video w-full animate-pulse rounded-xl bg-[#e8e8e8] dark:bg-[#2a2a2a]' />
                </div>
              ))}
            </div>
          </section>

          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      </main>

      {/* 移动端底部导航骨架 */}
      <nav className='fixed bottom-0 left-0 right-0 z-[600] border-t border-[#e8e8e8] bg-[#ffffff]/92 backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#0d0d0d]/92 md:hidden'>
        <div className='flex h-14 items-center justify-around px-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='flex flex-col items-center gap-1'>
              <div className='h-6 w-6 animate-pulse rounded bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
              <div className='h-3 w-8 animate-pulse rounded bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
