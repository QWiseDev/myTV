/**
 * 独立分片代理（部署在离直播源更近的服务器上）的接入配置与 URL 构建。
 *
 * 配置来源（优先级从高到低）：
 *   1. 管理后台「直播配置」中的分片代理设置（存 db，可随时改）
 *   2. 环境变量 SEGMENT_PROXY_BASE / SEGMENT_PROXY_TOKEN（服务器 .env）
 * 地址与 token 均不入源码仓库。
 *
 * 配置后，m3u8 代理将：
 *   - 分片 URL 改写为 独立服务 /segment（播放器浏览器直连该服务）
 *   - 播放列表本身经 独立服务 /fetch 代取（主站与源不通时也能取到列表）
 */

import type { AdminConfig } from './admin.types';

export interface SegmentProxyConfig {
  baseUrl: string;
  token: string;
}

function normalizeBaseUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return null;
    if (!parsed.hostname) return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
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
  const base = normalizeBaseUrl(raw);
  if (!base) return null;
  return {
    baseUrl: base,
    token: env.SEGMENT_PROXY_TOKEN?.trim() ?? '',
  };
}

/**
 * 解析当前生效的分片代理配置：
 * 管理后台配置优先，未配置时回落到环境变量。
 */
export function resolveSegmentProxy(
  adminConfig?: Pick<AdminConfig, 'LiveProxyConfig'> | null | undefined,
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): SegmentProxyConfig | null {
  const adminBase = adminConfig?.LiveProxyConfig?.baseUrl?.trim();
  if (adminBase) {
    const base = normalizeBaseUrl(adminBase);
    if (!base) return null;
    return {
      baseUrl: base,
      token: adminConfig?.LiveProxyConfig?.token?.trim() ?? '',
    };
  }
  return getSegmentProxyConfig(env);
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
