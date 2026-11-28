import type { SearchResult } from '@/lib/types';

import {
  lightweightPreference,
  preferBestSource,
  sortSourcesByPriority,
} from './sourcePreference';
import {
  clearSourceSpeedHistory,
  recordSourceSpeedSession,
} from './sourceSpeedHistory';

function createSource(name: string, episode: string): SearchResult {
  return {
    id: name,
    title: name,
    poster: '',
    episodes: [episode],
    episodes_titles: [],
    source: name,
    source_name: name,
    year: '2024',
  };
}

describe('sourcePreference', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    clearSourceSpeedHistory();
    jest.restoreAllMocks();
  });

  test('连通性探测使用 cors 模式的 HEAD', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('b.example')) {
        throw new TypeError('Failed to fetch');
      }
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    const best = await lightweightPreference(
      [
        createSource('source-a', 'https://a.example/video.m3u8'),
        createSource('source-b', 'https://b.example/video.m3u8'),
      ],
      jest.fn(),
    );

    expect(best.source_name).toBe('source-a');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://a.example/video.m3u8',
      expect.objectContaining({
        method: 'HEAD',
        mode: 'cors',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(warn).toHaveBeenCalled();
  });

  test('移动端优选跳过 CORS 被拒的源，选择可用源', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('bad.example')) {
        // CORS 被拒时浏览器抛 TypeError
        throw new TypeError('Failed to fetch');
      }
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    const best = await lightweightPreference(
      [
        createSource('bad', 'https://bad.example/video.m3u8'),
        createSource('good', 'https://good.example/video.m3u8'),
      ],
      jest.fn(),
    );

    expect(best.source_name).toBe('good');
    expect(warn).toHaveBeenCalled();
  });

  test('首批全部不可用时继续探测后续批次', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('good.example')) {
        return { ok: true, status: 200 };
      }
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();

    const sources = [
      createSource('bad-1', 'https://bad1.example/video.m3u8'),
      createSource('bad-2', 'https://bad2.example/video.m3u8'),
      createSource('bad-3', 'https://bad3.example/video.m3u8'),
      createSource('bad-4', 'https://bad4.example/video.m3u8'),
      createSource('bad-5', 'https://bad5.example/video.m3u8'),
      createSource('good-6', 'https://good.example/video.m3u8'),
    ];

    const best = await lightweightPreference(sources, jest.fn());

    expect(best.source_name).toBe('good-6');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://good.example/video.m3u8',
      expect.objectContaining({ method: 'HEAD', mode: 'cors' }),
    );
  });

  test('502 的源视为不可用，回退到可用源', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('down.example')) {
        return { ok: false, status: 502 };
      }
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();

    const best = await lightweightPreference(
      [
        createSource('down', 'https://down.example/video.m3u8'),
        createSource('good', 'https://good.example/video.m3u8'),
      ],
      jest.fn(),
    );

    expect(best.source_name).toBe('good');
  });

  test('HEAD 405（不支持 HEAD 但 CORS 开放）仍视为可用', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('nohead.example')) {
        return { ok: false, status: 405 };
      }
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();

    const best = await lightweightPreference(
      [
        createSource('nohead', 'https://nohead.example/video.m3u8'),
        createSource('bad', 'https://bad.example/video.m3u8'),
      ],
      jest.fn(),
    );

    expect(best.source_name).toBe('nohead');
  });

  test('403 Forbidden 不再被当作可用源', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('forbidden.example')) {
        return { ok: false, status: 403 };
      }
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();

    const best = await lightweightPreference(
      [
        createSource('forbidden', 'https://forbidden.example/video.m3u8'),
        createSource('good', 'https://good.example/video.m3u8'),
      ],
      jest.fn(),
    );

    expect(best.source_name).toBe('good');
  });

  test('现代 iPhone（isIOS13=true 且非平板）走移动端分批优选而非截断前 6 源', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('good8.example')) {
        return { ok: true, status: 200 };
      }
      return { ok: false, status: 502 };
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();
    const setProgress = jest.fn();

    const sources = [
      ...Array.from({ length: 7 }, (_, i) =>
        createSource(`bad-${i + 1}`, `https://bad${i + 1}.example/video.m3u8`),
      ),
      createSource('good-8', 'https://good8.example/video.m3u8'),
    ];

    const best = await preferBestSource(sources, {
      deviceInfo: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        isIOS: true,
        isIOS13: true,
        isMobile: true,
        isTablet: false,
      },
      setSpeedTestProgress: setProgress,
    });

    expect(best.source_name).toBe('good-8');
    expect(setProgress).toHaveBeenLastCalledWith(null);
  });

  test('iPad 兜底不原地修改传入的 sources 数组，并在结束时清理进度', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();
    const setProgress = jest.fn();

    const first = createSource('first-site', 'https://a.example/ep1.m3u8');
    const second: SearchResult = {
      ...createSource('dyttzyapi.com', 'https://b.example/ep1.m3u8'),
      source_name: '电影天堂',
    };
    const input = [first, second];

    const best = await preferBestSource(input, {
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
        isIOS: true,
        isIOS13: true,
        isMobile: true,
        isTablet: true,
      },
      setSpeedTestProgress: setProgress,
    });

    expect(best.source).toBe('dyttzyapi.com');
    expect(input[0].source).toBe('first-site');
    expect(setProgress).toHaveBeenLastCalledWith(null);
  });

  test('桌面端优选按传入的 episodeIndex 探测并清理进度条', async () => {
    const fetchUrls: string[] = [];
    const reader = {
      read: jest
        .fn()
        .mockImplementationOnce(async () => {
          await new Promise((r) => setTimeout(r, 40));
          return { done: false, value: new Uint8Array(96 * 1024) };
        })
        .mockResolvedValueOnce({ done: true }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      fetchUrls.push(target);
      if (target.endsWith('.m3u8')) {
        return {
          ok: true,
          status: 200,
          url: target,
          text: async () => ['#EXTM3U', '#EXTINF:6,', 'seg0.ts'].join('\n'),
        };
      }
      if (target.endsWith('.ts')) {
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read:
                reader.read.mock.calls.length === 0
                  ? reader.read
                  : jest
                      .fn()
                      .mockImplementationOnce(async () => {
                        await new Promise((r) => setTimeout(r, 40));
                        return {
                          done: false,
                          value: new Uint8Array(96 * 1024),
                        };
                      })
                      .mockResolvedValueOnce({ done: true }),
              cancel: jest.fn().mockResolvedValue(undefined),
            }),
          },
        };
      }
      throw new Error(`unexpected: ${target}`);
    }) as unknown as typeof fetch;

    const setProgress = jest.fn();
    const s1: SearchResult = {
      ...createSource('s1', 'https://s1.example/ep1.m3u8'),
      episodes: [
        'https://s1.example/ep1.m3u8',
        'https://s1.example/ep2.m3u8',
        'https://s1.example/ep3.m3u8',
      ],
    };
    const s2: SearchResult = {
      ...createSource('s2', 'https://s2.example/ep1.m3u8'),
      episodes: [
        'https://s2.example/ep1.m3u8',
        'https://s2.example/ep2.m3u8',
        'https://s2.example/ep3.m3u8',
      ],
    };

    await preferBestSource([s1, s2], {
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        isIOS: false,
        isIOS13: false,
        isMobile: false,
        isTablet: false,
      },
      setSpeedTestProgress: setProgress,
      episodeIndex: 2,
    });

    expect(fetchUrls).toContain('https://s1.example/ep3.m3u8');
    expect(fetchUrls).toContain('https://s2.example/ep3.m3u8');
    expect(fetchUrls).not.toContain('https://s1.example/ep2.m3u8');
    expect(setProgress).toHaveBeenLastCalledWith(null);
  });

  test('Android 平板不被误判为 iPad，仍按移动端多批次探测后续源', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('good8.example')) {
        return { ok: true, status: 200 };
      }
      return { ok: false, status: 502 };
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();
    const setProgress = jest.fn();

    const sources = [
      ...Array.from({ length: 7 }, (_, i) =>
        createSource(`bad-${i + 1}`, `https://bad${i + 1}.example/video.m3u8`),
      ),
      createSource('good-8', 'https://good8.example/video.m3u8'),
    ];

    const best = await preferBestSource(sources, {
      deviceInfo: {
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Xiaomi Pad 6) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        isIOS: false,
        isIOS13: false,
        isMobile: true,
        isTablet: true,
      },
      setSpeedTestProgress: setProgress,
    });

    expect(best.source_name).toBe('good-8');
    expect(setProgress).toHaveBeenLastCalledWith(null);
  });

  test('iPad 多候选分片探测全失败时保留评分最高的优先源作为兜底', async () => {
    global.fetch = jest.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const target = String(url);
        if (init?.method === 'HEAD') {
          // 非优先源略快，但优先源综合评分更高
          if (target.includes('preferred.example')) {
            await new Promise((r) => setTimeout(r, 30));
          }
          return { ok: true, status: 200 };
        }
        // GET 拉清单失败模拟分片验证全部不可用
        return { ok: false, status: 403, text: async () => '' };
      },
    ) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation();
    const setProgress = jest.fn();

    const normalFast = createSource(
      'normal',
      'https://normal.example/ep1.m3u8',
    );
    const preferred: SearchResult = {
      ...createSource('dyttzyapi.com', 'https://preferred.example/ep1.m3u8'),
      source_name: '电影天堂',
    };

    const best = await preferBestSource([normalFast, preferred], {
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
        isIOS: true,
        isIOS13: true,
        isMobile: true,
        isTablet: true,
      },
      setSpeedTestProgress: setProgress,
    });

    expect(best.source).toBe('dyttzyapi.com');
    expect(setProgress).toHaveBeenLastCalledWith(null);
  });

  test('sortSourcesByPriority 将历史易卡源沉底并提升历史流畅源', () => {
    const now = Date.now();
    recordSourceSpeedSession(
      'bad-src',
      {
        speedRatio: 1.0,
        ttfbMs: 2800,
        newSamples: 8,
        newStalls: 5,
        newPlayedSeconds: 300,
      },
      now,
    );
    recordSourceSpeedSession(
      'good-src',
      {
        speedRatio: 6.5,
        ttfbMs: 180,
        newSamples: 10,
        newStalls: 0,
        newPlayedSeconds: 600,
      },
      now,
    );

    const ordered = sortSourcesByPriority([
      createSource('bad-src', 'https://bad.example/1.m3u8'),
      createSource('neutral-src', 'https://neutral.example/1.m3u8'),
      createSource('good-src', 'https://good.example/1.m3u8'),
      createSource('dyttzyapi.com', 'https://preferred.example/1.m3u8'),
    ]);

    expect(ordered.map((s) => s.source)).toEqual([
      'dyttzyapi.com',
      'good-src',
      'neutral-src',
      'bad-src',
    ]);
  });

  test('sortSourcesByPriority 在优先源历史表现极差时也会将其沉底', () => {
    recordSourceSpeedSession(
      'dyttzyapi.com',
      {
        speedRatio: 1.0,
        ttfbMs: 3000,
        newSamples: 8,
        newStalls: 6,
        newPlayedSeconds: 300,
      },
      Date.now(),
    );

    const ordered = sortSourcesByPriority([
      createSource('dyttzyapi.com', 'https://preferred.example/1.m3u8'),
      createSource('other-src', 'https://other.example/1.m3u8'),
    ]);

    expect(ordered.map((s) => s.source)).toEqual([
      'other-src',
      'dyttzyapi.com',
    ]);
  });
});
