import { SmartCache } from './smartCache';

describe('SmartCache', () => {
  it('isolates cache entries per normalized full URL on the same CDN host', () => {
    const cache = new SmartCache();

    cache.set('https://cdn.example.com/movie-a/480p.m3u8?token=1#frag', {
      quality: '480p',
      loadSpeed: '500.00 KB/s',
      pingTime: 120,
      success: true,
    });
    cache.set('https://cdn.example.com/movie-b/1080p.m3u8?token=2', {
      quality: '1080p',
      loadSpeed: '2.50 MB/s',
      pingTime: 80,
      success: true,
    });

    expect(
      cache.get('https://cdn.example.com/movie-a/480p.m3u8?token=1'),
    ).toMatchObject({
      quality: '480p',
      loadSpeed: '500.00 KB/s',
    });
    expect(
      cache.get('https://cdn.example.com/movie-b/1080p.m3u8?token=2'),
    ).toMatchObject({
      quality: '1080p',
      loadSpeed: '2.50 MB/s',
    });
    expect(cache.get('https://cdn.example.com/movie-c/720p.m3u8')).toBeNull();
  });

  it('does not cache failed probes or poison avgResponseTime with 9999ms sentinels', () => {
    const cache = new SmartCache();
    const okUrl = 'https://cdn.example.com/ok.m3u8';
    const failUrl = 'https://cdn.example.com/dead.m3u8';

    cache.set(okUrl, {
      quality: '1080p',
      loadSpeed: '2.00 MB/s',
      pingTime: 100,
      success: true,
    });
    cache.set(failUrl, {
      quality: '未知',
      loadSpeed: '未知',
      pingTime: 9999,
      success: false,
    });

    expect(cache.get(failUrl)).toBeNull();
    expect(cache.get(okUrl)).toMatchObject({ quality: '1080p', pingTime: 100 });

    // 超时后同一 URL 被记录为失败时，之前成功缓存也应失效
    cache.set(okUrl, {
      quality: '未知',
      loadSpeed: '未知',
      pingTime: 9999,
      success: false,
    });
    expect(cache.get(okUrl)).toBeNull();

    const reliability = cache.getReliability(okUrl);
    expect(reliability).toBeDefined();
    expect(reliability?.totalCount).toBe(3);
    expect(reliability?.successCount).toBe(1);
    expect(reliability?.avgResponseTime).toBe(100);
  });

  it('excludes fast 404 failures from avgResponseTime and weights avgQuality by valid quality samples', () => {
    const cache = new SmartCache();
    const url = 'https://cdn2.example.com/ep1.m3u8';

    // 两次成功但清晰度未知（例如单码率未声明高度）
    cache.set(url, {
      quality: '未知',
      loadSpeed: '1.00 MB/s',
      pingTime: 200,
      success: true,
    });
    cache.set(url, {
      quality: '未知',
      loadSpeed: '1.00 MB/s',
      pingTime: 300,
      success: true,
    });
    // 一次快速 404 失败（20ms）不应拉低 avgResponseTime
    cache.set('https://cdn2.example.com/missing.m3u8', {
      quality: '未知',
      loadSpeed: '未知',
      pingTime: 20,
      success: false,
    });
    // 随后拿到 4K 与 480p 各一次（均分 70 -> 1080p），不应被前两次“未知”稀释权重
    cache.set('https://cdn2.example.com/ep2.m3u8', {
      quality: '4K',
      loadSpeed: '2.00 MB/s',
      pingTime: 400,
      success: true,
    });
    cache.set('https://cdn2.example.com/ep3.m3u8', {
      quality: '480p',
      loadSpeed: '1.00 MB/s',
      pingTime: 300,
      success: true,
    });

    const reliability = cache.getReliability(url);
    expect(reliability?.avgResponseTime).toBe(300);
    expect(reliability?.avgQuality).toBe('1080p');
  });
});
