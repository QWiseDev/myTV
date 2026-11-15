import { Suspense } from 'react';

import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import SideNav from './SideNav';

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
      {/*
        爱奇艺式布局：左侧导航栏仅用于首页/浏览页（md+ 展示）；
        剧场模式（播放页/直播页）沿用爱奇艺播放页式顶部导航，内容全宽
      */}
      {!theater && (
        <Suspense fallback={null}>
          <SideNav activePath={activePath} />
        </Suspense>
      )}

      <Suspense
        fallback={
          <header
            className={`fixed left-0 right-0 top-0 z-50 border-b border-[#e8e8e8] bg-[#ffffff]/92 backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#0d0d0d]/92 ${
              theater ? '' : 'md:left-44'
            }`}
          >
            <div className='relative h-16 px-3 lg:px-6'>
              <div className='flex h-full max-w-full items-center justify-between mx-auto xl:max-w-7xl'>
                <div className='flex items-center gap-2'>
                  <div className='h-2.5 w-2.5 animate-pulse rounded-full bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
                  <div className='h-6 w-24 animate-pulse rounded bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
                </div>
                <div className='flex items-center gap-2'>
                  <div className='h-8 w-20 animate-pulse rounded-md bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
                  <div className='h-8 w-8 animate-pulse rounded-md bg-[#e8e8e8] dark:bg-[#3a3a3a]' />
                </div>
              </div>
            </div>
          </header>
        }
      >
        <Header activePath={activePath} theater={theater} />
      </Suspense>

      <main
        className={`flex-1 transition-all duration-300 ${theater ? '' : 'md:pl-44'} ${
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
