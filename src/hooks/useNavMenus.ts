/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Cat,
  Citrus,
  Clover,
  Film,
  Globe,
  Heart,
  Home,
  Radio,
  Search,
  Star,
  Tv,
  Video,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';

export interface NavMenuItem {
  icon: any;
  label: string;
  href: string;
  /** primary：全局入口（首页/收藏夹/搜索）；channel：内容频道 */
  group: 'primary' | 'channel';
  onClick?: () => void;
}

const CONTENT_MENU_ITEMS: Array<{
  icon: any;
  label: string;
  href: string;
}> = [
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
];

/**
 * 全站共享的导航菜单数据：侧边栏、顶栏移动端下拉、底部导航共用，
 * 运行时配置的自定义分类挂载后追加到频道组末尾。
 */
export function useNavMenuItems(): NavMenuItem[] {
  const router = useRouter();
  const isLoggedIn = useIsLoggedIn();
  const [hasCustomCategories, setHasCustomCategories] = useState(false);

  useEffect(() => {
    const customCategories = window.RUNTIME_CONFIG?.CUSTOM_CATEGORIES;
    if (customCategories && customCategories.length > 0) {
      setHasCustomCategories(true);
    }
  }, []);

  const items: NavMenuItem[] = [
    { icon: Home, label: '首页', href: '/', group: 'primary' },
    {
      icon: Heart,
      label: '收藏夹',
      href: '/?tab=favorites',
      group: 'primary',
    },
    {
      icon: Search,
      label: '搜索',
      href: '/search',
      group: 'primary',
      onClick: () => router.push('/search'),
    },
    ...CONTENT_MENU_ITEMS.map((item) => ({
      ...item,
      group: 'channel' as const,
    })),
  ];

  if (hasCustomCategories) {
    items.push({
      icon: Star,
      label: '自定义',
      href: '/douban?type=custom',
      group: 'channel',
    });
  }

  // 黄果模块（成人源）：仅登录用户可见，访客隐藏
  if (isLoggedIn) {
    items.push({
      icon: Citrus,
      label: '黄果',
      href: '/source-browser?group=adult',
      group: 'channel',
    });
  }

  return items;
}

/** 按当前完整路径（含 query）判断菜单项是否激活 */
export function isNavActive(currentPath: string, href: string): boolean {
  const typeMatch = href.match(/type=([^&]+)/)?.[1];

  const decodedCurrent = decodeURIComponent(currentPath);
  const decodedHref = decodeURIComponent(href);

  return (
    decodedCurrent === decodedHref ||
    (decodedCurrent.startsWith('/douban') &&
      decodedCurrent.includes(`type=${typeMatch}`)) ||
    (href === '/shortvideo' && decodedCurrent.startsWith('/shortvideo'))
  );
}
