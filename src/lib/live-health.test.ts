/**
 * @jest-environment node
 */
import { filterAliveChannels } from './live-health';

describe('filterAliveChannels 频道健康检查', () => {
  const channel = (name: string, url: string) => ({ name, url });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { fetch?: unknown }).fetch;
  });

  function mockFetch(
    handler: (url: string) => Promise<{ ok: boolean; status: number }>,
  ) {
    (global as { fetch: unknown }).fetch = jest.fn((url: string | URL) =>
      handler(String(url)).then((r) => ({
        ok: r.ok,
        status: r.status,
        body: { cancel: jest.fn().mockResolvedValue(undefined) },
      })),
    ) as unknown as typeof fetch;
  }

  it('剔除无响应与 4xx 的死链，保留 2xx/206 存活频道', async () => {
    mockFetch(async (url) => {
      if (url.includes('dead-timeout')) throw new Error('timeout');
      if (url.includes('dead-404')) return { ok: false, status: 404 };
      if (url.includes('dead-403')) return { ok: false, status: 403 };
      if (url.includes('alive-range')) return { ok: false, status: 206 };
      return { ok: true, status: 200 };
    });

    const channels = [
      channel('a', 'http://x/alive1.m3u8'),
      channel('b', 'http://x/dead-timeout.m3u8'),
      channel('c', 'http://x/dead-404.m3u8'),
      channel('d', 'http://x/dead-403.m3u8'),
      channel('e', 'http://x/alive-range.m3u8'),
    ];

    const { alive, deadRemoved } = await filterAliveChannels(channels, 'ua');
    expect(alive.map((c) => c.name)).toEqual(['a', 'e']);
    expect(deadRemoved).toBe(3);
  });

  it('相同 URL 只探测一次，重复频道共享结果', async () => {
    const fetchMock = jest.fn((_url: string | URL) =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: { cancel: jest.fn().mockResolvedValue(undefined) },
      }),
    ) as unknown as typeof fetch;
    (global as { fetch: unknown }).fetch = fetchMock;

    const channels = [
      channel('a', 'http://x/same.m3u8'),
      channel('a2', 'http://x/same.m3u8'),
      channel('b', 'http://x/other.m3u8'),
    ];

    const { alive, deadRemoved } = await filterAliveChannels(channels, 'ua');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(alive).toHaveLength(3);
    expect(deadRemoved).toBe(0);
  });

  it('非 http(s) 地址（rtp:// 等）不探测，直接剔除', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: { cancel: jest.fn().mockResolvedValue(undefined) },
      }),
    );
    (global as { fetch: unknown }).fetch = fetchMock as unknown as typeof fetch;

    const channels = [
      channel('http', 'http://x/live.m3u8'),
      channel('rtp', 'rtp://239.1.1.1:5000'),
      channel('rtsp', 'rtsp://x/stream'),
    ];

    const { alive, deadRemoved } = await filterAliveChannels(channels, 'ua');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alive.map((c) => c.name)).toEqual(['http']);
    expect(deadRemoved).toBe(2);
  });

  it('LIVE_HEALTH_CHECK=off 时跳过探测', async () => {
    process.env.LIVE_HEALTH_CHECK = 'off';
    const fetchMock = jest.fn();
    (global as { fetch: unknown }).fetch = fetchMock as unknown as typeof fetch;

    const channels = [channel('a', 'http://x/a.m3u8')];
    const { alive, deadRemoved } = await filterAliveChannels(channels, 'ua');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(alive).toHaveLength(1);
    expect(deadRemoved).toBe(0);
    delete process.env.LIVE_HEALTH_CHECK;
  });
});
