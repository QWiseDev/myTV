/**
 * 部分 CDN 要求 ts 分片请求携带防盗链/签名参数（如爱奇艺源），
 * 否则分片请求返回 403。按源 key 维护需要追加的 query 参数。
 */
export const FRAGMENT_URL_SUFFIX_BY_SOURCE: Record<string, string> = {
  // 爱奇艺源 CDN：ts 分片必须携带 domianurl 防盗链参数
  'iqiyizyapi.com': 'domianurl=klm-ai.com',
};

/**
 * 按源 key 给分片 URL 追加防盗链参数；无配置的源原样返回。
 * 分片 URL 可能已带 query（?），此时用 & 合并。
 */
export function appendSourceFragmentParam(
  sourceKey: string | undefined,
  url: string,
): string {
  const param = sourceKey
    ? FRAGMENT_URL_SUFFIX_BY_SOURCE[sourceKey]
    : undefined;
  if (!param || !url) return url;
  return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
}
