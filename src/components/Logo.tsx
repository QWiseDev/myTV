'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { saveProgressAndNavigate } from '@/lib/play-navigation';

import { useSite } from './SiteProvider';

/** 站点 Logo：绿色圆点 + 站点名，播放页点击时先保存进度再跳回首页 */
const Logo = () => {
  const { siteName } = useSite();
  const pathname = usePathname();

  const handleLogoClick = (e: React.MouseEvent) => {
    // 在播放页面需要特殊处理
    if (pathname?.includes('/play')) {
      e.preventDefault();
      e.stopPropagation();
      saveProgressAndNavigate('/');
    }
  };

  return (
    <Link
      href='/'
      className='flex items-center h-16 select-none group'
      onClick={handleLogoClick}
    >
      <div className='relative flex items-center gap-2'>
        <span className='h-2.5 w-2.5 rounded-full bg-[#00be06] transition-transform duration-200 group-hover:scale-125 dark:bg-[#1acd50]' />
        <span className='relative text-2xl font-semibold tracking-normal text-[#111111] transition-colors duration-200 group-hover:text-[#00a304] dark:text-[#f5f5f5] dark:group-hover:text-[#57e07a] font-display'>
          {siteName}
        </span>
      </div>
    </Link>
  );
};

export default Logo;
