/**
 * 通用 Promise 超时工具（服务端 / 客户端通用）
 *
 * 抽离自原本重复的两份实现：
 * - lib/home-data.server.ts::withTimeout（Promise.race 版，fallback 必填）
 * - lib/home-data-loader.ts::fetchWithTimeout（settled 标志位版，fallback 可选）
 *
 * 行为：超时后以 fallback 解析（resolve），而非 reject；原 Promise 失败时同样回退到 fallback。
 */

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function createTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Promise timed out after ${timeoutMs}ms`);
  error.name = 'TimeoutError';
  return error;
}

/**
 * 为可接收 AbortSignal 的任务提供超时与父级取消。
 *
 * 与兼容旧调用的 withTimeout 不同，本函数会拒绝失败/取消，并真实中止底层任务。
 */
export function withAbortableTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();

  if (parentSignal?.aborted) {
    const reason =
      parentSignal.reason ?? createAbortError('The operation was aborted');
    controller.abort(reason);
    return Promise.reject(reason);
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abortFromParent = () => {
      const reason =
        parentSignal?.reason ?? createAbortError('The operation was aborted');
      controller.abort(reason);
      settle(() => reject(reason));
    };
    const timeoutId = setTimeout(() => {
      const error = createTimeoutError(timeoutMs);
      controller.abort(error);
      settle(() => reject(error));
    }, timeoutMs);

    parentSignal?.addEventListener('abort', abortFromParent, { once: true });

    try {
      task(controller.signal).then(
        (result) => settle(() => resolve(result)),
        (error) => settle(() => reject(error)),
      );
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

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
