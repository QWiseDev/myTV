import { Suspense } from 'react';

import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  disableMobilePadding?: boolean;
  fullWidth?: boolean;
}

const PageLayout = ({
  children,
  activePath = '/',
  disableMobilePadding = false,
  fullWidth = false,
}: PageLayoutProps) => {
  return (
    <div className='w-full min-h-screen'>
      <Suspense
        fallback={
          <header className='fixed top-0 left-0 right-0 z-50 bg-[#faf9f5]/92 backdrop-blur-xl border-b border-[#e8e6dc] dark:bg-[#191817]/92 dark:border-[#3d3934]'>
            <div className='relative h-16 px-3 lg:px-4 xl:px-6'>
              <div className='flex items-center justify-between h-full max-w-full xl:max-w-7xl mx-auto'>
                <div className='flex items-center gap-2'>
                  <div className='h-2.5 w-2.5 rounded-full bg-[#e8e6dc] dark:bg-[#3d3934] animate-pulse' />
                  <div className='h-6 w-24 bg-[#e8e6dc] dark:bg-[#3d3934] rounded animate-pulse' />
                </div>
                <div className='flex items-center gap-2'>
                  <div className='h-8 w-20 bg-[#e8e6dc] dark:bg-[#3d3934] rounded-md animate-pulse' />
                  <div className='h-8 w-8 bg-[#e8e6dc] dark:bg-[#3d3934] rounded-md animate-pulse' />
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
        }`}
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: disableMobilePadding ? 0 : 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div
          className={`transition-all duration-300 ${
            disableMobilePadding ? 'py-0' : 'pt-2 pb-4 lg:pt-3 lg:pb-6'
          } ${fullWidth ? 'w-full px-0' : 'container mx-auto px-4 lg:px-6'}`}
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
