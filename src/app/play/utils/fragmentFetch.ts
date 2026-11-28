export class FragmentStallError extends Error {
  readonly isStall = true;
  readonly loadedBytes: number;

  constructor(message = 'Fragment download stalled', loadedBytes = 0) {
    super(message);
    this.name = 'FragmentStallError';
    this.loadedBytes = loadedBytes;
  }
}

export function isFragmentStallError(
  error: unknown,
): error is FragmentStallError {
  return (
    error instanceof FragmentStallError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { isStall?: unknown }).isStall === true)
  );
}

export interface FragmentFetchOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** 连续无新字节（或无首字节）超时阈值（毫秒）；<=0 表示关闭 */
  noProgressTimeoutMs?: number;
  /** 单次请求硬超时上限（毫秒）；<=0 表示关闭 */
  maxLoadTimeMs?: number;
  perfNow?: () => number;
  mode?: RequestMode;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  onFirstByte?: (at: number) => void;
  onProgress?: (loadedBytes: number, at: number) => void;
}

export interface FragmentFetchResult {
  url: string;
  data: ArrayBuffer;
  bytes: number;
  startedAt: number;
  firstByteAt: number;
  endAt: number;
}

const DEFAULT_NO_PROGRESS_TIMEOUT_MS = 7_000;
const DEFAULT_MAX_LOAD_TIME_MS = 45_000;

function mergeChunks(chunks: Uint8Array[], totalBytes: number): ArrayBuffer {
  if (totalBytes === 0 || chunks.length === 0) {
    return new ArrayBuffer(0);
  }
  if (
    chunks.length === 1 &&
    chunks[0].buffer instanceof ArrayBuffer &&
    chunks[0].byteOffset === 0 &&
    chunks[0].byteLength === chunks[0].buffer.byteLength
  ) {
    return chunks[0].buffer;
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

/**
 * 带「无进展看门狗」的分片拉取：
 * 通过流式 reader 监控 TTFB 与每个数据块之间的静默间隔，一旦连接假死超过
 * noProgressTimeoutMs 立即中止并抛出 FragmentStallError，避免在慢源上白等 90~120s。
 * 若运行环境未提供 response.body.getReader()，自动回退到 arrayBuffer() 并保留超时保护。
 */
export async function fetchFragmentWithStallWatchdog(
  url: string,
  options: FragmentFetchOptions = {},
): Promise<FragmentFetchResult> {
  const fetchImpl =
    options.fetchImpl ??
    (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  if (!fetchImpl) {
    throw new Error('fetch is not available');
  }

  const perfNow =
    options.perfNow ??
    (() =>
      typeof performance !== 'undefined' ? performance.now() : Date.now());
  const noProgressTimeoutMs =
    typeof options.noProgressTimeoutMs === 'number'
      ? options.noProgressTimeoutMs
      : DEFAULT_NO_PROGRESS_TIMEOUT_MS;
  const maxLoadTimeMs =
    typeof options.maxLoadTimeMs === 'number'
      ? options.maxLoadTimeMs
      : DEFAULT_MAX_LOAD_TIME_MS;

  const controller = new AbortController();
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let totalBytes = 0;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const clearTimers = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (totalTimer) {
      clearTimeout(totalTimer);
      totalTimer = null;
    }
  };

  const armStallTimer = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (noProgressTimeoutMs > 0) {
      stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
        if (activeReader) {
          void activeReader.cancel().catch(() => undefined);
        }
      }, noProgressTimeoutMs);
    }
  };

  if (maxLoadTimeMs > 0) {
    totalTimer = setTimeout(() => {
      stalled = true;
      controller.abort();
      if (activeReader) {
        void activeReader.cancel().catch(() => undefined);
      }
    }, maxLoadTimeMs);
  }

  const startedAt = perfNow();
  armStallTimer();

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      mode: options.mode ?? 'cors',
      credentials: options.credentials ?? 'same-origin',
      ...(options.cache ? { cache: options.cache } : {}),
    });

    const firstByteAt = Math.max(startedAt, perfNow());
    options.onFirstByte?.(firstByteAt);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    armStallTimer();

    let data: ArrayBuffer;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      activeReader = reader;
      const chunks: Uint8Array[] = [];
      try {
        for (
          let step = await reader.read();
          !step.done;
          step = await reader.read()
        ) {
          const { value } = step;
          if (value && value.byteLength > 0) {
            chunks.push(value);
            totalBytes += value.byteLength;
            armStallTimer();
            options.onProgress?.(totalBytes, perfNow());
          }
        }
      } finally {
        activeReader = null;
        if (controller.signal.aborted) {
          void reader.cancel().catch(() => undefined);
        }
      }
      data = mergeChunks(chunks, totalBytes);
    } else {
      data = await response.arrayBuffer();
      totalBytes = data.byteLength;
      options.onProgress?.(totalBytes, perfNow());
    }

    if (stalled && !externalSignal?.aborted) {
      throw new FragmentStallError('Fragment download stalled', totalBytes);
    }

    const endAt = Math.max(firstByteAt, perfNow());
    return {
      url,
      data,
      bytes: data.byteLength,
      startedAt,
      firstByteAt,
      endAt,
    };
  } catch (error) {
    if (stalled && !externalSignal?.aborted) {
      throw new FragmentStallError('Fragment download stalled', totalBytes);
    }
    throw error;
  } finally {
    clearTimers();
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
