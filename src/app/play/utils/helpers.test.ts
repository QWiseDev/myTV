import { filterAdsFromM3U8 } from './helpers';

describe('helpers', () => {
  test('filterAdsFromM3U8 preserves discontinuity tags and manifest content', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXTINF:10,',
      'segment-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:10,',
      'segment-2.ts',
    ].join('\n');

    expect(filterAdsFromM3U8(manifest)).toBe(manifest);
  });

  test('filterAdsFromM3U8 removes explicit cue-out ad section between discontinuities', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXTINF:10,',
      'main-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXT-X-CUE-OUT:DURATION=20',
      '#EXTINF:10,',
      'https://cdn.example.com/ads/ad-1.ts',
      '#EXTINF:10,',
      'https://cdn.example.com/ads/ad-2.ts',
      '#EXT-X-CUE-IN',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:10,',
      'main-2.ts',
    ].join('\n');

    expect(filterAdsFromM3U8(manifest)).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXTINF:10,',
        'main-1.ts',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:10,',
        'main-2.ts',
      ].join('\n'),
    );
  });

  test('filterAdsFromM3U8 removes short discontinuity-bounded ad URI section', () => {
    const manifest = [
      '#EXTM3U',
      '#EXTINF:10,',
      'main-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:15,',
      'https://cdn.example.com/preroll/ad-1.ts',
      '#EXTINF:15,',
      'https://cdn.example.com/preroll/ad-2.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:10,',
      'main-2.ts',
    ].join('\n');

    expect(filterAdsFromM3U8(manifest)).toBe(
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

  test('filterAdsFromM3U8 keeps short legal discontinuity section without ad URI', () => {
    const manifest = [
      '#EXTM3U',
      '#EXTINF:10,',
      'main-1.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:6,',
      'camera-angle-1.ts',
      '#EXTINF:6,',
      'camera-angle-2.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:10,',
      'main-2.ts',
    ].join('\n');

    expect(filterAdsFromM3U8(manifest)).toBe(manifest);
  });
});
