/**
 * 通用 Promise 超时工具（服务端 / 客户端通用）
 *
 * 抽离自原本重复的两份实现：
 * - lib/home-data.server.ts::withTimeout（Promise.race 版，fallback 必填）
 * - lib/home-data-loader.ts::fetchWithTimeout（settled 标志位版，fallback 可选）
 *
 * 行为：超时后以 fallback 解析（resolve），而非 reject；原 Promise 失败时同样回退到 fallback。
 */

// 提供 fallback：保证返回非空类型 T
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T>;
// 不提供 fallback：超时/失败时返回 undefined
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback?: T
): Promise<T | undefined>;
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback?: T
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(fallback);
      });
  });
}
