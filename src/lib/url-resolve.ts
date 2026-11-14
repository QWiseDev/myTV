/**
 * M3U8/媒体 URL 解析工具（从 live.ts 抽出，供 live-health 等模块复用）。
 */

export function resolveUrl(baseUrl: string, relativePath: string) {
  try {
    // 如果已经是完整的 URL，直接返回
    if (
      relativePath.startsWith('http://') ||
      relativePath.startsWith('https://')
    ) {
      return relativePath;
    }

    // 如果是协议相对路径 (//example.com/path)
    if (relativePath.startsWith('//')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}${relativePath}`;
    }

    // 使用 URL 构造函数处理相对路径
    const baseUrlObj = new URL(baseUrl);
    const resolvedUrl = new URL(relativePath, baseUrlObj);
    return resolvedUrl.href;
  } catch (error) {
    // 降级处理
    return fallbackUrlResolve(baseUrl, relativePath);
  }
}

function fallbackUrlResolve(baseUrl: string, relativePath: string) {
  // 移除 baseUrl 末尾的文件名，保留目录路径
  let base = baseUrl;
  if (!base.endsWith('/')) {
    base = base.substring(0, base.lastIndexOf('/') + 1);
  }

  // 处理不同类型的相对路径
  if (relativePath.startsWith('/')) {
    const urlObj = new URL(base);
    return `${urlObj.protocol}//${urlObj.host}${relativePath}`;
  } else if (relativePath.startsWith('../')) {
    const segments = base.split('/').filter((s) => s);
    const relativeSegments = relativePath.split('/').filter((s) => s);

    for (const segment of relativeSegments) {
      if (segment === '..') {
        segments.pop();
      } else if (segment !== '.') {
        segments.push(segment);
      }
    }

    const urlObj = new URL(base);
    return `${urlObj.protocol}//${urlObj.host}/${segments.join('/')}`;
  } else {
    const cleanRelative = relativePath.startsWith('./')
      ? relativePath.slice(2)
      : relativePath;
    return base + cleanRelative;
  }
}

// 获取 M3U8 的基础 URL
export function getBaseUrl(m3u8Url: string) {
  try {
    const url = new URL(m3u8Url);
    // 如果 URL 以 .m3u8 结尾，移除文件名
    if (url.pathname.endsWith('.m3u8')) {
      url.pathname = url.pathname.substring(
        0,
        url.pathname.lastIndexOf('/') + 1,
      );
    } else if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }
    return url.protocol + '//' + url.host + url.pathname;
  } catch (error) {
    return m3u8Url.endsWith('/') ? m3u8Url : m3u8Url + '/';
  }
}
