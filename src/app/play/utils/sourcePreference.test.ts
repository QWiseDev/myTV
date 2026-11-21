import type { SearchResult } from '@/lib/types';

import { lightweightPreference } from './sourcePreference';

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
});
