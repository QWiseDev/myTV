import {
  followManifestToSegment,
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
}

const DEFAULT_PREFETCH_TIMEOUT_MS = 5_000;
const DEFAULT_PREFETCH_MAX_BYTES = 512 * 1024;

function isSaveDataEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
  };
  return nav.connection?.saveData === true;
}

async function readResponseUpToLimit(
  response: Response,
  maxBytes: number,
): Promise<void> {
  if (!response.body) {
    await response.arrayBuffer().catch(() => undefined);
    return;
  }
  const reader = response.body.getReader();
  let bytesRead = 0;
  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) bytesRead += value.byteLength;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

/**
 * 在当前集临近片尾时静默预热下一集的播放清单与首个媒体分片：
 * 提前建连并填充浏览器 HTTP 缓存，缩短切集等待；任何网络或跨域失败静默忽略。
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

  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_PREFETCH_TIMEOUT_MS;
  const maxBytes =
    typeof options.maxBytes === 'number' && options.maxBytes > 0
      ? options.maxBytes
      : DEFAULT_PREFETCH_MAX_BYTES;

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
      const adFilterSettings = readLocalAdFilterSettings();
      const { segmentUrl } = await followManifestToSegment(
        manifestText,
        manifestBase,
        {
          signal: controller.signal,
          cache: 'default',
          filterAds: adFilterSettings.enabled,
          adFilterType: options.adFilterType ?? options.sourceKey,
          customAdFilterCode: adFilterSettings.customCode,
        },
      );
      if (
        !segmentUrl ||
        isLikelyHlsUrl(segmentUrl) ||
        controller.signal.aborted
      ) {
        return false;
      }

      const targetSegmentUrl = appendSourceFragmentParam(
        options.sourceKey,
        segmentUrl,
      );
      const segResp = await fetch(targetSegmentUrl, {
        signal: controller.signal,
        cache: 'default',
      });
      if (!segResp.ok) return false;
      await readResponseUpToLimit(segResp, maxBytes);
      return true;
    }

    const mediaResp = await fetch(trimmedUrl, {
      signal: controller.signal,
      cache: 'default',
      headers: {
        Range: `bytes=0-${maxBytes - 1}`,
      },
    });
    if (!mediaResp.ok) return false;
    await readResponseUpToLimit(mediaResp, maxBytes);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
