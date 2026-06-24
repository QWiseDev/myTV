/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  Cat,
  Clover,
  Film,
  Globe,
  Home,
  Menu as MenuIcon,
  Radio,
  Search,
  Star,
  Tv,
  Video,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useSite } from './SiteProvider';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  activePath?: string;
}

// Logo组件，增强设计
const Logo = () => {
  const { siteName } = useSite();
  const pathname = usePathname();

  const handleLogoClick = (e: React.MouseEvent) => {
    // 在播放页面需要特殊处理
    if (pathname?.includes('/play')) {
      e.preventDefault();
      e.stopPropagation();

      const saveProgress = () => {
        try {
          const progressEvent = new CustomEvent('savePlayProgress', {
            detail: {
              action: 'manualNavigation',
              targetUrl: '/',
            },
          });
          window.dispatchEvent(progressEvent);
        } catch (error) {
          console.warn('保存播放进度失败:', error);
        }
      };

      saveProgress();

      const beforeUnloadHandler = window.onbeforeunload;
      window.onbeforeunload = null;

      setTimeout(() => {
        window.location.href = '/';
        if (beforeUnloadHandler) {
          window.onbeforeunload = beforeUnloadHandler;
        }
      }, 100);
    }
  };

  return (
    <Link
      href='/'
      className='flex items-center h-16 select-none group'
      onClick={handleLogoClick}
    >
      <div className='relative flex items-center gap-2'>
        <span className='h-2.5 w-2.5 rounded-full bg-[#d97757] transition-transform duration-200 group-hover:scale-125 dark:bg-[#e09a7a]' />
        <span className='relative text-2xl font-semibold tracking-normal text-[#141413] transition-colors duration-200 group-hover:text-[#b85c38] dark:text-[#f8f6f0] dark:group-hover:text-[#f0b195] font-display'>
          {siteName}
        </span>
      </div>
    </Link>
  );
};

const Header = ({ activePath = '/' }: HeaderProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [active, setActive] = useState(activePath);

  useEffect(() => {
    // 优先使用传入的 activePath
    if (activePath) {
      setActive(activePath);
    } else {
      // 否则使用当前路径
      const getCurrentFullPath = () => {
        const queryString = searchParams.toString();
        return queryString ? `${pathname}?${queryString}` : pathname;
      };
      const fullPath = getCurrentFullPath();
      setActive(fullPath);
    }
  }, [activePath, pathname, searchParams]);

  const handleSearchClick = useCallback(() => {
    router.push('/search');
    setIsMobileMenuOpen(false);
  }, [router]);

  const [menuItems, setMenuItems] = useState<
    Array<{
      icon: any;
      label: string;
      href: string;
      onClick?: () => void;
    }>
  >([
    {
      icon: Globe,
      label: '源浏览器',
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
      setMenuItems((prevItems) => [
        ...prevItems,
        {
          icon: Star,
          label: '自定义',
          href: '/douban?type=custom',
        },
      ]);
    }
  }, []);

  // 所有菜单项（包括首页和搜索）
  const allMenuItems: Array<{
    icon: any;
    label: string;
    href: string;
    isSpecial?: boolean;
    onClick?: () => void;
  }> = [
    {
      icon: Home,
      label: '首页',
      href: '/',
      isSpecial: true,
    },
    {
      icon: Search,
      label: '搜索',
      href: '/search',
      isSpecial: true,
      onClick: handleSearchClick,
    },
    ...menuItems,
  ];

  return (
    <header
      className='fixed top-0 left-0 right-0 z-50 bg-[#faf9f5]/92 backdrop-blur-xl border-b border-[#e8e6dc] shadow-none dark:bg-[#191817]/92 dark:border-[#3d3934] transition-all duration-300'
      style={{
        backdropFilter: 'blur(18px) saturate(130%)',
        WebkitBackdropFilter: 'blur(18px) saturate(130%)',
      }}
    >
      <div className='relative h-16 px-3 lg:px-4 xl:px-6'>
        <div className='flex items-center justify-between h-full max-w-full xl:max-w-7xl mx-auto'>
          {/* Logo区域 */}
          <div className='flex-shrink-0 mr-3 lg:mr-4 xl:mr-6'>
            <Logo />
          </div>

          {/* 桌面端导航菜单 - 自适应布局 */}
          <div className='flex-1 flex justify-center min-w-0'>
            <nav
              className='hidden md:flex items-center gap-0.5 lg:gap-1 px-1'
              style={{
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
              }}
            >
              {/* 直接显示所有菜单项 */}
              {allMenuItems.map((item) => {
                // 检查当前路径是否匹配这个菜单项
                const typeMatch = item.href.match(/type=([^&]+)/)?.[1];

                // 解码URL以进行正确的比较
                const decodedActive = decodeURIComponent(active);
                const decodedItemHref = decodeURIComponent(item.href);

                const isActive =
                  decodedActive === decodedItemHref ||
                  (decodedActive.startsWith('/douban') &&
                    decodedActive.includes(`type=${typeMatch}`));
                const Icon = item.icon;

                const theme = {
                  hover: 'hover:bg-[#f0eee6] dark:hover:bg-[#302d29]',
                  active:
                    'data-[active=true]:bg-[#ead8cf] dark:data-[active=true]:bg-[#4a332a]',
                  text: 'text-[#30302e] dark:text-[#d9d3c9]',
                  hoverText: 'hover:text-[#141413] dark:hover:text-[#f8f6f0]',
                  activeText:
                    'data-[active=true]:text-[#8f4329] dark:data-[active=true]:text-[#f0b195]',
                  icon: 'text-[#5e5d59] dark:text-[#b7b1a8]',
                  hoverIcon:
                    'group-hover:text-[#b85c38] dark:group-hover:text-[#f0b195]',
                  activeIcon:
                    'data-[active=true]:text-[#b85c38] dark:data-[active=true]:text-[#f0b195]',
                  indicator: 'bg-[#b85c38] dark:bg-[#e09a7a]',
                };

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    data-active={isActive}
                    onClick={(e) => {
                      // 修复：在播放页面处理导航
                      if (window.location.pathname.includes('/play')) {
                        e.preventDefault();
                        e.stopPropagation();

                        // 手动触发播放进度保存，然后导航
                        const saveProgress = () => {
                          try {
                            // 触发播放进度保存事件
                            const progressEvent = new CustomEvent(
                              'savePlayProgress',
                              {
                                detail: {
                                  action: 'manualNavigation',
                                  targetUrl: item.href,
                                },
                              },
                            );
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
                          window.location.href = item.href;
                          // 恢复beforeunload监听器（如果需要）
                          if (beforeUnloadHandler) {
                            window.onbeforeunload = beforeUnloadHandler;
                          }
                        }, 100);
                        return;
                      }

                      if (item.onClick) {
                        e.preventDefault();
                        item.onClick();
                      }
                    }}
                    className={`group relative flex items-center gap-1 px-1.5 py-1.5 lg:px-2.5 lg:py-1.5 rounded-md text-xs font-medium transition-all duration-200 ease-out whitespace-nowrap flex-shrink-0 ${theme.text} ${theme.hover} ${theme.active} ${theme.hoverText} ${theme.activeText}`}
                  >
                    {/* 激活状态底部指示条 */}
                    {isActive && (
                      <div
                        className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${theme.indicator} transition-all duration-200`}
                      />
                    )}

                    {/* 图标容器：圆角描边感，hover 暖色淡底高亮，呼应首页板块图标风格 */}
                    <div
                      className={`relative flex items-center justify-center w-4 h-4 rounded-md transition-colors duration-200 group-hover:bg-[#ead8cf]/60 dark:group-hover:bg-[#4a332a]/60 ${theme.icon} ${theme.hoverIcon} ${theme.activeIcon}`}
                    >
                      <Icon className='w-3.5 h-3.5 lg:w-4 lg:h-4 transition-transform duration-200 group-hover:scale-110 group-active:scale-95' />
                    </div>

                    {/* 文字标签 */}
                    <span className='relative tracking-wide font-medium'>
                      {item.label}
                    </span>

                    {/* 激活状态光晕 */}
                    {isActive && (
                      <div
                        className={`absolute inset-0 rounded-md ${theme.indicator} opacity-10 -z-10`}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* 右侧功能区 */}
          <div className='flex items-center gap-1.5 lg:gap-2 ml-2 lg:ml-4 xl:ml-6 flex-shrink-0'>
            {/* 桌面端显示主题切换和用户菜单 */}
            <div className='hidden md:flex items-center gap-1.5 lg:gap-2'>
              <div className='p-1 rounded-md bg-[#f0eee6]/70 dark:bg-[#302d29]/70 backdrop-blur-sm border border-[#e8e6dc] dark:border-[#3d3934]'>
                <ThemeToggle />
              </div>
              <div className='p-1 rounded-md bg-[#f0eee6]/70 dark:bg-[#302d29]/70 backdrop-blur-sm border border-[#e8e6dc] dark:border-[#3d3934]'>
                <UserMenu />
              </div>
            </div>

            {/* 移动端汉堡菜单 - 增强设计 */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className='md:hidden p-2 rounded-md text-[#5e5d59] hover:text-[#141413] hover:bg-[#f0eee6] dark:text-[#b7b1a8] dark:hover:text-[#f8f6f0] dark:hover:bg-[#302d29] transition-all duration-300 backdrop-blur-sm border border-[#e8e6dc] dark:border-[#3d3934]'
            >
              {isMobileMenuOpen ? (
                <X className='h-4 w-4 transition-transform duration-300 rotate-90' />
              ) : (
                <MenuIcon className='h-4 w-4 transition-transform duration-300' />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 移动端菜单下拉 */}
      {isMobileMenuOpen && (
        <div
          className='lg:hidden absolute top-full left-0 right-0 bg-[#faf9f5]/96 backdrop-blur-xl border-b border-[#e8e6dc] shadow-sm dark:bg-[#191817]/96 dark:border-[#3d3934]'
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <nav className='px-4 py-2 space-y-1'>
            {allMenuItems.map((item) => {
              // 检查当前路径是否匹配这个菜单项
              const typeMatch = item.href.match(/type=([^&]+)/)?.[1];

              // 解码URL以进行正确的比较
              const decodedActive = decodeURIComponent(active);
              const decodedItemHref = decodeURIComponent(item.href);

              const isActive =
                decodedActive === decodedItemHref ||
                (decodedActive.startsWith('/douban') &&
                  decodedActive.includes(`type=${typeMatch}`));
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={(e) => {
                    if (item.label === '搜索') {
                      e.preventDefault();
                      handleSearchClick();
                    } else if (window.location.pathname.includes('/play')) {
                      // 修复：在播放页面的移动端菜单导航
                      e.preventDefault();
                      e.stopPropagation();

                      // 手动触发播放进度保存，然后导航
                      const saveProgress = () => {
                        try {
                          // 触发播放进度保存事件
                          const progressEvent = new CustomEvent(
                            'savePlayProgress',
                            {
                              detail: {
                                action: 'manualNavigation',
                                targetUrl: item.href,
                              },
                            },
                          );
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

                      // 强制导航
                      setTimeout(() => {
                        window.location.href = item.href;
                        // 恢复beforeunload监听器（如果需要）
                        if (beforeUnloadHandler) {
                          window.onbeforeunload = beforeUnloadHandler;
                        }
                      }, 100);
                      // 关闭移动端菜单
                      setIsMobileMenuOpen(false);
                      return;
                    }

                    // 修复：确保其他链接的点击事件能正常工作
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick();
                    }
                    // 关闭移动端菜单
                    setIsMobileMenuOpen(false);
                  }}
                  data-active={isActive}
                  className='group flex items-center rounded-md px-3 py-2 text-sm text-[#30302e] hover:bg-[#f0eee6] data-[active=true]:bg-[#ead8cf] data-[active=true]:text-[#8f4329] transition-all duration-200 dark:text-[#d9d3c9] dark:hover:bg-[#302d29] dark:data-[active=true]:bg-[#4a332a] dark:data-[active=true]:text-[#f0b195] gap-3'
                >
                  <Icon className='h-4 w-4 text-[#5e5d59] group-hover:text-[#b85c38] data-[active=true]:text-[#b85c38] dark:text-[#b7b1a8] dark:group-hover:text-[#f0b195] dark:data-[active=true]:text-[#f0b195]' />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* 移动端主题切换和用户菜单 */}
            <div className='flex items-center gap-2 pt-2 border-t border-[#e8e6dc] dark:border-[#3d3934]'>
              <ThemeToggle />
              <UserMenu />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
