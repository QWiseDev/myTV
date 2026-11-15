/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  Cat,
  Clover,
  Film,
  Globe,
  Heart,
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
        <span className='h-2.5 w-2.5 rounded-full bg-[#00be06] transition-transform duration-200 group-hover:scale-125 dark:bg-[#1acd50]' />
        <span className='relative text-2xl font-semibold tracking-normal text-[#111111] transition-colors duration-200 group-hover:text-[#00a304] dark:text-[#f5f5f5] dark:group-hover:text-[#57e07a] font-display'>
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
      label: '片源库',
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
      className='fixed top-0 left-0 right-0 z-50 bg-[#ffffff]/92 backdrop-blur-xl border-b border-[#e8e8e8] shadow-none dark:bg-[#0d0d0d]/92 dark:border-[#3a3a3a] transition-all duration-300'
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
                  hover: 'hover:bg-[#f2f2f2] dark:hover:bg-[#2a2a2a]',
                  active:
                    'data-[active=true]:bg-[#e3f8e3] dark:data-[active=true]:bg-[#123a18]',
                  text: 'text-[#2c2c2c] dark:text-[#d9d9d9]',
                  hoverText: 'hover:text-[#111111] dark:hover:text-[#f5f5f5]',
                  activeText:
                    'data-[active=true]:text-[#008602] dark:data-[active=true]:text-[#57e07a]',
                  icon: 'text-[#5f5f5f] dark:text-[#a8a8a8]',
                  hoverIcon:
                    'group-hover:text-[#00a304] dark:group-hover:text-[#57e07a]',
                  activeIcon:
                    'data-[active=true]:text-[#00a304] dark:data-[active=true]:text-[#57e07a]',
                  indicator: 'bg-[#00a304] dark:bg-[#1acd50]',
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
                      className={`relative flex items-center justify-center w-4 h-4 rounded-md transition-colors duration-200 group-hover:bg-[#e3f8e3]/60 dark:group-hover:bg-[#123a18]/60 ${theme.icon} ${theme.hoverIcon} ${theme.activeIcon}`}
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
            {/* 桌面端显示收藏夹入口和用户菜单 */}
            <div className='hidden md:flex items-center gap-1.5 lg:gap-2'>
              <div className='p-1 rounded-md bg-[#f2f2f2]/70 dark:bg-[#2a2a2a]/70 backdrop-blur-sm border border-[#e8e8e8] dark:border-[#3a3a3a]'>
                <Link
                  href='/?tab=favorites'
                  title='收藏夹'
                  className='w-8 h-8 flex items-center justify-center rounded text-[#5f5f5f] hover:text-[#00a304] dark:text-[#a8a8a8] dark:hover:text-[#1acd50] transition-colors'
                >
                  <Heart className='w-4 h-4' />
                </Link>
              </div>
              <div className='p-1 rounded-md bg-[#f2f2f2]/70 dark:bg-[#2a2a2a]/70 backdrop-blur-sm border border-[#e8e8e8] dark:border-[#3a3a3a]'>
                <UserMenu />
              </div>
            </div>

            {/* 移动端汉堡菜单 - 增强设计 */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className='md:hidden p-2 rounded-md text-[#5f5f5f] hover:text-[#111111] hover:bg-[#f2f2f2] dark:text-[#a8a8a8] dark:hover:text-[#f5f5f5] dark:hover:bg-[#2a2a2a] transition-all duration-300 backdrop-blur-sm border border-[#e8e8e8] dark:border-[#3a3a3a]'
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
          className='lg:hidden absolute top-full left-0 right-0 bg-[#ffffff]/96 backdrop-blur-xl border-b border-[#e8e8e8] shadow-sm dark:bg-[#0d0d0d]/96 dark:border-[#3a3a3a]'
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <nav className='px-4 py-2 space-y-1'>
            {/* 收藏夹入口（移动端） */}
            <Link
              href='/?tab=favorites'
              className='flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm font-medium text-[#5f5f5f] hover:bg-[#f2f2f2] hover:text-[#00a304] dark:text-[#a8a8a8] dark:hover:bg-[#2a2a2a] dark:hover:text-[#1acd50] transition-colors'
            >
              <Heart className='w-4 h-4' /> 收藏夹
            </Link>
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
                  className='group flex items-center rounded-md px-3 py-2 text-sm text-[#2c2c2c] hover:bg-[#f2f2f2] data-[active=true]:bg-[#e3f8e3] data-[active=true]:text-[#008602] transition-all duration-200 dark:text-[#d9d9d9] dark:hover:bg-[#2a2a2a] dark:data-[active=true]:bg-[#123a18] dark:data-[active=true]:text-[#57e07a] gap-3'
                >
                  <Icon className='h-4 w-4 text-[#5f5f5f] group-hover:text-[#00a304] data-[active=true]:text-[#00a304] dark:text-[#a8a8a8] dark:group-hover:text-[#57e07a] dark:data-[active=true]:text-[#57e07a]' />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* 移动端用户菜单 */}
            <div className='flex items-center gap-2 pt-2 border-t border-[#e8e8e8] dark:border-[#3a3a3a]'>
              <UserMenu />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
