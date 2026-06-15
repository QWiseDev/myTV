import { ClientCache } from '@/lib/client-cache';

export const DANMU_CACHE_DURATION_SECONDS = 30 * 60; // 30 分钟
const DANMU_CACHE_KEY_PREFIX = 'danmu-cache';
const LOCAL_DANMU_CACHE_KEY = 'lunatv_danmu_cache';

type DanmuCacheItem = Record<string, unknown>;
type DanmuCacheEntry = { data: DanmuCacheItem[]; timestamp: number };
type DanmuCacheStore = Record<string, DanmuCacheEntry>;

const getLocalDanmuCache = (): DanmuCacheStore => {
  if (typeof localStorage === 'undefined') return {};

  try {
    const cached = localStorage.getItem(LOCAL_DANMU_CACHE_KEY);
    if (!cached) return {};

    return JSON.parse(cached) as DanmuCacheStore;
  } catch (error) {
    console.warn('读取弹幕本地缓存失败:', error);
    return {};
  }
};

const pruneExpiredDanmuCache = (
  cache: DanmuCacheStore,
  now: number,
): DanmuCacheStore => {
  const maxAgeMs = DANMU_CACHE_DURATION_SECONDS * 1000;

  return Object.fromEntries(
    Object.entries(cache).filter(([, value]) => {
      return value && now - value.timestamp < maxAgeMs;
    }),
  ) as DanmuCacheStore;
};

export const getDanmuCacheItem = async (
  key: string,
): Promise<DanmuCacheEntry | null> => {
  try {
    const localItem = getLocalDanmuCache()[key];
    if (localItem) return localItem;

    const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
    const cached = await ClientCache.get(cacheKey);
    if (cached) return cached as DanmuCacheEntry;
  } catch (error) {
    console.warn('读取弹幕缓存失败:', error);
  }

  return null;
};

export const setDanmuCacheItem = async (
  key: string,
  data: DanmuCacheItem[],
): Promise<void> => {
  try {
    if (typeof localStorage === 'undefined') return;

    const now = Date.now();
    const cache = pruneExpiredDanmuCache(getLocalDanmuCache(), now);
    cache[key] = {
      data,
      timestamp: now,
    };

    localStorage.setItem(LOCAL_DANMU_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('写入弹幕缓存失败:', error);
  }
};
