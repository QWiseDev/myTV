/**
 * 豆瓣 recent_hot 分类接口的共享逻辑（服务端 / 客户端通用）
 *
 * 抽离自原本散落在以下三处的重复实现：
 * - lib/home-data.server.ts（SSR 直连）
 * - app/api/douban/categories/route.ts（API 路由）
 * - lib/douban.client.ts（客户端 + CDN/代理）
 *
 * 注意：本模块为运行时中立（无 'use client'、无 Node 专属依赖），可被两端安全导入。
 */

import type { DoubanItem } from '@/lib/types';

/** 豆瓣 recent_hot 接口返回的单条原始数据 */
export interface DoubanRecentHotItem {
  id: string;
  title: string;
  card_subtitle?: string;
  pic?: {
    large?: string;
    normal?: string;
  };
  rating?: {
    value?: number;
  };
}

/** 豆瓣 recent_hot 接口返回的整体结构 */
export interface DoubanRecentHotResponse {
  total?: number;
  items?: DoubanRecentHotItem[];
}

export interface DoubanCategoryUrlParams {
  kind: 'movie' | 'tv';
  category: string;
  type: string;
  pageStart?: number;
  pageLimit?: number;
}

/** 豆瓣 recent_hot 接口可选的 host（官方 / 腾讯 CDN / 阿里 CDN） */
export const DOUBAN_RECENT_HOT_HOSTS = {
  default: 'https://m.douban.com',
  tencent: 'https://m.douban.cmliussss.net',
  ali: 'https://m.douban.cmliussss.com',
} as const;

/** 构造豆瓣 recent_hot 分类接口的完整 URL */
export function buildDoubanCategoryUrl(
  { kind, category, type, pageStart = 0, pageLimit = 20 }: DoubanCategoryUrlParams,
  host: string = DOUBAN_RECENT_HOT_HOSTS.default
): string {
  return `${host}/rexxar/api/v2/subject/recent_hot/${kind}?start=${pageStart}&limit=${pageLimit}&category=${category}&type=${type}`;
}

/** 将豆瓣 recent_hot 原始数据统一映射为 DoubanItem 列表 */
export function mapDoubanRecentHotItems(
  response: DoubanRecentHotResponse | null | undefined
): DoubanItem[] {
  return (response?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.pic?.normal || item.pic?.large || '',
    rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
    year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
  }));
}
