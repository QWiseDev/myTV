/**
 * 直播频道健康检查：刷新频道列表时并发探测频道地址，自动剔除死链。
 *
 * 环境变量（每次调用时读取）：
 *   LIVE_HEALTH_CHECK        设为 off 关闭（默认开启）
 *   LIVE_HEALTH_TIMEOUT      单频道探测超时毫秒数（默认 5000）
 *   LIVE_HEALTH_CONCURRENCY  并发探测数（默认 20）
 *
 * 剔除规则：
 *   - 探测超时/连接失败/DNS 失败/4xx-5xx → 死链剔除
 *   - 非 http(s) 地址（rtp:// 等，网页播放器不支持）直接剔除
 *   - 相同 URL 只探测一次
 * 每次刷新都会重新全量探测：临时抖动被误杀的源会在下次刷新时自愈。
 */

import { getBaseUrl, resolveUrl } from './url-resolve';

function readConfig() {
  return {
    enabled: process.env.LIVE_HEALTH_CHECK !== 'off',
    timeoutMs: parseInt(process.env.LIVE_HEALTH_TIMEOUT || '5000', 10),
    concurrency: parseInt(process.env.LIVE_HEALTH_CONCURRENCY || '20', 10),
  };
}

export interface HealthCheckOptions {
  /**
   * 探测地址转换器：传入时以转换后的地址探测（如经 124 分片代理的 /fetch 通道），
   * 使探测路径与真实播放路径（播放器 → 分片代理 → 源）一致。
   */
  probeUrl?: (url: string) => string;
}

export async function filterAliveChannels<T extends { url: string }>(
  channels: T[],
  ua: string,
  opts?: HealthCheckOptions,
): Promise<{ alive: T[]; deadRemoved: number }> {
  const config = readConfig();
  if (!config.enabled) {
    return { alive: channels, deadRemoved: 0 };
  }

  const probeTargets = Array.from(
    new Set(
      channels
        .map((c) => c.url)
        .filter(
          (url) => url.startsWith('http://') || url.startsWith('https://'),
        ),
    ),
  );

  const aliveUrls = new Set<string>();
  let cursor = 0;

  async function worker() {
    while (cursor < probeTargets.length) {
      const url = probeTargets[cursor++];
      try {
        const resp = await fetch(opts?.probeUrl ? opts.probeUrl(url) : url, {
          headers: { 'User-Agent': ua, Accept: '*/*' },
          signal: AbortSignal.timeout(config.timeoutMs),
          redirect: 'follow',
        });
        // 200-299（含 206 Range）视为存活；4xx/5xx（含代理回传的上游错误码）→ 死链
        if (resp.ok || resp.status === 206) {
          aliveUrls.add(url);
        }
        resp.body?.cancel().catch(() => undefined);
      } catch {
        // 超时/连接失败/DNS 失败 → 死链
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(config.concurrency, probeTargets.length) },
      () => worker(),
    ),
  ).then(() => undefined);

  const alive = channels.filter((c) => aliveUrls.has(c.url));
  return { alive, deadRemoved: channels.length - alive.length };
}

/* ==================== 频道测速 ==================== */

export interface SpeedTestOptions {
  ua: string;
  /** 下载测速窗口毫秒数（默认 3000） */
  windowMs?: number;
  /** 剔除阈值 KB/s（低于则判为慢源，默认 150） */
  minKBps?: number;
  /** 探测地址转换器（经 124 代理的 /fetch 通道，与播放路径一致） */
  probeUrl?: (url: string) => string;
  onProgress?: (done: number, total: number) => void;
}

export interface ChannelSpeed {
  name: string;
  url: string;
  /** 下载速度 KB/s；0 表示死链 */
  speedKBps: number;
}

export interface SpeedTestResult {
  results: ChannelSpeed[];
  kept: ChannelSpeed[];
  slowRemoved: number;
  deadRemoved: number;
}

function speedTestConfig(opts: SpeedTestOptions) {
  return {
    windowMs:
      opts.windowMs ?? parseInt(process.env.LIVE_SPEED_WINDOW_MS || '3000', 10),
    minKBps:
      opts.minKBps ?? parseFloat(process.env.LIVE_SPEED_MIN_KBPS || '150'),
  };
}

/** 读取响应头部的少量字节为文本（用于解析 m3u8） */
async function readHeadText(resp: Response, maxBytes: number): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // 读取中断即止
  }
  reader.cancel().catch(() => undefined);
  return text;
}

/** 在时间窗口内读取响应流并统计字节量，返回 KB/s */
async function measureStreamSpeed(
  resp: Response,
  windowMs: number,
): Promise<number> {
  const reader = resp.body?.getReader();
  if (!reader) return 0;
  const t0 = Date.now();
  let bytes = 0;
  try {
    while (Date.now() - t0 < windowMs) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }
  } catch {
    // 流中断按已读量计速
  }
  reader.cancel().catch(() => undefined);
  const elapsedSec = Math.max((Date.now() - t0) / 1000, 0.05);
  return bytes / 1024 / elapsedSec;
}

/**
 * 解析频道播放列表，定位首个媒体分片地址。
 * 支持一层主播放列表（#EXT-X-STREAM-INF）展开。
 */
async function resolveSegmentUrl(
  channelUrl: string,
  ua: string,
  opts: SpeedTestOptions,
  probeUrl?: (url: string) => string,
): Promise<string | null> {
  const target = probeUrl ? probeUrl(channelUrl) : channelUrl;
  const resp = await fetch(target, {
    headers: { 'User-Agent': ua, Accept: '*/*' },
    signal: AbortSignal.timeout(8000),
    redirect: 'follow',
  });
  if (!resp.ok && resp.status !== 206) {
    resp.body?.cancel().catch(() => undefined);
    return null;
  }
  const head = await readHeadText(resp, 65536);
  const isPlaylist =
    head.includes('#EXTM3U') ||
    head.includes('#EXTINF') ||
    head.includes('#EXT-X');
  if (!isPlaylist) {
    // 非列表内容（直接媒体流）：返回原始地址，由调用方测同一响应流
    return null;
  }
  // 最终地址：代理场景取 X-Final-Url，直连取 resp.url
  const finalUrl = (probeUrl && resp.headers.get('X-Final-Url')) || resp.url;
  const base = getBaseUrl(finalUrl);

  const lines = head.split('\n').map((l) => l.trim());
  const mediaLines = lines.filter((l) => l && !l.startsWith('#'));
  if (
    lines.some((l) => l.startsWith('#EXT-X-STREAM-INF')) &&
    mediaLines.length > 0
  ) {
    // 主播放列表：取第一个变体再展开一层
    const variantUrl = resolveUrl(base, mediaLines[0]);
    try {
      const vResp = await fetch(probeUrl ? probeUrl(variantUrl) : variantUrl, {
        headers: { 'User-Agent': ua, Accept: '*/*' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      if (!vResp.ok && vResp.status !== 206) {
        vResp.body?.cancel().catch(() => undefined);
        return null;
      }
      const vHead = await readHeadText(vResp, 65536);
      const vBase = getBaseUrl(
        (probeUrl && vResp.headers.get('X-Final-Url')) || vResp.url,
      );
      const vMedia = vHead
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      return vMedia.length > 0 ? resolveUrl(vBase, vMedia[0]) : null;
    } catch {
      return null;
    }
  }
  return mediaLines.length > 0 ? resolveUrl(base, mediaLines[0]) : null;
}

/** 对单个频道测速：解析列表 → 拉首个分片 → 窗口内计速 */
async function measureOneChannel(
  channel: { name: string; url: string },
  opts: SpeedTestOptions,
  speedCfg: { windowMs: number; minKBps: number },
): Promise<ChannelSpeed> {
  const dead: ChannelSpeed = {
    name: channel.name,
    url: channel.url,
    speedKBps: 0,
  };
  try {
    const probeUrl = opts.probeUrl;
    const segmentUrl = await resolveSegmentUrl(
      channel.url,
      opts.ua,
      opts,
      probeUrl,
    );
    if (!segmentUrl) {
      // 非列表直连媒体：重新请求同一地址测流
      const target = probeUrl ? probeUrl(channel.url) : channel.url;
      const resp = await fetch(target, {
        headers: { 'User-Agent': opts.ua, Accept: '*/*' },
        signal: AbortSignal.timeout(speedCfg.windowMs + 2000),
        redirect: 'follow',
      });
      if (!resp.ok && resp.status !== 206) {
        resp.body?.cancel().catch(() => undefined);
        return dead;
      }
      const speed = await measureStreamSpeed(resp, speedCfg.windowMs);
      return {
        name: channel.name,
        url: channel.url,
        speedKBps: Math.round(speed),
      };
    }
    const target = probeUrl ? probeUrl(segmentUrl) : segmentUrl;
    const resp = await fetch(target, {
      headers: { 'User-Agent': opts.ua, Accept: '*/*' },
      signal: AbortSignal.timeout(speedCfg.windowMs + 2000),
      redirect: 'follow',
    });
    if (!resp.ok && resp.status !== 206) {
      resp.body?.cancel().catch(() => undefined);
      return dead;
    }
    const speed = await measureStreamSpeed(resp, speedCfg.windowMs);
    return {
      name: channel.name,
      url: channel.url,
      speedKBps: Math.round(speed),
    };
  } catch {
    return dead;
  }
}

/**
 * 频道批量测速：解析每个频道的首个分片，按窗口实测下载速度，
 * 剔除死链与低于阈值的慢源。探测路径与真实播放路径一致（经 probeUrl）。
 */
export async function runChannelSpeedTest(
  channels: { name: string; url: string }[],
  opts: SpeedTestOptions,
): Promise<SpeedTestResult> {
  const speedCfg = speedTestConfig(opts);
  const results: ChannelSpeed[] = [];
  let done = 0;
  let cursor = 0;
  const list = [...channels];

  async function worker() {
    while (cursor < list.length) {
      const channel = list[cursor++];
      const r = await measureOneChannel(channel, opts, speedCfg);
      results.push(r);
      done++;
      opts.onProgress?.(done, list.length);
    }
  }

  const concurrency = parseInt(process.env.LIVE_HEALTH_CONCURRENCY || '20', 10);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, () => worker()),
  ).then(() => undefined);

  results.sort((a, b) => b.speedKBps - a.speedKBps);
  const kept = results.filter(
    (r) => r.speedKBps > 0 && r.speedKBps >= speedCfg.minKBps,
  );
  return {
    results,
    kept,
    slowRemoved: results.filter(
      (r) => r.speedKBps > 0 && r.speedKBps < speedCfg.minKBps,
    ).length,
    deadRemoved: results.filter((r) => r.speedKBps === 0).length,
  };
}
