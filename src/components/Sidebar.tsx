/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  Cat,
  Clover,
  Film,
  Globe,
  Home,
  Menu,
  Radio,
  Search,
  Star,
  Tv,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

import { useSite } from './SiteProvider';

interface SidebarContextType {
  isCollapsed: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
});

export const useSidebar = () => useContext(SidebarContext);

// 可替换为你自己的 logo 图片
const Logo = () => {
  const { siteName } = useSite();
  return (
    <Link
      href='/'
      className='flex items-center justify-center h-16 select-none group'
    >
      <div className='relative'>
        {/* 发光背景效果 */}
        <div className='absolute inset-0 bg-gradient-to-r from-[#d97757] via-[#b85c38] to-[#e09a7a] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-lg scale-110'></div>

        <span className='relative text-2xl font-bold bg-gradient-to-r from-[#b85c38] via-[#d97757] to-[#e09a7a] dark:from-[#e09a7a] dark:via-[#f0b195] dark:to-[#f5c9b3] bg-clip-text text-transparent tracking-tight transition-all duration-300 group-hover:scale-105 inline-block group-hover:drop-shadow-[0_0_8px_rgba(184,92,56,0.5)]'>
          {siteName}
        </span>
      </div>
    </Link>
  );
};

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  activePath?: string;
}

// 在浏览器环境下通过全局变量缓存折叠状态，避免组件重新挂载时出现初始值闪烁
declare global {
  interface Window {
    __sidebarCollapsed?: boolean;
  }
}

const Sidebar = ({ onToggle, activePath = '/' }: SidebarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 若同一次 SPA 会话中已经读取过折叠状态，则直接复用，避免闪烁
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (
      typeof window !== 'undefined' &&
      typeof window.__sidebarCollapsed === 'boolean'
    ) {
      return window.__sidebarCollapsed;
    }
    return false; // 默认展开
  });

  // 首次挂载时读取 localStorage，以便刷新后仍保持上次的折叠状态
  useLayoutEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      const val = JSON.parse(saved);
      setIsCollapsed(val);
      window.__sidebarCollapsed = val;
    }
  }, []);

  // 当折叠状态变化时，同步到 <html> data 属性，供首屏 CSS 使用
  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      if (isCollapsed) {
        document.documentElement.dataset.sidebarCollapsed = 'true';
      } else {
        delete document.documentElement.dataset.sidebarCollapsed;
      }
    }
  }, [isCollapsed]);

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

  const handleToggle = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
    if (typeof window !== 'undefined') {
      window.__sidebarCollapsed = newState;
    }
    onToggle?.(newState);
  }, [isCollapsed, onToggle]);

  const handleSearchClick = useCallback(() => {
    router.push('/search');
  }, [router]);

  const contextValue = {
    isCollapsed,
  };

  const [menuItems, setMenuItems] = useState([
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

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const auth = getAuthInfoFromBrowserCookie();
    const admin = auth?.role === 'owner' || auth?.role === 'admin';
    setIsAdmin(admin);
  }, []);

  useEffect(() => {
    setMenuItems((prevItems) => {
      const hasSourceTest = prevItems.some(
        (item) => item.href === '/source-test',
      );

      if (isAdmin) {
        if (hasSourceTest) {
          return prevItems;
        }

        const newItems = [...prevItems];
        const insertIndex = newItems.findIndex(
          (item) => item.href === '/source-browser',
        );
        const sourceTestItem = {
          icon: Search,
          label: '源检测',
          href: '/source-test',
        };

        if (insertIndex !== -1) {
          newItems.splice(insertIndex + 1, 0, sourceTestItem);
        } else {
          newItems.push(sourceTestItem);
        }

        return newItems;
      }

      if (!hasSourceTest) {
        return prevItems;
      }

      return prevItems.filter((item) => item.href !== '/source-test');
    });
  }, [isAdmin]);

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

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* 在移动端隐藏侧边栏 */}
      <div className='hidden md:flex'>
        <aside
          data-sidebar
          className={`fixed top-0 left-0 h-screen bg-white/40 backdrop-blur-xl transition-all duration-300 border-r border-gray-200/50 z-10 shadow-lg dark:bg-gray-900/70 dark:border-gray-700/50 ${
            isCollapsed ? 'w-16' : 'w-64'
          }`}
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* 装饰性背景光晕 */}
          <div className='absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#d97757]/5 via-[#b85c38]/5 to-transparent pointer-events-none'></div>
          <div className='absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#b85c38]/5 via-[#e09a7a]/5 to-transparent pointer-events-none'></div>

          <div className='flex h-full flex-col relative z-10'>
            {/* 顶部 Logo 区域 */}
            <div className='relative h-16'>
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                  isCollapsed ? 'opacity-0' : 'opacity-100'
                }`}
              >
                <div className='w-[calc(100%-4rem)] flex justify-center'>
                  {!isCollapsed && <Logo />}
                </div>
              </div>
              <button
                onClick={handleToggle}
                className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-700 transition-all duration-300 z-10 dark:text-gray-400 dark:hover:text-gray-200 group/toggle ${
                  isCollapsed ? 'left-1/2 -translate-x-1/2' : 'right-2'
                }`}
              >
                {/* 渐变边框效果 */}
                <div className='absolute inset-0 rounded-full bg-gradient-to-r from-[#d97757] via-[#b85c38] to-[#8f4329] opacity-0 group-hover/toggle:opacity-100 transition-opacity duration-300 animate-pulse'></div>
                <div className='absolute inset-[2px] rounded-full bg-white dark:bg-gray-900 group-hover/toggle:bg-gray-50 dark:group-hover/toggle:bg-gray-800 transition-colors duration-300'></div>

                <Menu className='h-4 w-4 relative z-10 transition-transform duration-300 group-hover/toggle:rotate-180' />
              </button>
            </div>

            {/* 首页和搜索导航 */}
            <nav className='px-2 mt-4 space-y-1'>
              <Link
                href='/'
                onClick={() => setActive('/')}
                data-active={active === '/'}
                className={`group relative flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gradient-to-r hover:from-[#f5f3eb] hover:to-[#faf9f5] hover:text-[#b85c38] data-[active=true]:bg-gradient-to-r data-[active=true]:from-[#ead8cf] data-[active=true]:to-[#f5e3d8] data-[active=true]:text-[#8f4329] font-medium transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:from-[#b85c38]/10 dark:hover:to-[#d97757]/10 dark:hover:text-[#f0b195] dark:data-[active=true]:from-[#b85c38]/20 dark:data-[active=true]:to-[#d97757]/15 dark:data-[active=true]:text-[#f0b195] ${
                  isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                } gap-3 justify-start hover:shadow-md hover:shadow-[#b85c38]/10 data-[active=true]:shadow-lg data-[active=true]:shadow-[#b85c38]/20`}
              >
                <div className='w-4 h-4 flex items-center justify-center relative z-10'>
                  <Home className='h-4 w-4 text-gray-500 group-hover:text-[#b85c38] data-[active=true]:text-[#b85c38] dark:text-gray-400 dark:group-hover:text-[#f0b195] dark:data-[active=true]:text-[#f0b195] transition-all duration-200 group-hover:scale-110' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100 relative z-10'>
                    首页
                  </span>
                )}
                {/* 激活状态的左侧边框指示器 */}
                <div
                  className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-gradient-to-b from-[#b85c38] to-[#d97757] rounded-r-full transition-all duration-200 data-[active=true]:h-8 opacity-0 data-[active=true]:opacity-100'
                  data-active={active === '/'}
                ></div>
              </Link>
              <Link
                href='/search'
                onClick={(e) => {
                  e.preventDefault();
                  handleSearchClick();
                  setActive('/search');
                }}
                data-active={active === '/search'}
                className={`group relative flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gradient-to-r hover:from-[#f5f3eb] hover:to-[#faf9f5] hover:text-[#b85c38] data-[active=true]:bg-gradient-to-r data-[active=true]:from-[#ead8cf] data-[active=true]:to-[#f5e3d8] data-[active=true]:text-[#8f4329] font-medium transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:from-[#b85c38]/10 dark:hover:to-[#d97757]/10 dark:hover:text-[#f0b195] dark:data-[active=true]:from-[#b85c38]/20 dark:data-[active=true]:to-[#d97757]/15 dark:data-[active=true]:text-[#f0b195] ${
                  isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                } gap-3 justify-start hover:shadow-md hover:shadow-[#b85c38]/10 data-[active=true]:shadow-lg data-[active=true]:shadow-[#b85c38]/20`}
              >
                <div className='w-4 h-4 flex items-center justify-center relative z-10'>
                  <Search className='h-4 w-4 text-gray-500 group-hover:text-[#b85c38] data-[active=true]:text-[#b85c38] dark:text-gray-400 dark:group-hover:text-[#f0b195] dark:data-[active=true]:text-[#f0b195] transition-all duration-200 group-hover:scale-110' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100 relative z-10'>
                    搜索
                  </span>
                )}
                {/* 激活状态的左侧边框指示器 */}
                <div
                  className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-gradient-to-b from-[#b85c38] to-[#d97757] rounded-r-full transition-all duration-200 data-[active=true]:h-8 opacity-0 data-[active=true]:opacity-100'
                  data-active={active === '/search'}
                ></div>
              </Link>
            </nav>

            {/* 菜单项 */}
            <div className='flex-1 overflow-y-auto px-2 pt-4'>
              <div className='space-y-1'>
                {menuItems.map((item, index) => {
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

                  // 统一暖色主题：延续品牌 #b85c38 色系，克制优雅，各菜单仅靠图标形状区分
                  const colorThemes = [
                    {
                      hover:
                        'hover:from-[#f5f3eb] hover:to-[#faf9f5] dark:hover:from-[#b85c38]/10 dark:hover:to-[#d97757]/10',
                      active:
                        'data-[active=true]:from-[#ead8cf] data-[active=true]:to-[#f5e3d8] dark:data-[active=true]:from-[#b85c38]/20 dark:data-[active=true]:to-[#d97757]/15',
                      text: 'hover:text-[#b85c38] data-[active=true]:text-[#8f4329] dark:hover:text-[#f0b195] dark:data-[active=true]:text-[#f0b195]',
                      icon: 'group-hover:text-[#b85c38] data-[active=true]:text-[#b85c38] dark:group-hover:text-[#f0b195] dark:data-[active=true]:text-[#f0b195]',
                      shadow:
                        'hover:shadow-[#b85c38]/10 data-[active=true]:shadow-[#b85c38]/20',
                      border: 'from-[#b85c38] to-[#d97757]',
                    },
                  ];

                  const theme = colorThemes[0];

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setActive(item.href)}
                      data-active={isActive}
                      className={`group relative flex items-center rounded-lg px-2 py-2 pl-4 text-sm text-gray-700 hover:bg-gradient-to-r ${
                        theme.hover
                      } ${theme.active} ${
                        theme.text
                      } transition-all duration-200 min-h-[40px] dark:text-gray-300 ${
                        isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                      } gap-3 justify-start hover:shadow-md ${
                        theme.shadow
                      } animate-[slideInFromLeft_0.3s_ease-out] opacity-0`}
                      style={{
                        animation: `slideInFromLeft 0.3s ease-out ${
                          index * 0.05
                        }s forwards`,
                      }}
                    >
                      <div className='w-4 h-4 flex items-center justify-center relative z-10'>
                        <Icon
                          className={`h-4 w-4 text-gray-500 ${theme.icon} dark:text-gray-400 transition-all duration-200 group-hover:scale-110 group-hover:rotate-12`}
                        />
                      </div>
                      {!isCollapsed && (
                        <span className='whitespace-nowrap transition-opacity duration-200 opacity-100 relative z-10'>
                          {item.label}
                        </span>
                      )}
                      {/* 激活状态的左侧边框指示器 */}
                      <div
                        className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-gradient-to-b ${theme.border} rounded-r-full transition-all duration-200 data-[active=true]:h-8 opacity-0 data-[active=true]:opacity-100`}
                        data-active={isActive}
                      ></div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
        <div
          className={`transition-all duration-300 sidebar-offset ${
            isCollapsed ? 'w-16' : 'w-64'
          }`}
        ></div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Sidebar;
