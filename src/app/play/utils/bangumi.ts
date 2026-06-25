import { ClientCache } from '@/lib/client-cache';

import type { BangumiDetails } from '../types';

// Bangumi 缓存默认保留 4 小时
const BANGUMI_CACHE_EXPIRE = 4 * 60 * 60 * 1000;

// 判断是否为 bangumi ID（3-6 位纯数字）
export const isBangumiId = (id: number): boolean => {
  const length = id.toString().length;
  return id > 0 && length >= 3 && length <= 6;
};

const isBangumiDetails = (value: unknown): value is BangumiDetails => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<BangumiDetails>;
  return (
    typeof record.summary === 'string' &&
    Array.isArray(record.tags) &&
    Boolean(record.rating) &&
    Boolean(record.images)
  );
};

const getBangumiCache = async (id: number): Promise<BangumiDetails | null> => {
  try {
    const cacheKey = `bangumi-details-${id}`;
    // 优先读取统一存储
    const cached = await ClientCache.get(cacheKey);
    if (isBangumiDetails(cached)) return cached;

    // 兜底使用 localStorage，兼容老数据
    if (typeof localStorage !== 'undefined') {
      const localCached = localStorage.getItem(cacheKey);
      if (localCached) {
        const { data, expire } = JSON.parse(localCached);
        if (Date.now() <= expire && isBangumiDetails(data)) {
          return data;
        }
        localStorage.removeItem(cacheKey);
      }
    }
  } catch (error) {
    console.warn('读取 Bangumi 缓存失败:', error);
  }
  return null;
};

const setBangumiCache = async (id: number, data: BangumiDetails) => {
  try {
    const cacheKey = `bangumi-details-${id}`;
    const expireSeconds = Math.floor(BANGUMI_CACHE_EXPIRE / 1000);

    await ClientCache.set(cacheKey, data, expireSeconds);

    if (typeof localStorage !== 'undefined') {
      try {
        const cacheData = {
          data,
          expire: Date.now() + BANGUMI_CACHE_EXPIRE,
          created: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch {
        /* localStorage 可能写满，忽略异常 */
      }
    }
  } catch (error) {
    console.warn('写入 Bangumi 缓存失败:', error);
  }
};

export const fetchBangumiDetailsWithCache = async (
  bangumiId: number,
): Promise<BangumiDetails | null> => {
  const cached = await getBangumiCache(bangumiId);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`);
    if (response.ok) {
      const bangumiData = (await response.json()) as BangumiDetails;
      await setBangumiCache(bangumiId, bangumiData);
      return bangumiData;
    }
  } catch (error) {
    /* 忽略错误 */
  }

  return null;
};
