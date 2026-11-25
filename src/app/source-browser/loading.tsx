import { SourceBrowserContentSkeleton } from './_components/SourceBrowserSkeleton';

/**
 * 片源库 / 黄果模块路由加载骨架屏 — 避免点击菜单切换时回退到首页骨架
 */
export default function SourceBrowserLoading() {
  return (
    <div className='w-full min-h-screen'>
      {/* 左侧导航骨架（桌面端） */}
      <aside className='fixed inset-y-0 left-0 z-50 hidden w-44 flex-col border-r border-[#e8e8e8] bg-[#ffffff] dark:border-[#262626] dark:bg-[#0b0b0b] md:flex'>
        <div className='h-16 px-4 flex items-center'>
          <div className='h-6 w-24 rounded bg-[#e8e8e8] dark:bg-[#2a2a2a] animate-pulse' />
        </div>
        <div className='px-3 pt-2 space-y-2'>
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className='h-10 rounded-lg bg-[#f2f2f2] dark:bg-[#1f1f1f] animate-pulse'
            />
          ))}
        </div>
      </aside>

      {/* 顶栏骨架 */}
      <header className='fixed top-0 left-0 right-0 md:left-44 z-50 bg-[#ffffff]/92 backdrop-blur-xl border-b border-[#e8e8e8] dark:bg-[#0d0d0d]/92 dark:border-[#3a3a3a]'>
        <div className='h-16 px-3 lg:px-6 flex items-center justify-between gap-3'>
          <div className='h-6 w-24 rounded bg-[#e8e8e8] dark:bg-[#3a3a3a] animate-pulse md:hidden' />
          <div className='hidden md:block mx-auto h-10 w-full max-w-xl rounded-full bg-[#f2f2f2] dark:bg-[#232323] animate-pulse' />
          <div className='h-8 w-16 rounded-md bg-[#e8e8e8] dark:bg-[#3a3a3a] animate-pulse' />
        </div>
      </header>

      {/* 内容骨架 */}
      <main
        className='flex-1 md:pl-44 mb-14 md:mb-0'
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className='container mx-auto px-4 lg:px-6 pt-2 pb-4 lg:pt-3 lg:pb-6'>
          <div className='max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5'>
            <SourceBrowserContentSkeleton />
          </div>
        </div>
      </main>
    </div>
  );
}
