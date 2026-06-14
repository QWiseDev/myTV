import React from 'react';

/**
 * VideoCard 相关常量和工具函数
 */

// 禁用选择和长按的通用样式
export const noSelectStyle: React.CSSProperties = {
  WebkitUserSelect: 'none',
  userSelect: 'none',
  WebkitTouchCallout: 'none',
  WebkitTapHighlightColor: 'transparent',
};

// 禁用指针事件的样式（用于图片等）
export const noPointerStyle: React.CSSProperties = {
  ...noSelectStyle,
  pointerEvents: 'none',
};

// 卡片容器样式
export const cardContainerStyle: React.CSSProperties = {
  ...noSelectStyle,
  touchAction: 'manipulation',
  pointerEvents: 'auto',
};

// 阻止默认右键菜单的处理函数
export const preventContextMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  return false;
};

// 阻止拖拽的处理函数
export const preventDragStart = (e: React.DragEvent) => {
  e.preventDefault();
  return false;
};

/**
 * 构建播放页面 URL
 */
export interface BuildPlayUrlParams {
  origin?: 'vod' | 'live';
  from: string;
  source?: string;
  id?: string;
  title: string;
  year?: string;
  doubanId?: number;
  searchType?: string;
  isAggregate?: boolean;
  query?: string;
}

export function buildPlayUrl(params: BuildPlayUrlParams): string {
  const {
    origin,
    from,
    source,
    id,
    title,
    year,
    doubanId,
    searchType,
    isAggregate,
    query,
  } = params;

  const doubanIdParam =
    doubanId && doubanId > 0 ? `&douban_id=${doubanId}` : '';
  const resolvedTitle = title.trim() || query?.trim() || '';

  if (origin === 'live' && source && id) {
    return `/live?source=${source.replace('live_', '')}&id=${id.replace(
      'live_',
      ''
    )}`;
  }

  if (from === 'douban' || (isAggregate && !source && !id)) {
    return `/play?title=${encodeURIComponent(resolvedTitle)}${
      year ? `&year=${year}` : ''
    }${doubanIdParam}${searchType ? `&stype=${searchType}` : ''}${
      isAggregate ? '&prefer=true' : ''
    }${query ? `&stitle=${encodeURIComponent(query.trim())}` : ''}`;
  }

  if (source && id) {
    return `/play?source=${source}&id=${id}&title=${encodeURIComponent(resolvedTitle)}${
      year ? `&year=${year}` : ''
    }${doubanIdParam}${isAggregate ? '&prefer=true' : ''}${
      query ? `&stitle=${encodeURIComponent(query.trim())}` : ''
    }${searchType ? `&stype=${searchType}` : ''}`;
  }

  return '';
}

/**
 * 根据评分获取徽章样式
 */
export interface RatingBadgeStyle {
  bgColor: string;
  ringColor: string;
  shadowColor: string;
  textColor: string;
  glowClass: string;
}

export function getRatingBadgeStyle(rateStr: string): RatingBadgeStyle {
  const rateNum = parseFloat(rateStr);

  if (rateNum >= 8.5) {
    return {
      bgColor: 'bg-[#141413]/90 dark:bg-[#f8f6f0]/90',
      ringColor: 'ring-1 ring-white/25',
      shadowColor: 'shadow-sm',
      textColor: 'text-white',
      glowClass: 'dark:text-[#141413]',
    };
  }

  if (rateNum >= 7.0) {
    return {
      bgColor: 'bg-[#d97757]/92',
      ringColor: 'ring-1 ring-white/25',
      shadowColor: 'shadow-sm',
      textColor: 'text-white',
      glowClass: 'dark:bg-[#e09a7a]/92 dark:text-[#141413]',
    };
  }

  if (rateNum >= 6.0) {
    return {
      bgColor: 'bg-[#8f4329]/92',
      ringColor: 'ring-1 ring-white/25',
      shadowColor: 'shadow-sm',
      textColor: 'text-white',
      glowClass: 'dark:bg-[#c87858]/92 dark:text-[#141413]',
    };
  }

  return {
    bgColor: 'bg-[#5e5d59]/92 dark:bg-[#d9d3c9]/92',
    ringColor: 'ring-1 ring-white/25',
    shadowColor: 'shadow-sm',
    textColor: 'text-white',
    glowClass: 'dark:text-[#141413]',
  };
}

/**
 * VideoCard 显示配置
 */
export interface VideoCardConfig {
  showSourceName: boolean;
  showProgress: boolean;
  showPlayButton: boolean;
  showHeart: boolean;
  showCheckCircle: boolean;
  showDoubanLink: boolean;
  showRating: boolean;
  showYear: boolean;
}

export function getVideoCardConfig(
  from: string,
  rate?: string
): VideoCardConfig {
  const configs: Record<string, VideoCardConfig> = {
    playrecord: {
      showSourceName: true,
      showProgress: true,
      showPlayButton: true,
      showHeart: true,
      showCheckCircle: true,
      showDoubanLink: false,
      showRating: false,
      showYear: false,
    },
    favorite: {
      showSourceName: true,
      showProgress: false,
      showPlayButton: true,
      showHeart: true,
      showCheckCircle: false,
      showDoubanLink: false,
      showRating: false,
      showYear: false,
    },
    search: {
      showSourceName: true,
      showProgress: false,
      showPlayButton: true,
      showHeart: true,
      showCheckCircle: false,
      showDoubanLink: true,
      showRating: false,
      showYear: true,
    },
    douban: {
      showSourceName: false,
      showProgress: false,
      showPlayButton: true,
      showHeart: false,
      showCheckCircle: false,
      showDoubanLink: true,
      showRating: !!rate,
      showYear: false,
    },
  };

  return configs[from] || configs.search;
}

/**
 * 优先显示的播放源列表
 */
export const PRIORITY_SOURCES = [
  '爱奇艺',
  '腾讯视频',
  '优酷',
  '芒果TV',
  '哔哩哔哩',
  'Netflix',
  'Disney+',
];

/**
 * 按优先级排序播放源
 */
export function sortSourcesByPriority(sources: string[]): string[] {
  return [...sources].sort((a, b) => {
    const aIndex = PRIORITY_SOURCES.indexOf(a);
    const bIndex = PRIORITY_SOURCES.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
}
