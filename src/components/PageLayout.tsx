import { Suspense } from 'react';

import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  disableMobilePadding?: boolean;
  fullWidth?: boolean;
  /** 剧场模式（播放页/直播页）：内容顶满导航栏，md 及以上锁视口高度不可滚动 */
  theater?: boolean;
}

const PageLayout = ({
  children,
  activePath = '/',
  disableMobilePadding = false,
  fullWidth = false,
  theater = false,
}: PageLayoutProps) => {
  return (
    <div className='w-full min-h-screen'>
      <Suspense
        fallback={
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
        }
      >
        <Header activePath={activePath} />
      </Suspense>

      <main
        className={`flex-1 transition-all duration-300 ${
          disableMobilePadding ? 'mb-0' : 'mb-14 md:mb-0'
        } ${theater ? 'md:h-screen md:overflow-hidden' : ''}`}
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom:
            disableMobilePadding || theater
              ? 0
              : 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div
          className={`transition-all duration-300 ${
            disableMobilePadding || theater
              ? 'py-0 h-full'
              : 'pt-2 pb-4 lg:pt-3 lg:pb-6'
          } ${fullWidth || theater ? 'w-full px-0' : 'container mx-auto px-4 lg:px-6'}`}
        >
          {children}
        </div>
      </main>

      <div className={`md:hidden ${disableMobilePadding ? 'hidden' : ''}`}>
        <MobileBottomNav activePath={activePath} />
      </div>
    </div>
  );
};

export default PageLayout;
