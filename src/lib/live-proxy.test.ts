import {
  buildExternalSegmentUrl,
  buildFetchViaProxyUrl,
  getSegmentProxyConfig,
} from './live-proxy';

describe('live-proxy', () => {
  describe('getSegmentProxyConfig', () => {
    it('未配置时返回 null（走内置代理）', () => {
      expect(getSegmentProxyConfig({})).toBeNull();
      expect(getSegmentProxyConfig({ SEGMENT_PROXY_BASE: '' })).toBeNull();
      expect(getSegmentProxyConfig({ SEGMENT_PROXY_BASE: '  ' })).toBeNull();
    });

    it('非法配置返回 null', () => {
      expect(
        getSegmentProxyConfig({ SEGMENT_PROXY_BASE: 'not-a-url' }),
      ).toBeNull();
      expect(
        getSegmentProxyConfig({ SEGMENT_PROXY_BASE: 'ftp://x.example' }),
      ).toBeNull();
    });

    it('合法配置去掉末尾斜杠并保留 token', () => {
      expect(
        getSegmentProxyConfig({
          SEGMENT_PROXY_BASE: 'https://124.220.134.40:9447/',
          SEGMENT_PROXY_TOKEN: ' abc123 ',
        }),
      ).toEqual({ baseUrl: 'https://124.220.134.40:9447', token: 'abc123' });
      expect(
        getSegmentProxyConfig({ SEGMENT_PROXY_BASE: 'http://10.0.0.1:8100' }),
      ).toEqual({ baseUrl: 'http://10.0.0.1:8100', token: '' });
    });
  });

  describe('buildExternalSegmentUrl / buildFetchViaProxyUrl', () => {
    const config = { baseUrl: 'https://124.220.134.40:9447', token: 'tok' };

    it('分片地址指向 /segment 并编码 url/ua/token 参数', () => {
      const url = buildExternalSegmentUrl(
        config,
        'http://src.example/live/0.ts',
        'Aptv Player/1.0',
      );
      const parsed = new URL(url);
      expect(`${parsed.protocol}//${parsed.host}`).toBe(
        'https://124.220.134.40:9447',
      );
      expect(parsed.pathname).toBe('/segment');
      expect(parsed.searchParams.get('url')).toBe(
        'http://src.example/live/0.ts',
      );
      expect(parsed.searchParams.get('ua')).toBe('Aptv Player/1.0');
      expect(parsed.searchParams.get('token')).toBe('tok');
    });

    it('代取地址指向 /fetch', () => {
      const url = buildFetchViaProxyUrl(
        config,
        'http://src.example/index.m3u8?k=1',
        '',
      );
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/fetch');
      expect(parsed.searchParams.get('url')).toBe(
        'http://src.example/index.m3u8?k=1',
      );
      // 无 ua 时不带 ua 参数，token 保留
      expect(parsed.searchParams.has('ua')).toBe(false);
      expect(parsed.searchParams.get('token')).toBe('tok');
    });

    it('无 token 时不带 token 参数', () => {
      const url = buildExternalSegmentUrl(
        { baseUrl: 'https://p.example', token: '' },
        'http://s/x.ts',
        'ua',
      );
      expect(new URL(url).searchParams.has('token')).toBe(false);
    });
  });
});
