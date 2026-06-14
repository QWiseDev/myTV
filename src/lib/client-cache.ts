export class ClientCache {
  private static memory = new Map<string, { data: unknown; expireAt: number }>();
  private static pendingGets = new Map<string, Promise<unknown | null>>();
  private static readonly DEFAULT_MEMORY_EXPIRE = 60 * 1000;

  static clearMemory(): void {
    this.memory.clear();
    this.pendingGets.clear();
  }

  static async get<T = unknown>(key: string): Promise<T | null> {
    const cached = this.memory.get(key);
    if (cached && Date.now() < cached.expireAt) {
      return cached.data as T;
    }

    if (cached) {
      this.memory.delete(key);
    }

    const pending = this.pendingGets.get(key);
    if (pending) {
      return pending as Promise<T | null>;
    }

    const request = this.fetchAndCache<T>(key).finally(() => {
      this.pendingGets.delete(key);
    });
    this.pendingGets.set(key, request);
    return request;
  }

  private static async fetchAndCache<T = unknown>(
    key: string
  ): Promise<T | null> {
    try {
      const response = await fetch(`/api/cache?key=${encodeURIComponent(key)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      this.memory.set(key, {
        data: result.data,
        expireAt: Date.now() + this.DEFAULT_MEMORY_EXPIRE,
      });
      return result.data as T;
    } catch (error) {
      console.error('获取缓存失败:', error);
      return null;
    }
  }

  static async set(
    key: string,
    data: unknown,
    expireSeconds?: number
  ): Promise<void> {
    try {
      const response = await fetch('/api/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, data, expireSeconds }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.memory.set(key, {
        data,
        expireAt:
          Date.now() + (expireSeconds ? expireSeconds * 1000 : this.DEFAULT_MEMORY_EXPIRE),
      });
    } catch (error) {
      console.error('设置缓存失败:', error);
      throw error;
    }
  }

  static async delete(key: string): Promise<void> {
    try {
      const response = await fetch(
        `/api/cache?key=${encodeURIComponent(key)}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.memory.delete(key);
    } catch (error) {
      console.error('删除缓存失败:', error);
      throw error;
    }
  }

  static async clearExpired(prefix?: string): Promise<void> {
    try {
      const url = prefix
        ? `/api/cache?prefix=${encodeURIComponent(prefix)}`
        : '/api/cache';
      const response = await fetch(url, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (prefix) {
        Array.from(this.memory.keys()).forEach((key) => {
          if (key.startsWith(prefix)) {
            this.memory.delete(key);
          }
        });
      } else {
        this.memory.clear();
      }
    } catch (error) {
      console.error('清理过期缓存失败:', error);
      throw error;
    }
  }
}
