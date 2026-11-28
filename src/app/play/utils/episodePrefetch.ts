import { filterAdsFromM3U8Async } from '@/lib/ad-filter';

import {
  isLikelyHlsUrl,
  readLocalAdFilterSettings,
} from './episodeSourceCheck';
import { appendSourceFragmentParam } from './fragmentUrlParams';

export interface PrefetchNextEpisodeOptions {
  sourceKey?: string;
  adFilterType?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  speedTier?: 'fast' | 'normal' | 'slow' | 'very_slow';
  isMobile?: boolean;
  /** 慢源默认预热 2 个完整分片，常规源默认 1 个 */
  segmentCount?: number;
}

export interface PrefetchedEpisodeManifest {
  url: string;
  text: string;
}

export interface PrefetchedEpisodeSegment {
  url: string;
  data: ArrayBuffer;
  bytes: number;
  startedAt: number;
  firstByteAt: number;
  endAt: number;
}

interface ManifestCacheEntry extends PrefetchedEpisodeManifest {
  fetchedAt: number;
}

interface SegmentCacheEntry extends PrefetchedEpisodeSegment {
  fetchedAt: number;
}

const DEFAULT_PREFETCH_TIMEOUT_MS = 8_000;
const SLOW_PREFETCH_TIMEOUT_MS = 15_000;
const DEFAULT_SEGMENT_MAX_BYTES = 4 * 1024 * 1024;
const MOBILE_SEGMENT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_DIRECT_MEDIA_MAX_BYTES = 512 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_MANIFEST_ENTRIES = 6;
const MAX_SEGMENT_CACHE_BYTES_DESKTOP = 12 * 1024 * 1024;
const MAX_SEGMENT_CACHE_BYTES_MOBILE = 5 * 1024 * 1024;

const manifestCache = new Map<string, ManifestCacheEntry>();
const segmentCache = new Map<string, SegmentCacheEntry>();

function perfNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isSaveDataEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
  };
  return nav.connection?.saveData === true;
}

function pruneExpiredCaches(nowMs: number): void {
  manifestCache.forEach((entry, key) => {
    if (nowMs - entry.fetchedAt > CACHE_TTL_MS) {
      manifestCache.delete(key);
    }
  });
  segmentCache.forEach((entry, key) => {
    if (nowMs - entry.fetchedAt > CACHE_TTL_MS) {
      segmentCache.delete(key);
    }
  });
}

function totalSegmentCacheBytes(): number {
  const seenBuffers = new Set<ArrayBuffer>();
  let total = 0;
  segmentCache.forEach((entry) => {
    if (!seenBuffers.has(entry.data)) {
      seenBuffers.add(entry.data);
      total += entry.bytes;
    }
  });
  return total;
}

function storeManifest(keys: string[], entry: ManifestCacheEntry): void {
  const nowMs = entry.fetchedAt;
  pruneExpiredCaches(nowMs);
  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key) continue;
    manifestCache.delete(key);
    manifestCache.set(key, entry);
  }
  while (manifestCache.size > MAX_MANIFEST_ENTRIES) {
    const oldestKey = manifestCache.keys().next().value;
    if (!oldestKey) break;
    manifestCache.delete(oldestKey);
  }
}

function storeSegment(
  keys: string[],
  entry: SegmentCacheEntry,
  isMobile: boolean,
): void {
  const maxCacheBytes = isMobile
    ? MAX_SEGMENT_CACHE_BYTES_MOBILE
    : MAX_SEGMENT_CACHE_BYTES_DESKTOP;
  if (entry.bytes <= 0 || entry.bytes > maxCacheBytes) return;

  pruneExpiredCaches(entry.fetchedAt);
  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key) continue;
    segmentCache.delete(key);
    segmentCache.set(key, entry);
  }
  while (totalSegmentCacheBytes() > maxCacheBytes && segmentCache.size > 0) {
    const oldestKey = segmentCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = segmentCache.get(oldestKey);
    segmentCache.delete(oldestKey);
    if (oldest) {
      segmentCache.forEach((v, k) => {
        if (v.data === oldest.data) {
          segmentCache.delete(k);
        }
      });
    }
  }
}

export function consumePrefetchedManifest(
  url: string | undefined | null,
): PrefetchedEpisodeManifest | null {
  const key = url?.trim();
  if (!key) return null;
  const entry = manifestCache.get(key);
  if (!entry) return null;
  manifestCache.delete(key);
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    return null;
  }
  return { url: entry.url, text: entry.text };
}

export function consumePrefetchedSegment(
  url: string | undefined | null,
): PrefetchedEpisodeSegment | null {
  const key = url?.trim();
  if (!key) return null;
  const entry = segmentCache.get(key);
  if (!entry) return null;
  // 移除指向同一份 ArrayBuffer 的所有别名键，避免重复消费
  segmentCache.forEach((v, k) => {
    if (v.data === entry.data) {
      segmentCache.delete(k);
    }
  });
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    return null;
  }
  return {
    url: entry.url,
    data: entry.data,
    bytes: entry.bytes,
    startedAt: entry.startedAt,
    firstByteAt: entry.firstByteAt,
    endAt: entry.endAt,
  };
}

export function clearEpisodePrefetchCache(): void {
  manifestCache.clear();
  segmentCache.clear();
}

export function getEpisodePrefetchCacheStats(): {
  manifests: number;
  segments: number;
  segmentBytes: number;
} {
  return {
    manifests: manifestCache.size,
    segments: segmentCache.size,
    segmentBytes: totalSegmentCacheBytes(),
  };
}

function pickInitialMediaSegments(
  manifestText: string,
  baseUrl: string,
  maxCount: number,
): string[] {
  if (!manifestText || maxCount <= 0) return [];
  const urls: string[] = [];
  for (const rawLine of manifestText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    try {
      const resolved = new URL(line, baseUrl).toString();
      urls.push(resolved);
      if (urls.length >= maxCount) break;
    } catch {
      continue;
    }
  }
  return urls;
}

function mergeUint8Arrays(
  chunks: Uint8Array[],
  totalBytes: number,
): ArrayBuffer {
  if (totalBytes <= 0 || chunks.length === 0) {
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

async function readResponseBytesUpToLimit(
  response: Response,
  maxBytes: number,
): Promise<{ data: ArrayBuffer | null; complete: boolean; bytes: number }> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = await response.arrayBuffer().catch(() => null);
    if (!buffer) return { data: null, complete: false, bytes: 0 };
    if (buffer.byteLength > maxBytes) {
      return { data: null, complete: false, bytes: buffer.byteLength };
    }
    return { data: buffer, complete: true, bytes: buffer.byteLength };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let complete = false;
  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      if (value && value.byteLength > 0) {
        bytesRead += value.byteLength;
        if (bytesRead <= maxBytes) {
          chunks.push(value);
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  if (!complete || bytesRead === 0 || bytesRead > maxBytes) {
    return { data: null, complete: false, bytes: bytesRead };
  }
  return {
    data: mergeUint8Arrays(chunks, bytesRead),
    complete: true,
    bytes: bytesRead,
  };
}

/**
 * 在当前集临近片尾或已缓冲完毕时静默预热下一集的播放清单与前 1~2 个媒体分片：
 * 将完整清单与首片写入受限内存缓存，由 CustomHlsJsLoader 切集时零等待直喂给 hls.js，
 * 避免 CDN 返回 no-store / 动态签名时浏览器 HTTP 缓存失效。
 */
export async function prefetchNextEpisodeMedia(
  episodeUrl: string,
  options: PrefetchNextEpisodeOptions = {},
): Promise<boolean> {
  const trimmedUrl = episodeUrl.trim();
  if (!trimmedUrl || options.signal?.aborted || isSaveDataEnabled()) {
    return false;
  }
  if (typeof fetch !== 'function') {
    return false;
  }

  const isSlowSource =
    options.speedTier === 'slow' || options.speedTier === 'very_slow';
  const isMobile = options.isMobile === true;
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : isSlowSource
        ? SLOW_PREFETCH_TIMEOUT_MS
        : DEFAULT_PREFETCH_TIMEOUT_MS;
  const segmentMaxBytes =
    typeof options.maxBytes === 'number' && options.maxBytes > 0
      ? options.maxBytes
      : isMobile
        ? MOBILE_SEGMENT_MAX_BYTES
        : DEFAULT_SEGMENT_MAX_BYTES;
  const directMaxBytes =
    typeof options.maxBytes === 'number' && options.maxBytes > 0
      ? options.maxBytes
      : DEFAULT_DIRECT_MEDIA_MAX_BYTES;
  const targetSegmentCount =
    typeof options.segmentCount === 'number' && options.segmentCount > 0
      ? Math.min(3, Math.floor(options.segmentCount))
      : isSlowSource
        ? 2
        : 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (isLikelyHlsUrl(trimmedUrl)) {
      const manifestResp = await fetch(trimmedUrl, {
        signal: controller.signal,
        cache: 'default',
      });
      if (!manifestResp.ok) return false;
      const manifestText = await manifestResp.text();
      const manifestBase = manifestResp.url || trimmedUrl;
      const fetchedAt = Date.now();
      storeManifest([trimmedUrl, manifestBase], {
        url: manifestBase,
        text: manifestText,
        fetchedAt,
      });

      const adFilterSettings = readLocalAdFilterSettings();
      const applyFilter = async (text: string) =>
        adFilterSettings.enabled
          ? filterAdsFromM3U8Async(text, {
              type: options.adFilterType ?? options.sourceKey,
              customCode: adFilterSettings.customCode,
            })
          : text;

      let mediaPlaylistText = manifestText;
      let mediaPlaylistBase = manifestBase;
      const outerEntries = pickInitialMediaSegments(
        await applyFilter(manifestText),
        manifestBase,
        targetSegmentCount,
      );
      if (outerEntries.length === 0) return false;

      let segmentUrls = outerEntries;
      if (isLikelyHlsUrl(outerEntries[0])) {
        const childUrl = outerEntries[0];
        const childResp = await fetch(childUrl, {
          signal: controller.signal,
          cache: 'default',
        });
        if (!childResp.ok) return false;
        const childText = await childResp.text();
        if (!/#EXT(?:M3U|-X-|INF)/i.test(childText)) {
          return false;
        }
        mediaPlaylistText = childText;
        mediaPlaylistBase = childResp.url || childUrl;
        storeManifest([childUrl, mediaPlaylistBase], {
          url: mediaPlaylistBase,
          text: mediaPlaylistText,
          fetchedAt: Date.now(),
        });
        segmentUrls = pickInitialMediaSegments(
          await applyFilter(mediaPlaylistText),
          mediaPlaylistBase,
          targetSegmentCount,
        );
      }

      const concreteSegments = segmentUrls.filter(
        (segUrl) => !isLikelyHlsUrl(segUrl),
      );
      if (concreteSegments.length === 0 || controller.signal.aborted) {
        return false;
      }

      let prefetchedAny = false;
      for (const rawSegUrl of concreteSegments) {
        if (controller.signal.aborted) break;
        const targetSegUrl = appendSourceFragmentParam(
          options.sourceKey,
          rawSegUrl,
        );
        const startedAt = perfNow();
        const segResp = await fetch(targetSegUrl, {
          signal: controller.signal,
          cache: 'default',
        });
        const firstByteAt = Math.max(startedAt, perfNow());
        if (!segResp.ok) {
          if (!prefetchedAny) return false;
          break;
        }
        const readResult = await readResponseBytesUpToLimit(
          segResp,
          segmentMaxBytes,
        );
        const endAt = Math.max(firstByteAt, perfNow());
        prefetchedAny = true;
        if (readResult.complete && readResult.data) {
          storeSegment(
            [rawSegUrl, targetSegUrl],
            {
              url: targetSegUrl,
              data: readResult.data,
              bytes: readResult.bytes,
              startedAt,
              firstByteAt,
              endAt,
              fetchedAt: Date.now(),
            },
            isMobile,
          );
        }
      }

      return prefetchedAny;
    }

    const mediaResp = await fetch(trimmedUrl, {
      signal: controller.signal,
      cache: 'default',
      headers: {
        Range: `bytes=0-${directMaxBytes - 1}`,
      },
    });
    if (!mediaResp.ok) return false;
    await readResponseBytesUpToLimit(mediaResp, directMaxBytes);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
