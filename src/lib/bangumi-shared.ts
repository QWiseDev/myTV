/**
 * Bangumi 日历接口的共享常量与工具（服务端 / 客户端通用）
 *
 * 说明：客户端 GetBangumiCalendarData（bangumi.client.ts）带 ClientCache 与 AbortController，
 * 服务端 getBangumiCalendar（home-data.server.ts）带 next.revalidate 缓存，二者抓取策略不同，
 * 无法共用整段逻辑；此处仅抽离重复的端点地址与返回值归一化，避免魔法字符串散落。
 */

import type { BangumiCalendarData } from '@/lib/bangumi.client';

/** Bangumi 每日放送日历接口 */
export const BANGUMI_CALENDAR_ENDPOINT = 'https://api.bgm.tv/calendar';

/** 将 Bangumi 日历接口返回值归一化为数组（非数组一律视为空） */
export function normalizeBangumiCalendar(data: unknown): BangumiCalendarData[] {
  return Array.isArray(data) ? (data as BangumiCalendarData[]) : [];
}
