import {
  getImageFallbackUrls,
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
