'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

import { isPlayPagePath, saveProgressAndNavigate } from '@/lib/play-navigation';
import { isNavActive, useNavMenuItems } from '@/hooks/useNavMenus';

interface MobileBottomNavProps {
  /**
   * 主动指定当前激活的路径。当未提供时，自动使用 usePathname() 获取的路径。
   */
  activePath?: string;
}

const MobileBottomNav = ({ activePath }: MobileBottomNavProps) => {
  const pathname = usePathname();

  // 当前激活路径：优先使用传入的 activePath，否则回退到浏览器地址
  const currentActive = activePath ?? pathname;

  // 全站共享菜单：底部导航仅保留首页 + 内容频道
  const navItems = useNavMenuItems().filter(
    (item) => item.label === '首页' || item.group === 'channel',
  );

  // 处理导航点击，特别是在播放页面时的特殊处理
  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (isPlayPagePath()) {
        e.preventDefault();
        e.stopPropagation();
        saveProgressAndNavigate(href);
      }
    },
    [],
  );

  return (
    <nav
      className='fixed bottom-0 left-0 right-0 z-[600] border-t border-[#e8e8e8] bg-[#ffffff]/92 backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#0d0d0d]/92 md:hidden'
      style={{
        /* 紧贴视口底部，同时在内部留出安全区高度 */
        bottom: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        minHeight: 'calc(3.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <ul className='flex items-center overflow-x-auto scrollbar-hide'>
        {navItems.map((item) => {
          const active = isNavActive(currentActive, item.href);
          return (
            <li
              key={item.href}
              className='flex-shrink-0'
              style={{
                width: `${100 / navItems.length}vw`,
                minWidth: `${100 / navItems.length}vw`,
              }}
            >
              <Link
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className='group relative flex flex-col items-center justify-center w-full h-14 gap-1 text-xs'
              >
                {/* 图标容器：激活态暖色圆角底 + 微浮起，呼应首页板块图标风格 */}
                <div
                  className={`relative flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-200 ${
                    active
                      ? 'bg-[#e3f8e3] dark:bg-[#00a304]/15 scale-105'
                      : 'group-hover:bg-[#f2f2f2] dark:group-hover:bg-[#2a2a2a]/60 group-hover:scale-105'
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 transition-colors duration-200 ${
                      active
                        ? 'text-[#00a304] dark:text-[#57e07a]'
                        : 'text-[#5f5f5f] dark:text-[#a8a8a8] group-hover:text-[#00a304] dark:group-hover:text-[#57e07a]'
                    }`}
                  />
                </div>
                <span
                  className={
                    active
                      ? 'text-[#008602] dark:text-[#57e07a] font-medium'
                      : 'text-[#5f5f5f] dark:text-[#d9d9d9]'
                  }
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileBottomNav;
