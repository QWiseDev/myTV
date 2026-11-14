/**
 * 独立分片代理（部署在离直播源更近的服务器上）的接入配置与 URL 构建。
 *
 * 在主站环境变量中配置：
 *   SEGMENT_PROXY_BASE   例如 https://124.220.134.40:9447（未配置则走内置代理）
 *   SEGMENT_PROXY_TOKEN  与独立服务 PROXY_TOKEN 一致（可选，防公网滥用）
 *
 * 配置后，m3u8 代理将：
 *   - 分片 URL 改写为 独立服务 /segment（播放器浏览器直连该服务）
 *   - 播放列表本身经 独立服务 /fetch 代取（主站与源不通时也能取到列表）
 */

export interface SegmentProxyConfig {
  baseUrl: string;
  token: string;
}

/** 解析独立分片代理配置；未配置或配置非法时返回 null（走内置代理） */
export function getSegmentProxyConfig(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): SegmentProxyConfig | null {
  const raw = env.SEGMENT_PROXY_BASE?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return null;
    if (!parsed.hostname) return null;
  } catch {
    return null;
  }
  return {
    baseUrl: raw.replace(/\/+$/, ''),
    token: env.SEGMENT_PROXY_TOKEN?.trim() ?? '',
  };
}

function buildProxyEndpointUrl(
  config: SegmentProxyConfig,
  endpoint: 'segment' | 'fetch',
  targetUrl: string,
  ua: string,
): string {
  const params = new URLSearchParams({ url: targetUrl });
  if (ua) {
    params.set('ua', ua);
  }
  if (config.token) {
    params.set('token', config.token);
  }
  return `${config.baseUrl}/${endpoint}?${params.toString()}`;
}

/** 播放器浏览器直连的分片地址 */
export function buildExternalSegmentUrl(
  config: SegmentProxyConfig,
  targetUrl: string,
  ua: string,
): string {
  return buildProxyEndpointUrl(config, 'segment', targetUrl, ua);
}

/** 主站代取播放列表的地址（独立服务响应附 X-Final-Url） */
export function buildFetchViaProxyUrl(
  config: SegmentProxyConfig,
  targetUrl: string,
  ua: string,
): string {
  return buildProxyEndpointUrl(config, 'fetch', targetUrl, ua);
}
