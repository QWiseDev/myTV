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

function readConfig() {
  return {
    enabled: process.env.LIVE_HEALTH_CHECK !== 'off',
    timeoutMs: parseInt(process.env.LIVE_HEALTH_TIMEOUT || '5000', 10),
    concurrency: parseInt(process.env.LIVE_HEALTH_CONCURRENCY || '20', 10),
  };
}

export async function filterAliveChannels<T extends { url: string }>(
  channels: T[],
  ua: string,
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
        const resp = await fetch(url, {
          headers: { 'User-Agent': ua, Accept: '*/*' },
          signal: AbortSignal.timeout(config.timeoutMs),
          redirect: 'follow',
        });
        // 200-299（含 206 Range）视为存活；探测后立即取消 body 避免整段下载
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
