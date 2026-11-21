import { ClientCache } from './client-cache';

export interface PrefixedCache {
  /** 生成 `{namespace}-{prefix}-{排序后的参数}` 形式的缓存键 */
  getCacheKey: (prefix: string, params: Record<string, unknown>) => string;
  /** 统一存储优先，localStorage 兜底的缓存读取 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 默认 any 以兼容未标注泛型的调用点（调用方直接把返回值当业务类型使用）
  getCache: <T = any>(key: string) => Promise<T | null>;
  /** 双写：统一存储 + localStorage（短期兼容缓存） */
  setCache: (
    key: string,
    data: unknown,
    expireSeconds: number,
  ) => Promise<void>;
  /** 清理统一存储与 localStorage 中过期的 `{namespace}-` 缓存 */
  cleanExpiredCache: () => Promise<void>;
}

/**
 * 带 localStorage 兜底双写的客户端缓存工厂。
 * douban / tmdb 等客户端数据源共用同一套逻辑，仅命名空间不同。
 */
export function createPrefixedCache(
  namespace: string,
  label: string,
): PrefixedCache {
  const keyPrefix = `${namespace}-`;

  function getCacheKey(
    prefix: string,
    params: Record<string, unknown>,
  ): string {
    const sortedParams = Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== null)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return `${keyPrefix}${prefix}-${sortedParams}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 与接口签名保持一致
  async function getCache<T = any>(key: string): Promise<T | null> {
    try {
      // 优先从统一存储获取
      const cached = await ClientCache.get<T>(key);
      if (cached) return cached;

      // 兜底：从localStorage获取（兼容性）
      if (typeof localStorage !== 'undefined') {
        const localCached = localStorage.getItem(key);
        if (localCached) {
          try {
            const { data, expire } = JSON.parse(localCached);
            if (Date.now() <= expire) {
              return data;
            }
            localStorage.removeItem(key);
          } catch (e) {
            localStorage.removeItem(key);
          }
        }
      }

      return null;
    } catch (e) {
      console.warn(`获取${label}缓存失败:`, e);
      return null;
    }
  }

  async function setCache(
    key: string,
    data: unknown,
    expireSeconds: number,
  ): Promise<void> {
    try {
      // 主要存储：统一存储
      await ClientCache.set(key, data, expireSeconds);

      // 兜底存储：localStorage（兼容性，短期缓存）
      if (typeof localStorage !== 'undefined') {
        try {
          const cacheData = {
            data,
            expire: Date.now() + expireSeconds * 1000,
            created: Date.now(),
          };
          localStorage.setItem(key, JSON.stringify(cacheData));
        } catch (e) {
          // localStorage可能满了，忽略错误
        }
      }
    } catch (e) {
      console.warn(`设置${label}缓存失败:`, key, e);
    }
  }

  async function cleanExpiredCache(): Promise<void> {
    try {
      // 清理统一存储中的过期缓存
      await ClientCache.clearExpired(keyPrefix);

      // 清理localStorage中的过期缓存
      if (typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(keyPrefix)) {
            try {
              const cached = localStorage.getItem(key);
              if (cached) {
                const { expire } = JSON.parse(cached);
                if (Date.now() > expire) {
                  keysToRemove.push(key);
                }
              }
            } catch (e) {
              keysToRemove.push(key);
            }
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      }
    } catch (e) {
      console.warn(`清理${label}过期缓存失败:`, e);
    }
  }

  return { getCacheKey, getCache, setCache, cleanExpiredCache };
}
