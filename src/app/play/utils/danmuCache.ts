import { ClientCache } from '@/lib/client-cache';

export const DANMU_CACHE_DURATION_SECONDS = 30 * 60; // 30 分钟
const DANMU_CACHE_KEY_PREFIX = 'danmu-cache';

type DanmuCacheItem = Record<string, unknown>;
type DanmuCacheEntry = { data: DanmuCacheItem[]; timestamp: number };

export const getDanmuCacheItem = async (
  key: string
): Promise<DanmuCacheEntry | null> => {
  try {
    const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
    const cached = await ClientCache.get(cacheKey);
    if (cached) return cached as DanmuCacheEntry;

    if (typeof localStorage !== 'undefined') {
      const oldCacheKey = 'lunatv_danmu_cache';
      const localCached = localStorage.getItem(oldCacheKey);
      if (localCached) {
        const parsed = JSON.parse(localCached);
        const cacheMap = new Map(Object.entries(parsed));
        const item = cacheMap.get(key) as DanmuCacheEntry | undefined;
        if (item) {
          return item;
        }
      }
    }
  } catch (error) {
    console.warn('读取弹幕缓存失败:', error);
  }

  return null;
};

export const setDanmuCacheItem = async (
  _key: string,
  _data: DanmuCacheItem[]
): Promise<void> => {
  return;
};
