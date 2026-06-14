/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  Cat,
  Clover,
  Film,
  Globe,
  Home,
  Radio,
  Star,
  Tv,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

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

  // 处理导航点击，特别是在播放页面时的特殊处理
  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      // 检查是否在播放页面
      if (window.location.pathname.includes('/play')) {
        e.preventDefault();
        e.stopPropagation();

        // 手动触发播放进度保存，然后导航
        const saveProgress = () => {
          try {
            // 触发播放进度保存事件
            const progressEvent = new CustomEvent('savePlayProgress', {
              detail: {
                action: 'manualNavigation',
                targetUrl: href,
              },
            });
            window.dispatchEvent(progressEvent);
          } catch (error) {
            console.warn('保存播放进度失败:', error);
          }
        };

        // 保存进度后导航
        saveProgress();

        // 临时移除beforeunload监听器以允许导航
        const beforeUnloadHandler = window.onbeforeunload;
        window.onbeforeunload = null;

        // 强制导航，使用setTimeout确保事件处理完成
        setTimeout(() => {
          window.location.href = href;
          // 恢复beforeunload监听器（如果需要）
          if (beforeUnloadHandler) {
            window.onbeforeunload = beforeUnloadHandler;
          }
        }, 100);
        return;
      }
    },
    []
  );

  const [navItems, setNavItems] = useState([
    { icon: Home, label: '首页', href: '/' },
    {
      icon: Globe,
      label: '源浏览',
      href: '/source-browser',
    },
    {
      icon: Film,
      label: '电影',
      href: '/douban?type=movie',
    },
    {
      icon: Tv,
      label: '剧集',
      href: '/douban?type=tv',
    },
    {
      icon: Video,
      label: '短视频',
      href: '/shortvideo',
    },
    {
      icon: Cat,
      label: '动漫',
      href: '/douban?type=anime',
    },
    {
      icon: Clover,
      label: '综艺',
      href: '/douban?type=show',
    },
    {
      icon: Radio,
      label: '直播',
      href: '/live',
    },
  ]);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setNavItems((prevItems) => [
        ...prevItems,
        {
          icon: Star,
          label: '自定义',
          href: '/douban?type=custom',
        },
      ]);
    }
  }, []);

  const isActive = (href: string) => {
    const typeMatch = href.match(/type=([^&]+)/)?.[1];

    // 解码URL以进行正确的比较
    const decodedActive = decodeURIComponent(currentActive);
    const decodedItemHref = decodeURIComponent(href);

    return (
      decodedActive === decodedItemHref ||
      (decodedActive.startsWith('/douban') &&
        decodedActive.includes(`type=${typeMatch}`)) ||
      (href === '/shortvideo' && decodedActive.startsWith('/shortvideo'))
    );
  };

  return (
    <nav
      className='md:hidden fixed left-0 right-0 z-[600] bg-[#faf9f5]/92 backdrop-blur-xl border-t border-[#e8e6dc] overflow-hidden dark:bg-[#191817]/92 dark:border-[#3d3934]'
      style={{
        /* 紧贴视口底部，同时在内部留出安全区高度 */
        bottom: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        minHeight: 'calc(3.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <ul className='flex items-center overflow-x-auto scrollbar-hide'>
        {navItems.map((item) => {
          const active = isActive(item.href);
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
                className='flex flex-col items-center justify-center w-full h-14 gap-1 text-xs'
              >
                <item.icon
                  className={`h-6 w-6 ${
                    active
                      ? 'text-[#b85c38] dark:text-[#f0b195]'
                      : 'text-[#5e5d59] dark:text-[#b7b1a8]'
                  }`}
                />
                <span
                  className={
                    active
                      ? 'text-[#8f4329] dark:text-[#f0b195]'
                      : 'text-[#5e5d59] dark:text-[#d9d3c9]'
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
