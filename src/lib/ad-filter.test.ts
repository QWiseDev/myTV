import {
  DEFAULT_CUSTOM_AD_FILTER_CODE,
  filterAdsFromM3U8,
  removeTypeAnnotations,
  validateCustomAdFilterCode,
} from './ad-filter';

describe('ad-filter', () => {
  test('runs custom ad filter code with TypeScript-style signature', () => {
    const manifest = [
      '#EXTM3U',
      '#EXTINF:10,',
      'main-1.ts',
      '#EXTINF:10,',
      'ad-1.ts',
    ].join('\n');
    const customCode = `
function filterAdsFromM3U8(type: string, m3u8Content: string): string {
  return m3u8Content
    .split('\\n')
    .filter((line) => !line.includes('ad-1.ts'))
    .join('\\n');
}`;

    expect(
      filterAdsFromM3U8(manifest, {
        type: 'source-a',
        customCode,
      }),
    ).toBe(['#EXTM3U', '#EXTINF:10,', 'main-1.ts', '#EXTINF:10,'].join('\n'));
  });

  test('falls back to default filter when custom code throws', () => {
    const manifest = [
      '#EXTM3U',
      '#EXTINF:10,',
      'main-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXT-X-CUE-OUT:DURATION=10',
      '#EXTINF:10,',
      'https://cdn.example.com/ads/ad-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:10,',
      'main-2.ts',
    ].join('\n');

    expect(
      filterAdsFromM3U8(manifest, {
        customCode:
          'function filterAdsFromM3U8(type, m3u8Content) { throw new Error("bad"); }',
      }),
    ).toBe(
      [
        '#EXTM3U',
        '#EXTINF:10,',
        'main-1.ts',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:10,',
        'main-2.ts',
      ].join('\n'),
    );
  });

  test('validates custom code and removes supported type annotations', () => {
    expect(
      removeTypeAnnotations(
        'function filterAdsFromM3U8(type: string, m3u8Content: string): string { return m3u8Content; }',
      ),
    ).toBe(
      'function filterAdsFromM3U8(type, m3u8Content) { return m3u8Content; }',
    );

    expect(() =>
      validateCustomAdFilterCode(
        'function filterAdsFromM3U8(type: string, m3u8Content: string): string { return m3u8Content; }',
      ),
    ).not.toThrow();
  });

  test('default custom template drops discontinuity markers', () => {
    const manifest = [
      '#EXTM3U',
      '#EXTINF:10,',
      'main-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:10,',
      'main-2.ts',
    ].join('\n');

    expect(
      filterAdsFromM3U8(manifest, {
        customCode: DEFAULT_CUSTOM_AD_FILTER_CODE,
      }),
    ).toBe(
      ['#EXTM3U', '#EXTINF:10,', 'main-1.ts', '#EXTINF:10,', 'main-2.ts'].join(
        '\n',
      ),
    );
  });
});
