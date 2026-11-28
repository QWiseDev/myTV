type M3u8Section = {
  leadingDiscontinuity: string | null;
  lines: string[];
};

type M3u8SectionStats = {
  totalDuration: number;
  maxSegmentDuration: number;
  segmentCount: number;
  adUriCount: number;
  hasExplicitAdMarker: boolean;
};

type AdFilterOptions = {
  type?: string;
  customCode?: string;
  onCustomError?: (error: unknown) => void;
};

export interface AdFilterWorkerMessageEvent {
  data: unknown;
}

export interface AdFilterWorkerErrorEvent {
  message?: string;
  error?: unknown;
}

export interface AdFilterWorkerLike {
  onmessage: ((event: AdFilterWorkerMessageEvent) => void) | null;
  onerror: ((event: AdFilterWorkerErrorEvent) => void) | null;
  postMessage: (message: unknown) => void;
  terminate: () => void;
}

export type AdFilterAsyncOptions = AdFilterOptions & {
  timeoutMs?: number;
  createWorker?: () => AdFilterWorkerLike;
};

export const DEFAULT_AD_FILTER_WORKER_TIMEOUT_MS = 80;

const AD_URI_PATTERN =
  /(^|[/?&#._=-])(ad|ads|advert|advertise|advertisement|commercial|preroll|pre-roll|midroll|mid-roll|postroll|post-roll|sponsor|vast|vmap)([/?&#._=-]|$)/i;

export const DEFAULT_CUSTOM_AD_FILTER_CODE = `function filterAdsFromM3U8(type: string, m3u8Content: string): string {
  if (!m3u8Content) return '';

  const adKeywords = [
    'sponsor',
    '/ad/',
    '/ads/',
    'advert',
    'advertisement',
    '/adjump',
    'redtraffic'
  ];

  const lines = m3u8Content.split('\\n');
  const filteredLines = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.includes('#EXT-X-DISCONTINUITY')) {
      i++;
      continue;
    }

    if (line.includes('#EXTINF:') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const containsAdKeyword = adKeywords.some((keyword) =>
        nextLine.toLowerCase().includes(keyword.toLowerCase())
      );

      if (containsAdKeyword) {
        i += 2;
        continue;
      }
    }

    filteredLines.push(line);
    i++;
  }

  return filteredLines.join('\\n');
}`;

export function removeTypeAnnotations(code: string): string {
  return code
    .replace(
      /(\w+)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*([,)])/g,
      '$1$3',
    )
    .replace(
      /\)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*\{/g,
      ') {',
    )
    .replace(
      /(const|let|var)\s+(\w+)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*=/g,
      '$1 $2 =',
    );
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node) &&
    typeof require === 'function'
  );
}

const AD_FILTER_WORKER_BOOTSTRAP = `
(function () {
  "use strict";
  var safePostMessage = self.postMessage.bind(self);
  var SafeFunction = Function;
  var SafeMap = Map;
  var SafeString = String;
  var blockedGlobals = [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "importScripts",
    "indexedDB",
    "caches",
    "BroadcastChannel",
    "SharedWorker",
    "Worker",
    "navigator"
  ];
  for (var i = 0; i < blockedGlobals.length; i++) {
    try {
      Object.defineProperty(self, blockedGlobals[i], {
        value: undefined,
        writable: false,
        configurable: false
      });
    } catch (_) {}
  }

  var compiledCache = new SafeMap();
  var MAX_COMPILED = 8;

  function getCompiledFilter(jsCode) {
    var cached = compiledCache.get(jsCode);
    if (cached) return cached;
    var fn = new SafeFunction(
      "type",
      "m3u8Content",
      '"use strict";\\n' + jsCode + "\\nreturn filterAdsFromM3U8(type, m3u8Content);"
    );
    if (compiledCache.size >= MAX_COMPILED) {
      var oldest = compiledCache.keys().next().value;
      if (oldest !== undefined) compiledCache.delete(oldest);
    }
    compiledCache.set(jsCode, fn);
    return fn;
  }

  self.onmessage = function (event) {
    var payload = event && event.data;
    if (!payload || typeof payload.id !== "number") return;
    var id = payload.id;
    try {
      var fn = getCompiledFilter(SafeString(payload.jsCode || ""));
      var result = fn.call(
        null,
        SafeString(payload.type || ""),
        SafeString(payload.m3u8Content || "")
      );
      if (typeof result !== "string") {
        throw new Error("自定义去广告函数必须返回字符串");
      }
      safePostMessage({ id: id, ok: true, result: result });
    } catch (err) {
      var message =
        err && typeof err === "object" && "message" in err
          ? SafeString(err.message)
          : SafeString(err);
      safePostMessage({ id: id, ok: false, error: message });
    }
  };
})();
`;

type PendingWorkerTask = {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let sharedWorker: AdFilterWorkerLike | null = null;
let sharedWorkerBlobUrl: string | null = null;
let nextWorkerTaskId = 0;
const pendingWorkerTasks = new Map<number, PendingWorkerTask>();

function createDefaultBrowserWorker(): AdFilterWorkerLike {
  if (
    typeof Worker !== 'function' ||
    typeof Blob !== 'function' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error('当前环境不支持 Web Worker 沙箱');
  }

  const blob = new Blob([AD_FILTER_WORKER_BOOTSTRAP], {
    type: 'application/javascript',
  });
  const blobUrl = URL.createObjectURL(blob);
  try {
    const worker = new Worker(blobUrl);
    sharedWorkerBlobUrl = blobUrl;
    return worker as unknown as AdFilterWorkerLike;
  } catch (error) {
    URL.revokeObjectURL(blobUrl);
    throw error;
  }
}

function teardownSharedWorker(reason?: Error): void {
  if (sharedWorker) {
    try {
      sharedWorker.onmessage = null;
      sharedWorker.onerror = null;
      sharedWorker.terminate();
    } catch {
      /* ignore terminate error */
    }
    sharedWorker = null;
  }
  if (sharedWorkerBlobUrl && typeof URL !== 'undefined') {
    try {
      URL.revokeObjectURL(sharedWorkerBlobUrl);
    } catch {
      /* ignore revoke error */
    }
    sharedWorkerBlobUrl = null;
  }
  if (pendingWorkerTasks.size > 0) {
    const fallbackError = reason ?? new Error('自定义去广告 Worker 已终止');
    const tasks = Array.from(pendingWorkerTasks.values());
    pendingWorkerTasks.clear();
    tasks.forEach((task) => {
      clearTimeout(task.timer);
      task.reject(fallbackError);
    });
  }
}

export function disposeCustomAdFilterWorker(): void {
  teardownSharedWorker();
}

function getOrCreateSharedWorker(): AdFilterWorkerLike {
  if (sharedWorker) return sharedWorker;

  const worker = createDefaultBrowserWorker();
  worker.onmessage = (event: AdFilterWorkerMessageEvent) => {
    const data = event?.data as
      | { id?: unknown; ok?: unknown; result?: unknown; error?: unknown }
      | undefined;
    if (!data || typeof data.id !== 'number') return;
    const task = pendingWorkerTasks.get(data.id);
    if (!task) return;
    pendingWorkerTasks.delete(data.id);
    clearTimeout(task.timer);

    if (data.ok === true && typeof data.result === 'string') {
      task.resolve(data.result);
    } else {
      task.reject(
        new Error(
          typeof data.error === 'string' && data.error
            ? data.error
            : '执行自定义去广告代码失败',
        ),
      );
    }
  };
  worker.onerror = (event: AdFilterWorkerErrorEvent) => {
    const msg =
      typeof event?.message === 'string' && event.message
        ? event.message
        : '自定义去广告 Worker 运行异常';
    teardownSharedWorker(new Error(msg));
  };

  sharedWorker = worker;
  return worker;
}

export function runCustomAdFilterCodeInWorker(
  type: string,
  m3u8Content: string,
  customCode: string,
  options: {
    timeoutMs?: number;
    createWorker?: () => AdFilterWorkerLike;
  } = {},
): Promise<string> {
  const jsCode = removeTypeAnnotations(customCode);
  const safeType = String(type);
  const safeContent = String(m3u8Content);
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_AD_FILTER_WORKER_TIMEOUT_MS;

  // 支持注入独立 Worker 工厂（用于测试或一次性隔离校验）
  const customWorkerFactory = options.createWorker;
  if (customWorkerFactory) {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let worker: AdFilterWorkerLike;
      try {
        worker = customWorkerFactory();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      const cleanup = () => {
        try {
          worker.onmessage = null;
          worker.onerror = null;
          worker.terminate();
        } catch {
          /* ignore */
        }
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`自定义去广告代码执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      worker.onmessage = (event: AdFilterWorkerMessageEvent) => {
        const data = event?.data as
          | { id?: unknown; ok?: unknown; result?: unknown; error?: unknown }
          | undefined;
        if (!data || settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        if (data.ok === true && typeof data.result === 'string') {
          resolve(data.result);
        } else {
          reject(
            new Error(
              typeof data.error === 'string' && data.error
                ? data.error
                : '自定义去广告函数必须返回字符串',
            ),
          );
        }
      };

      worker.onerror = (event: AdFilterWorkerErrorEvent) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(
          new Error(
            typeof event?.message === 'string' && event.message
              ? event.message
              : '自定义去广告 Worker 执行错误',
          ),
        );
      };

      try {
        worker.postMessage({
          id: 1,
          type: safeType,
          m3u8Content: safeContent,
          jsCode,
        });
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  }

  return new Promise<string>((resolve, reject) => {
    let worker: AdFilterWorkerLike;
    try {
      worker = getOrCreateSharedWorker();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const id = ++nextWorkerTaskId;
    const timer = setTimeout(() => {
      pendingWorkerTasks.delete(id);
      const timeoutError = new Error(
        `自定义去广告代码执行超时 (${timeoutMs}ms)`,
      );
      // 发生超时说明 Worker 线程可能陷入死循环或灾难性正则回溯，必须立即物理销毁并重建
      teardownSharedWorker(timeoutError);
      reject(timeoutError);
    }, timeoutMs);

    pendingWorkerTasks.set(id, { resolve, reject, timer });

    try {
      worker.postMessage({
        id,
        type: safeType,
        m3u8Content: safeContent,
        jsCode,
      });
    } catch (err) {
      pendingWorkerTasks.delete(id);
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function runCustomAdFilterCode(
  type: string,
  m3u8Content: string,
  customCode: string,
): string {
  const jsCode = removeTypeAnnotations(customCode);
  const safeType = String(type);
  const safeContent = String(m3u8Content);

  let result: unknown;
  if (isNodeRuntime()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm = require('vm') as typeof import('vm');
    if (vm && typeof vm.createContext === 'function') {
      const sandbox = Object.create(null) as Record<string, unknown>;
      sandbox.__type = safeType;
      sandbox.__content = safeContent;
      const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false },
      });
      const script = new vm.Script(
        `"use strict";\n${jsCode}\nfilterAdsFromM3U8(__type, __content);`,
      );
      result = script.runInContext(context, { timeout: 50 });
    }
  } else {
    throw new Error(
      '浏览器端禁止在主线程直接同步执行自定义去广告脚本，请使用 filterAdsFromM3U8Async 在 Worker 沙箱中运行',
    );
  }

  if (typeof result !== 'string') {
    throw new Error('自定义去广告函数必须返回字符串');
  }

  return result;
}

export function validateCustomAdFilterCode(code: string): void {
  runCustomAdFilterCode(
    'test',
    ['#EXTM3U', '#EXTINF:10,', 'main.ts'].join('\n'),
    code,
  );
}

export async function validateCustomAdFilterCodeAsync(
  code: string,
  options: {
    timeoutMs?: number;
    createWorker?: () => AdFilterWorkerLike;
  } = {},
): Promise<void> {
  const sampleManifest = ['#EXTM3U', '#EXTINF:10,', 'main.ts'].join('\n');
  if (!options.createWorker && isNodeRuntime()) {
    validateCustomAdFilterCode(code);
    return;
  }
  await runCustomAdFilterCodeInWorker('test', sampleManifest, code, options);
}

function splitM3u8ByDiscontinuity(lines: string[]): M3u8Section[] {
  const sections: M3u8Section[] = [
    {
      leadingDiscontinuity: null,
      lines: [],
    },
  ];

  lines.forEach((line) => {
    if (line.trim().toUpperCase() === '#EXT-X-DISCONTINUITY') {
      sections.push({
        leadingDiscontinuity: line,
        lines: [],
      });
      return;
    }

    sections[sections.length - 1].lines.push(line);
  });

  return sections;
}

function isExplicitAdMarker(line: string): boolean {
  const upper = line.toUpperCase();

  if (
    upper.includes('#EXT-X-CUE-OUT') ||
    upper.includes('#EXT-X-SPLICEPOINT-SCTE35') ||
    upper.includes('#EXT-OATCLS-SCTE35') ||
    upper.includes('SCTE35-OUT') ||
    upper.includes('SCTE35-CMD')
  ) {
    return true;
  }

  if (!upper.startsWith('#EXT-X-DATERANGE')) {
    return false;
  }

  return /(CLASS|ID|X-[A-Z0-9-]+)=["'][^"']*(AD|ADS|ADVERT|COMMERCIAL|SCTE|CUE|VAST|VMAP)[^"']*["']/i.test(
    line,
  );
}

function getM3u8SectionStats(lines: string[]): M3u8SectionStats {
  let pendingDuration: number | null = null;
  let totalDuration = 0;
  let maxSegmentDuration = 0;
  let segmentCount = 0;
  let adUriCount = 0;
  let hasExplicitAdMarker = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (isExplicitAdMarker(trimmed)) {
      hasExplicitAdMarker = true;
    }

    const extInfMatch = trimmed.match(/^#EXTINF:([\d.]+)/i);
    if (extInfMatch) {
      const duration = Number(extInfMatch[1]);
      pendingDuration = Number.isFinite(duration) ? duration : null;
      return;
    }

    if (trimmed.startsWith('#')) return;

    segmentCount += 1;
    if (AD_URI_PATTERN.test(trimmed)) {
      adUriCount += 1;
    }

    const segmentDuration = pendingDuration ?? 0;
    totalDuration += segmentDuration;
    maxSegmentDuration = Math.max(maxSegmentDuration, segmentDuration);
    pendingDuration = null;
  });

  return {
    totalDuration,
    maxSegmentDuration,
    segmentCount,
    adUriCount,
    hasExplicitAdMarker,
  };
}

function shouldDropM3u8Section(
  section: M3u8Section,
  index: number,
  sections: M3u8Section[],
): boolean {
  const stats = getM3u8SectionStats(section.lines);
  if (stats.segmentCount === 0) return false;

  if (stats.hasExplicitAdMarker) {
    return true;
  }

  const isDiscontinuityBounded =
    section.leadingDiscontinuity !== null && index < sections.length - 1;
  const isShortIsland =
    stats.totalDuration > 0 &&
    stats.totalDuration <= 45 &&
    stats.segmentCount <= 8 &&
    stats.maxSegmentDuration <= 15;
  const hasMostlyAdUris =
    stats.adUriCount > 0 && stats.adUriCount / stats.segmentCount >= 0.5;

  return isDiscontinuityBounded && isShortIsland && hasMostlyAdUris;
}

function filterAdsFromM3U8Default(m3u8Content: string): string {
  if (!m3u8Content) return '';

  const hadTrailingNewline = m3u8Content.endsWith('\n');
  const lines = m3u8Content.split('\n');
  const sections = splitM3u8ByDiscontinuity(lines);
  let droppedAnySection = false;

  const filteredLines: string[] = [];
  sections.forEach((section, index) => {
    if (shouldDropM3u8Section(section, index, sections)) {
      droppedAnySection = true;
      return;
    }

    if (section.leadingDiscontinuity !== null) {
      filteredLines.push(section.leadingDiscontinuity);
    }
    filteredLines.push(...section.lines);
  });

  if (!droppedAnySection) {
    return m3u8Content;
  }

  const filteredContent = filteredLines.join('\n');
  return hadTrailingNewline && !filteredContent.endsWith('\n')
    ? `${filteredContent}\n`
    : filteredContent;
}

export function filterAdsFromM3U8(
  m3u8Content: string,
  options: AdFilterOptions = {},
): string {
  const customCode = options.customCode?.trim();
  if (customCode) {
    try {
      return runCustomAdFilterCode(options.type || '', m3u8Content, customCode);
    } catch (error) {
      options.onCustomError?.(error);
    }
  }

  return filterAdsFromM3U8Default(m3u8Content);
}

/**
 * 异步去广告入口（浏览器端专用首选）：
 * - 未配置自定义规则时零开销直接运行默认规则；
 * - 配置了自定义 JS 规则时，在隔离 Web Worker 中运行并附带超时熔断（默认 80ms），
 *   超时或抛错时立即终止失控 Worker 并平滑回退至内置安全规则。
 */
export async function filterAdsFromM3U8Async(
  m3u8Content: string,
  options: AdFilterAsyncOptions = {},
): Promise<string> {
  const customCode = options.customCode?.trim();
  if (!customCode) {
    return filterAdsFromM3U8Default(m3u8Content);
  }

  try {
    if (!options.createWorker && isNodeRuntime()) {
      return runCustomAdFilterCode(options.type || '', m3u8Content, customCode);
    }
    return await runCustomAdFilterCodeInWorker(
      options.type || '',
      m3u8Content,
      customCode,
      {
        timeoutMs: options.timeoutMs,
        createWorker: options.createWorker,
      },
    );
  } catch (error) {
    options.onCustomError?.(error);
    return filterAdsFromM3U8Default(m3u8Content);
  }
}
