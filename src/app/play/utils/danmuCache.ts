import { ClientCache } from '@/lib/client-cache';
import { encodeSafeCacheSegment } from '@/lib/danmaku';

export const DANMU_CACHE_DURATION_SECONDS = 30 * 60; // 30 分钟
// 空结果仅缓存 2 分钟：服务端弹幕源修复/收录后，短时间内即可重新拉取
export const DANMU_EMPTY_CACHE_DURATION_SECONDS = 2 * 60;
const DANMU_CACHE_KEY_PREFIX = 'danmu-cache';
const LOCAL_DANMU_CACHE_KEY = 'lunatv_danmu_cache';
const MAX_LOCAL_DANMU_ENTRIES = 5;
const MAX_LOCAL_DANMU_CHARS = 1_500_000;

type DanmuCacheItem = Record<string, unknown>;
type DanmuCacheEntry = { data: DanmuCacheItem[]; timestamp: number };
type DanmuCacheStore = Record<string, DanmuCacheEntry>;

const getLocalDanmuCache = (): DanmuCacheStore => {
  if (typeof localStorage === 'undefined') return {};

  try {
    const cached = localStorage.getItem(LOCAL_DANMU_CACHE_KEY);
    if (!cached) return {};

    const parsed = JSON.parse(cached);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as DanmuCacheStore)
      : {};
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
    Object.entries(cache)
      .filter(([, value]) => {
        return (
          value &&
          Array.isArray(value.data) &&
          typeof value.timestamp === 'number' &&
          now - value.timestamp < maxAgeMs
        );
      })
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, MAX_LOCAL_DANMU_ENTRIES),
  ) as DanmuCacheStore;
};

function toServerDanmuCacheKey(key: string): string {
  const direct = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
  if (direct.length <= 256 && !/[\r\n\s*?[\]]/.test(direct)) {
    return direct;
  }
  return `${DANMU_CACHE_KEY_PREFIX}-${encodeSafeCacheSegment(key)}`;
}

export const getDanmuCacheItem = async (
  key: string,
  options: { allowRemote?: boolean } = {},
): Promise<DanmuCacheEntry | null> => {
  try {
    const localItem = getLocalDanmuCache()[key];
    if (localItem) {
      const ttlSeconds =
        localItem.data.length > 0
          ? DANMU_CACHE_DURATION_SECONDS
          : DANMU_EMPTY_CACHE_DURATION_SECONDS;
      if (Date.now() - localItem.timestamp < ttlSeconds * 1000) {
        return localItem;
      }
    }

    if (options.allowRemote === false) {
      return null;
    }

    const cacheKey = toServerDanmuCacheKey(key);
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
    const entry: DanmuCacheEntry = { data, timestamp: now };
    if (JSON.stringify(entry).length > MAX_LOCAL_DANMU_CHARS) {
      return;
    }

    const cache = pruneExpiredDanmuCache(getLocalDanmuCache(), now);
    delete cache[key];
    const entries = [[key, entry] as const, ...Object.entries(cache)].slice(
      0,
      MAX_LOCAL_DANMU_ENTRIES,
    );

    // 超出单域安全配额时按最旧条目淘汰，避免阻塞播放记录与设置项写入
    while (entries.length > 0) {
      const serialized = JSON.stringify(Object.fromEntries(entries));
      if (serialized.length <= MAX_LOCAL_DANMU_CHARS) {
        try {
          localStorage.setItem(LOCAL_DANMU_CACHE_KEY, serialized);
          return;
        } catch {
          entries.pop();
          continue;
        }
      }
      entries.pop();
    }

    localStorage.removeItem(LOCAL_DANMU_CACHE_KEY);
  } catch (error) {
    console.warn('写入弹幕缓存失败:', error);
  }
};
