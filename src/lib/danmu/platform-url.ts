const SUPPORTED_DANMU_PLATFORM_DOMAINS = [
  'v.qq.com',
  'iqiyi.com',
  'youku.com',
  'mgtv.com',
  'bilibili.com',
  'miguvideo.com',
  'sohu.com',
  'le.com',
  'ixigua.com',
] as const;

const MAX_PLATFORM_URL_LENGTH = 2048;

/**
 * 校验视频链接是否属于支持的第三方平台域名（严格解析 URL hostname，防止子串伪造）。
 */
export function isSupportedDanmuPlatformUrl(videoUrl: string): boolean {
  if (
    typeof videoUrl !== 'string' ||
    !videoUrl ||
    videoUrl.length > MAX_PLATFORM_URL_LENGTH
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(videoUrl);
  } catch {
    return false;
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password
  ) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return SUPPORTED_DANMU_PLATFORM_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}
