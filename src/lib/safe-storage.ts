/**
 * localStorage / JSON 防御性读写工具
 *
 * 收敛散落各处的 try/catch + JSON.parse 样板：值损坏、存储被禁用（隐私模式）等
 * 情况下返回 fallback，避免脏 localStorage 数据炸掉调用方。
 */

type JsonStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * 解析 JSON 字符串，任何失败（raw 为空、解析报错、解析结果为 null）都返回 fallback。
 * 需要 null 作为合法值的调用方请使用 `safeJsonParse<T | null>` 的泛型形式自行处理。
 */
export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
): T {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function resolveStorage(storage?: JsonStorageLike | null): JsonStorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // 隐私模式 / Storage 被禁用时访问 localStorage 可能抛 SecurityError
    return null;
  }
}

/**
 * 从 storage 读取并解析 JSON 值；key 不存在、值损坏或 storage 不可用时返回 fallback。
 */
export function readJsonFromStorage<T>(
  key: string,
  fallback: T,
  storage?: JsonStorageLike | null,
): T {
  const target = resolveStorage(storage);
  if (!target) return fallback;
  try {
    return safeJsonParse(target.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

/**
 * 向 storage 写入 JSON 值；成功返回 true，storage 不可用或写入失败（如 QuotaExceeded）返回 false。
 */
export function writeJsonToStorage(
  key: string,
  value: unknown,
  storage?: JsonStorageLike | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 storage 读取原始字符串；key 不存在或 storage 不可用时返回 fallback。
 */
export function readStringFromStorage(
  key: string,
  fallback: string,
  storage?: JsonStorageLike | null,
): string {
  const target = resolveStorage(storage);
  if (!target) return fallback;
  try {
    return target.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
