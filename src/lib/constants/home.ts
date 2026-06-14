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
} as const;

// 骨架屏配置
export const SKELETON_CONFIG = {
  DEFAULT_COUNT: 8, // 默认骨架卡片数量
} as const;

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
