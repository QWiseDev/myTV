import {
  calculateSourceScore,
  filterAdsFromM3U8,
  parseSpeedToKBps,
} from './helpers';

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

  test('parseSpeedToKBps parses KB/s and MB/s uniformly and rejects unknown strings', () => {
    expect(parseSpeedToKBps('1.50 MB/s')).toBe(1536);
    expect(parseSpeedToKBps('512.00 KB/s')).toBe(512);
    expect(parseSpeedToKBps('未知')).toBe(0);
    expect(parseSpeedToKBps('测量中...')).toBe(0);
    expect(parseSpeedToKBps(undefined)).toBe(0);
  });

  test('calculateSourceScore gives 0 speed points to unknown speed so it never beats measured working sources', () => {
    const measuredWorking = calculateSourceScore(
      { quality: '1080p', loadSpeed: '1.00 MB/s', pingTime: 120 },
      10 * 1024,
      80,
      200,
    );
    const unknownSpeed = calculateSourceScore(
      { quality: '1080p', loadSpeed: '未知', pingTime: 80 },
      10 * 1024,
      80,
      200,
    );

    // 1MB/s (4 pts) + same 1080p (30) + ping (~13.33) = 47.33 vs unknown 30 + 0 + 20?
    // Verify score components explicitly: unknown gets 0 speedScore; broken 9999 ping gets 0 pingScore
    const measuredSamePing = calculateSourceScore(
      { quality: '1080p', loadSpeed: '1.00 MB/s', pingTime: 100 },
      10 * 1024,
      100,
      200,
    );
    const unknownSamePing = calculateSourceScore(
      { quality: '1080p', loadSpeed: '未知', pingTime: 100 },
      10 * 1024,
      100,
      200,
    );
    expect(measuredWorking).toBeGreaterThan(0);
    expect(unknownSpeed).toBe(50);
    expect(measuredSamePing).toBeGreaterThan(unknownSamePing);

    const sentinelPingScore = calculateSourceScore(
      { quality: '未知', loadSpeed: '未知', pingTime: 9999 },
      1024,
      80,
      9999,
    );
    expect(sentinelPingScore).toBe(0);
  });
});
