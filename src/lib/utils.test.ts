import {
  getImageFallbackUrls,
  processImageUrl,
} from './utils';

const doubanImage =
  'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg';
type RuntimeConfigWindow = Window & { RUNTIME_CONFIG?: Record<string, string> };

describe('processImageUrl', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as RuntimeConfigWindow).RUNTIME_CONFIG;
  });

  it('uses configured server proxy for douban images', () => {
    localStorage.setItem('doubanImageProxyType', 'server');

    expect(processImageUrl(doubanImage)).toBe(
      `/api/image-proxy?url=${encodeURIComponent(doubanImage)}`
    );
  });

  it('uses configured custom proxy for douban images', () => {
    localStorage.setItem('doubanImageProxyType', 'custom');
    localStorage.setItem(
      'doubanImageProxyUrl',
      'https://proxy.example/fetch?url='
    );

    expect(processImageUrl(doubanImage)).toBe(
      `https://proxy.example/fetch?url=${encodeURIComponent(doubanImage)}`
    );
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
      `/api/image-proxy?url=${encodeURIComponent(doubanImage)}`
    );
    expect(urls).toContain(
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg'
    );
    expect(urls).toContain(
      'https://img.doubanio.cmliussss.net/view/photo/s_ratio_poster/public/p2884182275.jpg'
    );
    // 豆瓣官方域名（img3.doubanio.com / img*.doubanio.com）浏览器直连必 418，
    // 已从 fallback 链移除，不应出现
    expect(urls).not.toContain(
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg'
    );
    expect(urls).not.toContain(doubanImage);
  });

  it('skips douban official domains and falls back to CDN then image-proxy', () => {
    // 配置官方域名类型（img3），但浏览器无法 no-referrer 直连，应被过滤
    localStorage.setItem('doubanImageProxyType', 'img3');

    const urls = getImageFallbackUrls(doubanImage);

    // 不含任何豆瓣官方域名直连（注定 418）
    expect(urls).not.toContain(
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg'
    );
    expect(urls).not.toContain(doubanImage);
    // 首选第三方 CDN（可浏览器直连）
    expect(urls[0]).toBe(
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg'
    );
    // image-proxy 作为最终兜底（CDN 全挂时仍可显示）
    expect(urls).toContain(
      `/api/image-proxy?url=${encodeURIComponent(doubanImage)}`
    );
  });
});
