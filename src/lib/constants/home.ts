/**
 * 首页相关常量配置
 */

// 数据获取超时配置（毫秒）
export const DATA_FETCH_TIMEOUTS = {
  CRITICAL: 5000, // 关键数据（电影）- 首屏优先
  SECONDARY: 6000, // 次要数据（剧集、综艺）
  TERTIARY: 8000, // 低优先级数据（Bangumi）
} as const;

// 延迟执行配置（毫秒）
export const DELAYS = {
  AI_STATUS_CHECK: 2000, // AI 状态检查延迟
  WATCHING_UPDATES_CHECK: 2000, // 追番更新缓存拉取延迟
  FAVORITE_UPDATE_DEBOUNCE: 300, // 收藏更新防抖延迟
  CACHE_CLEANUP: 100, // 缓存清理延迟
  TERTIARY_LOAD: 1200, // 新番数据 idle 加载延迟，错开首屏图片
} as const;

// 骨架屏配置
export const SKELETON_CONFIG = {
  DEFAULT_COUNT: 6, // 默认骨架卡片数量（横向首屏可见量）
  CONTINUE_WATCHING_COUNT: 6, // 继续观看骨架数量
} as const;

// 首页首屏渲染上限：降低图片并发与 DOM 成本
export const HOME_RENDER_LIMITS = {
  HOT_SECTION: 12,
  BANGUMI: 12,
  CONTINUE_WATCHING_PAGE: 12,
} as const;

export const HOME_VIDEO_CARD_SIZES =
  '(max-width: 640px) 120px, (max-width: 768px) 176px, (max-width: 1024px) 200px, 220px';

/** 区块操作按钮/链接的中性文字色（清空等） */
export const HOME_SECTION_ACTION_CLASS =
  'text-sm text-[#5e5d59] hover:text-[#b85c38] dark:text-[#b7b1a8] dark:hover:text-[#f0b195] transition-colors';

/** 「查看更多」链接样式 */
export const HOME_SECTION_LINK_CLASS = `flex items-center ${HOME_SECTION_ACTION_CLASS}`;

// 周日映射（用于 Bangumi 新番放送）
export const WEEKDAY_NAMES = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];
