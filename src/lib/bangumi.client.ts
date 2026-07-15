'use client';

import {
  BANGUMI_CALENDAR_ENDPOINT,
  normalizeBangumiCalendar,
} from '@/lib/bangumi-shared';

import { ClientCache } from './client-cache';

export interface BangumiCalendarData {
  weekday: {
    en: string;
    cn?: string;
    ja?: string;
    id?: number;
  };
  items: {
    id: number;
    name: string;
    name_cn?: string;
    rating?: {
      total?: number;
      count?: Record<string, number>;
      score?: number;
    };
    air_date?: string;
    air_weekday?: number;
    rank?: number;
    images?: {
      large?: string;
      common?: string;
      medium?: string;
      small?: string;
      grid?: string;
    };
    collection?: {
      doing?: number;
    };
    url?: string;
    type?: number;
    summary?: string;
  }[];
}

const BANGUMI_CACHE_KEY = 'bangumi-calendar-v1';
const BANGUMI_CACHE_EXPIRE = 30 * 60; // 30分钟

export async function GetBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  try {
    const cached = await ClientCache.get(BANGUMI_CACHE_KEY);
    const cachedCalendar = normalizeBangumiCalendar(cached);
    if (cachedCalendar.length > 0) {
      return cachedCalendar;
    }
  } catch {
    // 缓存读取失败不影响主流程
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时

  try {
    const response = await fetch(BANGUMI_CALENDAR_ENDPOINT, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Bangumi API 请求失败: HTTP ${response.status}`);
    }

    const data = normalizeBangumiCalendar(await response.json());

    if (data.length > 0) {
      ClientCache.set(BANGUMI_CACHE_KEY, data, BANGUMI_CACHE_EXPIRE).catch(
        () => undefined,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('Bangumi API 请求超时');
    } else {
      console.error('获取 Bangumi 数据失败:', error);
    }
    return []; // 返回空数组，不阻塞页面
  } finally {
    clearTimeout(timeoutId);
  }
}
