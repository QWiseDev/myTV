'use client';

import {
  BANGUMI_CALENDAR_ENDPOINT,
  normalizeBangumiCalendar,
} from '@/lib/bangumi-shared';

import { ClientCache } from './client-cache';
import { withAbortableTimeout } from './promise-timeout';

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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;

  if (signal.reason !== undefined) {
    throw signal.reason;
  }

  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  throw error;
}

export async function fetchBangumiCalendarData(
  signal?: AbortSignal,
): Promise<BangumiCalendarData[]> {
  throwIfAborted(signal);

  let cached: unknown = null;
  try {
    cached = await ClientCache.get(BANGUMI_CACHE_KEY);
  } catch {
    // 缓存读取失败不影响主流程
  }
  throwIfAborted(signal);

  const cachedCalendar = normalizeBangumiCalendar(cached);
  if (cachedCalendar.length > 0) {
    return cachedCalendar;
  }

  return withAbortableTimeout(
    async (requestSignal) => {
      const response = await fetch(BANGUMI_CALENDAR_ENDPOINT, {
        signal: requestSignal,
        headers: {
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Bangumi API 请求失败: HTTP ${response.status}`);
      }

      const data = normalizeBangumiCalendar(await response.json());
      throwIfAborted(requestSignal);

      if (data.length > 0) {
        ClientCache.set(BANGUMI_CACHE_KEY, data, BANGUMI_CACHE_EXPIRE).catch(
          () => undefined,
        );
      }

      return data;
    },
    8000,
    signal,
  );
}

export async function GetBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  try {
    return await fetchBangumiCalendarData();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      console.warn('Bangumi API 请求超时');
    } else {
      console.error('获取 Bangumi 数据失败:', error);
    }
    return []; // 返回空数组，不阻塞页面
  }
}
