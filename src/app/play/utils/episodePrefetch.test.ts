import {
  clearEpisodePrefetchCache,
  consumePrefetchedManifest,
  consumePrefetchedSegment,
  prefetchNextEpisodeMedia,
} from './episodePrefetch';

describe('prefetchNextEpisodeMedia', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    clearEpisodePrefetchCache();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('prefetches HLS manifest and first segment up to maxBytes', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const read = jest
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024) })
      .mockResolvedValueOnce({ done: true, value: undefined });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        url: 'https://cdn.example/ep2/index.m3u8',
        text: async () => '#EXTM3U\n#EXTINF:4.0,\nseg0.ts\n',
      })
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({ read, cancel }),
        },
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = await prefetchNextEpisodeMedia(
      'https://cdn.example/ep2/index.m3u8',
      { sourceKey: 'test-src' },
    );

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://cdn.example/ep2/index.m3u8',
      expect.objectContaining({ cache: 'default' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example/ep2/seg0.ts',
      expect.objectContaining({ cache: 'default' }),
    );
    expect(cancel).toHaveBeenCalled();
  });

  test('skips when saveData is enabled or URL is empty', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await prefetchNextEpisodeMedia('   ')).toBe(false);

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
    expect(
      await prefetchNextEpisodeMedia('https://cdn.example/ep2/index.m3u8'),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: undefined,
    });
  });

  test('swallows network/abort failures gracefully', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network error')) as unknown as typeof fetch;

    await expect(
      prefetchNextEpisodeMedia('https://cdn.example/ep2/index.m3u8'),
    ).resolves.toBe(false);
  });

  test('skips ad segments when ad filtering is enabled and avoids refetching unresolved child m3u8', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const read = jest
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024) })
      .mockResolvedValueOnce({ done: true, value: undefined });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        url: 'https://cdn.example/ep2/index.m3u8',
        text: async () =>
          [
            '#EXTM3U',
            '#EXT-X-DISCONTINUITY',
            '#EXT-X-CUE-OUT:DURATION=10',
            '#EXTINF:10,',
            'https://ads.example/ad0.ts',
            '#EXT-X-CUE-IN',
            '#EXT-X-DISCONTINUITY',
            '#EXTINF:6,',
            'main0.ts',
          ].join('\n'),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({ read, cancel }),
        },
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = await prefetchNextEpisodeMedia(
      'https://cdn.example/ep2/index.m3u8',
      { sourceKey: 'test-src' },
    );

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example/ep2/main0.ts',
      expect.objectContaining({ cache: 'default' }),
    );
  });

  test('prefetches 2 full segments and child playlist into memory cache on slow sources', async () => {
    const seg0 = new Uint8Array([0x47, 0x01, 0x02]);
    const seg1 = new Uint8Array([0x47, 0x03, 0x04]);

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        url: 'https://cdn.example/ep3/master.m3u8',
        text: async () =>
          '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n1080p/index.m3u8\n',
      })
      .mockResolvedValueOnce({
        ok: true,
        url: 'https://cdn.example/ep3/1080p/index.m3u8',
        text: async () =>
          '#EXTM3U\n#EXTINF:5,\nseg0.ts\n#EXTINF:5,\nseg1.ts\n#EXTINF:5,\nseg2.ts\n',
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => seg0.buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => seg1.buffer,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = await prefetchNextEpisodeMedia(
      'https://cdn.example/ep3/master.m3u8',
      { sourceKey: 'slow-src', speedTier: 'very_slow' },
    );

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // 清单与前 2 片可一次性消费，二次消费返回 null
    const master = consumePrefetchedManifest(
      'https://cdn.example/ep3/master.m3u8',
    );
    expect(master?.text).toContain('1080p/index.m3u8');
    expect(
      consumePrefetchedManifest('https://cdn.example/ep3/master.m3u8'),
    ).toBeNull();

    const child = consumePrefetchedManifest(
      'https://cdn.example/ep3/1080p/index.m3u8',
    );
    expect(child?.text).toContain('seg1.ts');

    const cachedSeg0 = consumePrefetchedSegment(
      'https://cdn.example/ep3/1080p/seg0.ts',
    );
    const cachedSeg1 = consumePrefetchedSegment(
      'https://cdn.example/ep3/1080p/seg1.ts',
    );
    expect(cachedSeg0?.bytes).toBe(3);
    expect(cachedSeg1?.bytes).toBe(3);
    expect(
      consumePrefetchedSegment('https://cdn.example/ep3/1080p/seg0.ts'),
    ).toBeNull();
  });
});
