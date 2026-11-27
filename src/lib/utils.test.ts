import {
  getImageFallbackUrls,
  getVideoResolutionFromM3u8,
  processImageUrl,
  selectUsableImageUrl,
} from './utils';

const doubanImage =
  'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg';
const bangumiImage = 'http://lain.bgm.tv/pic/cover/l/27/ff/377130_wDU1x.jpg';
const invalidSourceLogo = 'https://018.shoutu.net/static/images/logo.jpg';
type RuntimeConfigWindow = Window & { RUNTIME_CONFIG?: Record<string, string> };

describe('processImageUrl', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as RuntimeConfigWindow).RUNTIME_CONFIG;
  });

  it('uses configured server proxy for douban images', () => {
    localStorage.setItem('doubanImageProxyType', 'server');

    expect(processImageUrl(doubanImage)).toBe(
      `/api/image-proxy?url=${encodeURIComponent(doubanImage)}`,
    );
  });

  it('uses configured custom proxy for douban images', () => {
    localStorage.setItem('doubanImageProxyType', 'custom');
    localStorage.setItem(
      'doubanImageProxyUrl',
      'https://proxy.example/fetch?url=',
    );

    expect(processImageUrl(doubanImage)).toBe(
      `https://proxy.example/fetch?url=${encodeURIComponent(doubanImage)}`,
    );
  });

  it('avoids official douban image URLs for direct-style settings', () => {
    localStorage.setItem('doubanImageProxyType', 'direct');

    expect(processImageUrl(doubanImage)).toBe(
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
  });

  it('falls back to a CDN when custom proxy URL is empty', () => {
    localStorage.setItem('doubanImageProxyType', 'custom');
    localStorage.setItem('doubanImageProxyUrl', '');

    expect(processImageUrl(doubanImage)).toBe(
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
  });

  it('proxies bangumi image URLs through the app server', () => {
    expect(processImageUrl(bangumiImage)).toBe(
      `/api/image-proxy?url=${encodeURIComponent(bangumiImage)}`,
    );
  });

  it('uses local placeholder for known invalid source logos', () => {
    expect(processImageUrl(invalidSourceLogo)).toBe('/logo.svg');
  });
});

describe('getImageFallbackUrls', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as RuntimeConfigWindow).RUNTIME_CONFIG;
  });

  it('returns multiple douban image fallbacks after the preferred url', () => {
    localStorage.setItem('doubanImageProxyType', 'server');

    const urls = getImageFallbackUrls(doubanImage);

    expect(urls[0]).toBe(
      `/api/image-proxy?url=${encodeURIComponent(doubanImage)}`,
    );
    expect(urls).toContain(
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
    expect(urls).toContain(
      'https://img.doubanio.cmliussss.net/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
    // 豆瓣官方域名（img3.doubanio.com / img*.doubanio.com）浏览器直连必 418，
    // 已从 fallback 链移除，不应出现
    expect(urls).not.toContain(
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
    expect(urls).not.toContain(doubanImage);
    expect(urls.at(-1)).toBe('/logo.svg');
  });

  it('falls back from regular external images to the local placeholder', () => {
    expect(getImageFallbackUrls('https://cdn.example/poster.jpg')).toEqual([
      'https://cdn.example/poster.jpg',
      '/logo.svg',
    ]);
  });

  it('skips douban official domains and falls back to CDN then image-proxy', () => {
    // 配置官方域名类型（img3），但浏览器无法 no-referrer 直连，应被过滤
    localStorage.setItem('doubanImageProxyType', 'img3');

    const urls = getImageFallbackUrls(doubanImage);

    // 不含任何豆瓣官方域名直连（注定 418）
    expect(urls).not.toContain(
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
    expect(urls).not.toContain(doubanImage);
    // 首选第三方 CDN（可浏览器直连）
    expect(urls[0]).toBe(
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
    // image-proxy 作为最终兜底（CDN 全挂时仍可显示）
    expect(urls).toContain(
      `/api/image-proxy?url=${encodeURIComponent(doubanImage)}`,
    );
  });

  it('skips empty custom proxy result in fallback chain', () => {
    localStorage.setItem('doubanImageProxyType', 'custom');
    localStorage.setItem('doubanImageProxyUrl', '');

    const urls = getImageFallbackUrls(doubanImage);

    expect(urls[0]).toBe(
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    );
    expect(urls).not.toContain(doubanImage);
  });

  it('does not direct-load bangumi image URLs in browser fallback chain', () => {
    const urls = getImageFallbackUrls(bangumiImage);

    expect(urls).toEqual([
      `/api/image-proxy?url=${encodeURIComponent(bangumiImage)}`,
      '/logo.svg',
    ]);
  });

  it('does not request known invalid source logos', () => {
    expect(getImageFallbackUrls(invalidSourceLogo)).toEqual(['/logo.svg']);
  });
});

describe('selectUsableImageUrl', () => {
  it('skips placeholders and known invalid source logos', () => {
    expect(
      selectUsableImageUrl('', '/logo.svg', invalidSourceLogo, doubanImage),
    ).toBe(doubanImage);
  });
});

describe('getVideoResolutionFromM3u8', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeSegmentStreamResponse(sizeBytes: number, delayMs: number) {
    const chunk = new Uint8Array(sizeBytes);
    const reader = {
      read: jest
        .fn()
        .mockImplementationOnce(async () => {
          await new Promise((r) => setTimeout(r, delayMs));
          return { done: false, value: chunk };
        })
        .mockResolvedValueOnce({ done: true }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    return {
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    };
  }

  it('measures actual segment download speed instead of copying manifest BANDWIDTH', async () => {
    const masterUrl = 'https://cdn.test/video-real/master.m3u8';
    const childUrl = 'https://cdn.test/video-real/1080p/index.m3u8';
    const segUrl = 'https://cdn.test/video-real/1080p/seg0.ts';

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target === masterUrl) {
        return {
          ok: true,
          status: 200,
          url: masterUrl,
          text: async () =>
            [
              '#EXTM3U',
              '#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=1920x1080',
              '1080p/index.m3u8',
            ].join('\n'),
        };
      }
      if (target === childUrl) {
        return {
          ok: true,
          status: 200,
          url: childUrl,
          text: async () => ['#EXTM3U', '#EXTINF:6,', 'seg0.ts'].join('\n'),
        };
      }
      if (target === segUrl) {
        // 名义码率 ~10MB/s，但实际分片耗时 ~120ms 下载 128KB（约 1MB/s）
        return makeSegmentStreamResponse(128 * 1024, 120);
      }
      throw new Error(`unexpected url: ${target}`);
    }) as unknown as typeof fetch;

    const result = await getVideoResolutionFromM3u8(masterUrl, 3000);

    expect(result.success).toBe(true);
    expect(result.quality).toBe('1080p');
    expect(result.loadSpeed).not.toBe('未知');
    const mbMatch = result.loadSpeed.match(/^([\d.]+)\s*MB\/s$/);
    if (mbMatch) {
      expect(parseFloat(mbMatch[1])).toBeLessThan(4);
    }
  });

  it('treats 404/403 manifests and non-m3u8 HTML pages as failures without poisoning smartCache', async () => {
    const { smartCache } = await import('@/app/play/utils/smartCache');
    const bad404 = 'https://cdn.test/broken-404/index.m3u8';
    const html200 = 'https://cdn.test/soft-404/index.m3u8';
    const forbiddenSegMaster = 'https://cdn.test/bad-seg/index.m3u8';

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target === bad404) {
        return { ok: false, status: 404, text: async () => 'Not Found' };
      }
      if (target === html200) {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body>Blocked</body></html>',
        };
      }
      if (target === forbiddenSegMaster) {
        return {
          ok: true,
          status: 200,
          url: forbiddenSegMaster,
          text: async () => ['#EXTM3U', '#EXTINF:6,', 'seg0.ts'].join('\n'),
        };
      }
      if (target === 'https://cdn.test/bad-seg/seg0.ts') {
        return { ok: false, status: 403 };
      }
      throw new Error(`unexpected url: ${target}`);
    }) as unknown as typeof fetch;

    const r1 = await getVideoResolutionFromM3u8(bad404, 2000);
    const r2 = await getVideoResolutionFromM3u8(html200, 2000);
    const r3 = await getVideoResolutionFromM3u8(forbiddenSegMaster, 2000);

    expect(r1).toMatchObject({
      success: false,
      pingTime: 9999,
      loadSpeed: '未知',
    });
    expect(r2).toMatchObject({
      success: false,
      pingTime: 9999,
      loadSpeed: '未知',
    });
    expect(r3).toMatchObject({
      success: false,
      pingTime: 9999,
      loadSpeed: '未知',
    });
    expect(smartCache.get(bad404)).toBeNull();
    expect(smartCache.get(html200)).toBeNull();
    expect(smartCache.get(forbiddenSegMaster)).toBeNull();
  });

  it('measures single-bitrate media playlists directly without returning 未知', async () => {
    const mediaUrl = 'https://cdn.test/single-rate/index.m3u8';
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target === mediaUrl) {
        return {
          ok: true,
          status: 200,
          url: mediaUrl,
          text: async () => ['#EXTM3U', '#EXTINF:5,', 'chunk0.ts'].join('\n'),
        };
      }
      if (target === 'https://cdn.test/single-rate/chunk0.ts') {
        return makeSegmentStreamResponse(96 * 1024, 80);
      }
      throw new Error(`unexpected url: ${target}`);
    }) as unknown as typeof fetch;

    const result = await getVideoResolutionFromM3u8(mediaUrl, 2000);
    expect(result.success).toBe(true);
    expect(result.loadSpeed).toMatch(/(KB\/s|MB\/s)$/);
  });

  it('rejects master playlists whose child playlist returns HTML/empty without redundant fetch', async () => {
    const masterUrl = 'https://cdn.test/bad-child/master.m3u8';
    const childUrl = 'https://cdn.test/bad-child/1080p.m3u8';
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target === masterUrl) {
        return {
          ok: true,
          status: 200,
          url: masterUrl,
          text: async () =>
            [
              '#EXTM3U',
              '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080',
              '1080p.m3u8',
            ].join('\n'),
        };
      }
      if (target === childUrl) {
        return {
          ok: true,
          status: 200,
          url: childUrl,
          text: async () => '<html>blocked</html>',
        };
      }
      throw new Error(`unexpected url: ${target}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await getVideoResolutionFromM3u8(masterUrl, 2000);

    expect(result).toMatchObject({
      success: false,
      pingTime: 9999,
      loadSpeed: '未知',
    });
    // 子清单只拉取一次，不会再把 .m3u8 当作媒体分片重复请求
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
