'use client';

import { Heart, Menu as MenuIcon, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { isPlayPagePath, saveProgressAndNavigate } from '@/lib/play-navigation';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';
import { isNavActive, useNavMenuItems } from '@/hooks/useNavMenus';

import HeaderSearchPanel from './HeaderSearchPanel';
import Logo from './Logo';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  activePath?: string;
  /** 剧场模式（播放页/直播页）：爱奇艺播放页式顶部横向导航（左侧栏仅用于浏览页） */
  theater?: boolean;
  /** 访客模式：即使客户端残留失效 cookie 也按未登录态渲染顶栏 */
  guest?: boolean;
  /** SSR 已校验登录态时透传，避免首屏顶栏布局跳动 */
  initialLoggedIn?: boolean;
}

/**
 * 顶部栏（爱奇艺式）：
 * - 默认（首页/浏览页）：左侧 SideNav 承担导航，顶部为居中搜索框 + 右侧操作区；
 * - 剧场模式（播放/直播页）：顶部横向导航，内容全宽；
 * - 移动端：Logo、搜索入口与汉堡下拉菜单。
 */
const Header = ({
  activePath = '/',
  theater = false,
  guest = false,
  initialLoggedIn = false,
}: HeaderProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [active, setActive] = useState(activePath);

  const menuItems = useNavMenuItems();
  // 访客（未登录）：隐藏导航、搜索与收藏夹等登录入口，只留 Logo 和登录按钮
  const isLoggedIn = useIsLoggedIn(guest ? false : initialLoggedIn);
  const effectiveLoggedIn = !guest && isLoggedIn;

  // 优先使用传入的 activePath，否则使用当前完整路径（含 query）
  useEffect(() => {
    if (activePath) {
      setActive(activePath);
      return;
    }
    const queryString = searchParams.toString();
    setActive(queryString ? `${pathname}?${queryString}` : pathname);
  }, [activePath, pathname, searchParams]);

  // 搜索框与 URL ?q= 保持同步（进入搜索页回显，离开后清空）
  useEffect(() => {
    setSearchQuery(searchParams.get('q') ?? '');
  }, [pathname, searchParams]);

  const runSearch = useCallback(() => {
    const query = searchQuery.trim();
    setIsSearchPanelOpen(false);
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  }, [router, searchQuery]);

  const handleSearchClick = useCallback(() => {
    router.push('/search');
    setIsMobileMenuOpen(false);
  }, [router]);

  const handleNavLinkClick = (
    e: React.MouseEvent,
    href: string,
    onClick?: () => void,
  ) => {
    if (isPlayPagePath()) {
      e.preventDefault();
      e.stopPropagation();
      saveProgressAndNavigate(href);
      setIsMobileMenuOpen(false);
      return;
    }

    if (onClick) {
      e.preventDefault();
      onClick();
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b border-[#e8e8e8] bg-[#ffffff]/92 shadow-none backdrop-blur-xl transition-all duration-300 dark:border-[#3a3a3a] dark:bg-[#0d0d0d]/92 ${
        theater || !effectiveLoggedIn ? '' : 'md:left-44'
      }`}
      style={{
        backdropFilter: 'blur(18px) saturate(130%)',
        WebkitBackdropFilter: 'blur(18px) saturate(130%)',
      }}
    >
      <div className='relative h-16 px-3 lg:px-6'>
        <div className='flex h-full items-center gap-3'>
          {/* Logo：剧场模式全尺寸展示，否则桌面端位于左侧 SideNav（访客无侧边栏，顶栏展示 Logo） */}
          <div
            className={`flex-shrink-0 ${
              theater || !effectiveLoggedIn ? '' : 'md:hidden'
            }`}
          >
            <Logo />
          </div>

          {/* 剧场模式：顶部横向导航（爱奇艺播放页式，与旧版顶栏一致） */}
          {theater && effectiveLoggedIn && (
            <nav
              className='hidden min-w-0 flex-1 items-center justify-center gap-0.5 px-1 md:flex lg:gap-1'
              style={{
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
              }}
            >
              {menuItems
                .filter((item) => item.label !== '收藏夹')
                .map((item) => {
                  const isActive = isNavActive(active, item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      data-active={isActive}
                      onClick={(e) =>
                        handleNavLinkClick(e, item.href, item.onClick)
                      }
                      className='group relative flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-xs font-medium transition-all duration-200 ease-out text-[#2c2c2c] hover:bg-[#f2f2f2] hover:text-[#111111] data-[active=true]:bg-[#e3f8e3] data-[active=true]:text-[#008602] dark:text-[#d9d9d9] dark:hover:bg-[#2a2a2a] dark:hover:text-[#f5f5f5] dark:data-[active=true]:bg-[#123a18] dark:data-[active=true]:text-[#57e07a] lg:px-2.5'
                    >
                      {/* 激活状态底部指示条 */}
                      {isActive && (
                        <div className='absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#00a304] transition-all duration-200 dark:bg-[#1acd50]' />
                      )}

                      <div className='relative flex h-4 w-4 items-center justify-center rounded-md text-[#5f5f5f] transition-colors duration-200 group-hover:bg-[#e3f8e3]/60 group-hover:text-[#00a304] dark:text-[#a8a8a8] dark:group-hover:bg-[#123a18]/60 dark:group-hover:text-[#57e07a] dark:data-[active=true]:text-[#57e07a]'>
                        <Icon className='h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 lg:h-4 lg:w-4' />
                      </div>

                      <span className='relative font-medium tracking-wide'>
                        {item.label}
                      </span>

                      {/* 激活状态光晕 */}
                      {isActive && (
                        <div className='absolute inset-0 -z-10 rounded-md bg-[#00a304] opacity-10 dark:bg-[#1acd50]' />
                      )}
                    </Link>
                  );
                })}
            </nav>
          )}

          {/* 桌面端爱奇艺式搜索框（剧场模式隐藏，为横向导航让位；访客隐藏） */}
          {effectiveLoggedIn && (
            <form
              role='search'
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
              data-search-panel-root
              className={`relative mx-auto w-full max-w-xl ${
                theater ? 'hidden' : 'hidden md:block'
              }`}
            >
              <div className='flex h-10 w-full items-center rounded-full border border-[#e8e8e8] bg-[#f5f5f5]/90 pl-4 pr-1 transition-colors focus-within:border-[#00a304]/50 dark:border-[#3a3a3a] dark:bg-[#232323]/90 dark:focus-within:border-[#1acd50]/50'>
                <Search className='h-4 w-4 shrink-0 text-[#5f5f5f] dark:text-[#a8a8a8]' />
                <input
                  type='text'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchPanelOpen(true)}
                  onClick={() => setIsSearchPanelOpen(true)}
                  placeholder='搜索你想看的影视内容'
                  aria-label='搜索'
                  autoComplete='off'
                  className='min-w-0 flex-1 rounded-none border-0 bg-transparent px-2.5 text-sm text-[#111111] shadow-none outline-none placeholder:text-[#9a9a9a] focus:border-transparent focus:shadow-none focus:ring-0 dark:text-[#f5f5f5] dark:placeholder:text-[#6f6f6f]'
                />
                <button
                  type='submit'
                  className='h-8 shrink-0 rounded-lg bg-[#00be06] px-5 text-sm font-medium text-white transition-colors hover:bg-[#00a304] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00be06]'
                >
                  搜索
                </button>
              </div>

              {/* 聚焦弹层：搜索历史 + 片源分类榜单（爱奇艺式） */}
              <HeaderSearchPanel
                open={isSearchPanelOpen}
                onClose={() => setIsSearchPanelOpen(false)}
              />
            </form>
          )}

          {/* 移动端占位，保持右侧贴齐 */}
          <div className='flex-1 md:hidden' />

          {/* 右侧功能区 */}
          <div className='ml-auto flex flex-shrink-0 items-center gap-1.5 lg:gap-2'>
            {effectiveLoggedIn ? (
              <>
                {/* 桌面端显示收藏夹入口和用户菜单 */}
                <div className='hidden items-center gap-1.5 md:flex lg:gap-2'>
                  <div className='rounded-md border border-[#e8e8e8] bg-[#f2f2f2]/70 p-1 backdrop-blur-sm dark:border-[#3a3a3a] dark:bg-[#2a2a2a]/70'>
                    <Link
                      href='/?tab=favorites'
                      title='收藏夹'
                      className='flex h-8 w-8 items-center justify-center rounded text-[#5f5f5f] transition-colors hover:text-[#00a304] dark:text-[#a8a8a8] dark:hover:text-[#1acd50]'
                    >
                      <Heart className='h-4 w-4' />
                    </Link>
                  </div>
                  <div className='rounded-md border border-[#e8e8e8] bg-[#f2f2f2]/70 p-1 backdrop-blur-sm dark:border-[#3a3a3a] dark:bg-[#2a2a2a]/70'>
                    <UserMenu />
                  </div>
                </div>

                {/* 移动端搜索入口 */}
                <button
                  onClick={handleSearchClick}
                  aria-label='搜索'
                  className='rounded-md border border-[#e8e8e8] p-2 text-[#5f5f5f] backdrop-blur-sm transition-all duration-300 hover:bg-[#f2f2f2] hover:text-[#111111] dark:border-[#3a3a3a] dark:text-[#a8a8a8] dark:hover:bg-[#2a2a2a] dark:hover:text-[#f5f5f5] md:hidden'
                >
                  <Search className='h-4 w-4' />
                </button>

                {/* 移动端汉堡菜单 */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className='rounded-md border border-[#e8e8e8] p-2 text-[#5f5f5f] backdrop-blur-sm transition-all duration-300 hover:bg-[#f2f2f2] hover:text-[#111111] dark:border-[#3a3a3a] dark:text-[#a8a8a8] dark:hover:bg-[#2a2a2a] dark:hover:text-[#f5f5f5] md:hidden'
                >
                  {isMobileMenuOpen ? (
                    <X className='h-4 w-4 transition-transform duration-300 rotate-90' />
                  ) : (
                    <MenuIcon className='h-4 w-4 transition-transform duration-300' />
                  )}
                </button>
              </>
            ) : (
              /* 访客：仅登录按钮（桌面 + 移动端） */
              <div className='rounded-md border border-[#e8e8e8] bg-[#f2f2f2]/70 p-1 backdrop-blur-sm dark:border-[#3a3a3a] dark:bg-[#2a2a2a]/70'>
                <UserMenu guest={guest} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 移动端菜单下拉 */}
      {isMobileMenuOpen && effectiveLoggedIn && (
        <div
          className='absolute left-0 right-0 top-full border-b border-[#e8e8e8] bg-[#ffffff]/96 shadow-sm backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#0d0d0d]/96 md:hidden'
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <nav className='space-y-1 px-4 py-2'>
            {menuItems.map((item) => {
              const isActive = isNavActive(active, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={(e) =>
                    handleNavLinkClick(e, item.href, item.onClick)
                  }
                  data-active={isActive}
                  className='group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#2c2c2c] transition-all duration-200 hover:bg-[#f2f2f2] data-[active=true]:bg-[#e3f8e3] data-[active=true]:text-[#008602] dark:text-[#d9d9d9] dark:hover:bg-[#2a2a2a] dark:data-[active=true]:bg-[#123a18] dark:data-[active=true]:text-[#57e07a]'
                >
                  <Icon className='h-4 w-4 text-[#5f5f5f] group-hover:text-[#00a304] data-[active=true]:text-[#00a304] dark:text-[#a8a8a8] dark:group-hover:text-[#57e07a] dark:data-[active=true]:text-[#57e07a]' />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* 移动端用户菜单 */}
            <div className='flex items-center gap-2 border-t border-[#e8e8e8] pt-2 dark:border-[#3a3a3a]'>
              <UserMenu />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
