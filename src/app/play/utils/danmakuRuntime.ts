'use client';

import {
  DANMU_CACHE_DURATION_SECONDS,
  getDanmuCacheItem,
  setDanmuCacheItem,
} from './danmuCache';

export type DanmakuItemLike = {
  text?: string;
  time?: number;
  [key: string]: unknown;
};

export type DanmakuPluginLike = {
  isHide?: boolean;
  isStop?: boolean;
  option?: unknown;
  reset?: () => void;
  load?: (danmaku?: DanmakuItemLike[]) => void;
  show?: () => void;
  hide?: () => void;
  emit?: (danmaku: DanmakuItemLike) => Promise<void> | void;
  worker?: {
    terminate?: () => void;
  };
};

export type ArtPlayerLike = {
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  playing?: boolean;
  volume?: number;
  fullscreen?: boolean;
  video?: HTMLVideoElement;
  $video?: HTMLVideoElement;
  notice?: {
    show: string;
  };
  template?: {
    $player: HTMLElement;
  };
  plugins?: {
    artplayerPluginDanmuku?: DanmakuPluginLike;
  };
  emit?: (event: string, ...args: unknown[]) => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
  toggle?: () => void;
  destroy?: (removeHtml?: boolean) => void;
  __uiEnhancementsCleanup?: () => void;
};

export type DanmakuRequestInput = {
  enabled: boolean;
  videoTitle?: string;
  videoYear?: string;
  videoDoubanId?: number | null;
  videoUrl?: string;
  episodeIndex: number;
  episodeOffset: number;
  source?: string;
};

export type DanmakuRequest = {
  key: string;
  episode: number;
  params: URLSearchParams;
  source?: string;
};

type InFlightDanmakuLoad = {
  key: string;
  startedAt: number;
  promise: Promise<DanmakuItemLike[]>;
  controller: AbortController | null;
  token: object;
};

function throwIfDanmakuLoadAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;

  if (typeof DOMException !== 'undefined') {
    throw new DOMException('弹幕请求已取消', 'AbortError');
  }

  const error = new Error('弹幕请求已取消');
  error.name = 'AbortError';
  throw error;
}

export function isDanmakuAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function getDanmakuPlugin(art: ArtPlayerLike | null | undefined) {
  return art?.plugins?.artplayerPluginDanmuku;
}

export function createDanmakuRequest(
  input: DanmakuRequestInput,
): DanmakuRequest | null {
  if (!input.enabled) return null;

  const episode = input.episodeIndex + 1 + input.episodeOffset;
  const params = new URLSearchParams();

  if (input.videoDoubanId && input.videoDoubanId > 0) {
    params.set('douban_id', String(input.videoDoubanId));
  }
  if (input.videoTitle) {
    params.set('title', input.videoTitle);
  }
  if (input.videoYear) {
    params.set('year', input.videoYear);
  }
  if (input.videoUrl) {
    params.set('video_url', input.videoUrl);
  }
  if (episode > 0) {
    params.set('episode', String(episode));
  }

  if (!params.toString()) return null;

  const keyParts = [
    input.videoTitle || '',
    input.videoYear || '',
    input.videoDoubanId || '',
    episode,
  ];
  if (input.videoUrl) {
    keyParts.push(input.videoUrl);
  }

  return {
    key: keyParts.join('_'),
    episode,
    params,
    source: input.source,
  };
}

export async function fetchExternalDanmaku(
  request: DanmakuRequest,
  options: { signal?: AbortSignal } = {},
): Promise<DanmakuItemLike[]> {
  const response = await fetch(`/api/danmu-external?${request.params}`, {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`弹幕 API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.danmu) ? data.danmu : [];
}

export class DanmakuLoadManager {
  private inFlight: InFlightDanmakuLoad | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = 15000,
  ) {}

  reset() {
    this.inFlight?.controller?.abort();
    this.inFlight = null;
  }

  get activeKey() {
    return this.inFlight?.key || '';
  }

  async load(input: DanmakuRequestInput): Promise<DanmakuItemLike[]> {
    const request = createDanmakuRequest(input);
    if (!request) {
      this.reset();
      return [];
    }

    const now = this.now();
    const hasFreshInFlight =
      this.inFlight &&
      this.inFlight.key === request.key &&
      now - this.inFlight.startedAt < this.timeoutMs;

    if (hasFreshInFlight && this.inFlight) {
      return this.inFlight.promise;
    }

    this.reset();

    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const token = {};
    const promise = this.loadByRequest(request, controller).finally(() => {
      if (this.inFlight?.token === token) {
        this.inFlight = null;
      }
    });

    this.inFlight = {
      key: request.key,
      startedAt: now,
      promise,
      controller,
      token,
    };

    return promise;
  }

  private async loadByRequest(
    request: DanmakuRequest,
    controller: AbortController | null,
  ): Promise<DanmakuItemLike[]> {
    const signal = controller?.signal;
    const cached = await getDanmuCacheItem(request.key);
    throwIfDanmakuLoadAborted(signal);
    const now = this.now();

    if (
      cached &&
      now - cached.timestamp < DANMU_CACHE_DURATION_SECONDS * 1000
    ) {
      return cached.data;
    }

    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

    try {
      const danmaku = await fetchExternalDanmaku(request, {
        signal,
      });
      throwIfDanmakuLoadAborted(signal);
      await setDanmuCacheItem(request.key, danmaku);
      throwIfDanmakuLoadAborted(signal);
      return danmaku;
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }
}

export function createDanmakuLoadManager() {
  return new DanmakuLoadManager();
}

export function clearDanmakuDisplay(
  art: ArtPlayerLike | null | undefined,
  options: { hide?: boolean } = {},
) {
  const plugin = getDanmakuPlugin(art);
  if (!plugin) return false;

  plugin.reset?.();
  plugin.load?.();

  if (options.hide) {
    plugin.hide?.();
  }

  return true;
}

export function renderDanmakuList(
  art: ArtPlayerLike | null | undefined,
  danmaku: DanmakuItemLike[],
  options: { preserveHidden?: boolean; showNotice?: boolean } = {},
) {
  const plugin = getDanmakuPlugin(art);
  if (!plugin) return false;

  const wasHidden = Boolean(plugin.isHide);
  plugin.reset?.();
  plugin.load?.(danmaku.length > 0 ? danmaku : undefined);

  if (!options.preserveHidden || !wasHidden) {
    plugin.show?.();
  }

  if (options.showNotice) {
    showDanmakuLoadNotice(art, danmaku.length);
  }

  return true;
}

export function showDanmakuLoadNotice(
  art: ArtPlayerLike | null | undefined,
  count: number,
) {
  if (!art?.notice) return;
  art.notice.show = count > 0 ? `已加载 ${count} 条弹幕` : '暂无弹幕数据';
}

export function showDanmakuErrorNotice(
  art: ArtPlayerLike | null | undefined,
  error: unknown,
) {
  if (!art?.notice) return;
  const message = error instanceof Error ? error.message : String(error);
  art.notice.show = `弹幕加载失败: ${message}`;
}

export function terminateDanmakuWorker(art: ArtPlayerLike | null | undefined) {
  const worker = getDanmakuPlugin(art)?.worker;
  worker?.terminate?.();
}

export function resetDanmakuTimeline(art: ArtPlayerLike | null | undefined) {
  const plugin = getDanmakuPlugin(art);
  if (!plugin || plugin.isHide) return;

  plugin.reset?.();

  if (art?.playing) {
    art.emit?.('video:playing');
  }
}

export function recoverStoppedDanmaku(
  art: ArtPlayerLike | null | undefined,
  now = Date.now(),
  lastRecoverAt = 0,
  minInterval = 1000,
) {
  const plugin = getDanmakuPlugin(art);
  if (!plugin || plugin.isHide || !plugin.isStop || !art?.playing) {
    return lastRecoverAt;
  }

  if (now - lastRecoverAt < minInterval) {
    return lastRecoverAt;
  }

  art.emit?.('video:playing');
  return now;
}
