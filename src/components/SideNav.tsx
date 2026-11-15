'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { isPlayPagePath, saveProgressAndNavigate } from '@/lib/play-navigation';
import { isNavActive, useNavMenuItems } from '@/hooks/useNavMenus';

import Logo from './Logo';

interface SideNavProps {
  activePath?: string;
}

/**
 * 爱奇艺式左侧固定导航栏（桌面端 md+ 展示，移动端由底部导航承接）：
 * 顶部 Logo，菜单按「全局入口 / 内容频道」分组，激活项绿色文字 + 左侧绿色指示条。
 */
const SideNav = ({ activePath = '/' }: SideNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const menuItems = useNavMenuItems();

  const [active, setActive] = useState(activePath);

  useEffect(() => {
    // 优先使用传入的 activePath，否则使用当前完整路径（含 query）
    if (activePath) {
      setActive(activePath);
      return;
    }
    const queryString = searchParams.toString();
    setActive(queryString ? `${pathname}?${queryString}` : pathname);
  }, [activePath, pathname, searchParams]);

  const primaryItems = menuItems.filter(
    (item) =>
      item.group === 'primary' &&
      item.label !== '搜索' &&
      item.label !== '收藏夹',
  );
  const channelItems = menuItems.filter((item) => item.group === 'channel');

  const renderItem = (item: (typeof menuItems)[number]) => {
    const isActive = isNavActive(active, item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.label}
        href={item.href}
        data-active={isActive}
        onClick={(e) => {
          if (isPlayPagePath()) {
            e.preventDefault();
            e.stopPropagation();
            saveProgressAndNavigate(item.href);
            return;
          }
          if (item.onClick) {
            e.preventDefault();
            item.onClick();
          }
        }}
        className='group relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200 text-[#2c2c2c] hover:bg-[#f2f2f2] hover:text-[#111111] data-[active=true]:bg-[#e3f8e3] data-[active=true]:text-[#008602] dark:text-[#d9d9d9] dark:hover:bg-[#1f1f1f] dark:hover:text-[#f5f5f5] dark:data-[active=true]:bg-[#123a18] dark:data-[active=true]:text-[#57e07a]'
      >
        {/* 激活态左侧绿色指示条（爱奇艺式） */}
        {isActive && (
          <span className='absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[#00a304] dark:bg-[#1acd50]' />
        )}
        <Icon
          className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${
            isActive
              ? 'text-[#00a304] dark:text-[#57e07a]'
              : 'text-[#5f5f5f] group-hover:text-[#00a304] dark:text-[#a8a8a8] dark:group-hover:text-[#57e07a]'
          }`}
        />
        <span className='whitespace-nowrap tracking-wide'>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className='fixed inset-y-0 left-0 z-50 hidden w-44 flex-col border-r border-[#e8e8e8] bg-[#ffffff] dark:border-[#262626] dark:bg-[#0b0b0b] md:flex'>
      <div className='shrink-0 px-4'>
        <Logo />
      </div>

      <nav className='scrollbar-hide flex-1 space-y-1 overflow-y-auto px-2 pb-4 pt-1'>
        {primaryItems.map(renderItem)}

        {/* 分组分隔线（爱奇艺式） */}
        <div className='mx-3 my-3 h-px bg-[#e8e8e8] dark:bg-[#262626]' />

        {channelItems.map(renderItem)}
      </nav>
    </aside>
  );
};

export default SideNav;
