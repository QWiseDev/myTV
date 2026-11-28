import type { SearchResult } from '@/lib/types';

import {
  buildEpisodeProbeCacheKey,
  classifyEpisodeProbeSpeed,
  EPISODE_PROBE_CACHE_TTL_MS,
  EpisodeSourceCheckResult,
  followManifestToSegment,
  formatSpeed,
  getOptimalProbeConcurrency,
  isEpisodeProbeResultFresh,
  isLikelyHlsUrl,
  measureSegmentLoadSpeed,
  measureSegmentLoadSpeedDetailed,
  pickDeclaredResolutionHeight,
  pickFirstMediaSegment,
  planEpisodeSourceChecks,
  probePlayableMediaUrl,
  readLocalAdFilterSettings,
  runEpisodeSourceChecks,
} from '@/app/play/utils/episodeSourceCheck';

function createSource(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: 'id',
    title: 'title',
    poster: '',
    episodes: [],
    episodes_titles: [],
    source: 'src',
    source_name: 'Source',
    year: '2024',
    ...overrides,
  };
}

describe('episodeSourceCheck', () => {
  test('formatSpeed: 按字节/秒换算，1MB 用 1 秒即 1.00 MB/s', () => {
    const oneMB = 1024 * 1024;
    expect(formatSpeed(oneMB, 1000)).toBe('1.00 MB/s');
    expect(formatSpeed(oneMB * 4, 1000)).toBe('4.00 MB/s');
    // 小流量走 KB/s 分支
    expect(formatSpeed(512 * 1024, 1000)).toBe('512.00 KB/s');
    // 异常输入不产生虚假速度
    expect(formatSpeed(0, 1000)).toBe('未知');
    expect(formatSpeed(oneMB, 0)).toBe('未知');
  });

  test('pickFirstMediaSegment: 跳过标签与注释，返回首个分片绝对地址', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      'seg0.ts',
      'seg1.ts',
    ].join('\n');
    expect(pickFirstMediaSegment(manifest, 'https://cdn.test/a/b.m3u8')).toBe(
      'https://cdn.test/a/seg0.ts',
    );
    // 绝对地址保持原样
    expect(
      pickFirstMediaSegment(
        '#EXTM3U\nhttps://other.test/x.ts',
        'https://cdn.test/b.m3u8',
      ),
    ).toBe('https://other.test/x.ts');
    // 无可播放分片
    expect(
      pickFirstMediaSegment('#EXTM3U\n#EXT-X-ENDLIST', 'https://c/x.m3u8'),
    ).toBe(null);
    expect(pickFirstMediaSegment('', 'https://c/x.m3u8')).toBe(null);
  });

  test('pickDeclaredResolutionHeight: 取主列表声明的最大高度', () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720',
      'low/index.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080',
      'high/index.m3u8',
    ].join('\n');
    expect(pickDeclaredResolutionHeight(master)).toBe(1080);

    // 单码率媒体列表通常没有 RESOLUTION 声明
    expect(pickDeclaredResolutionHeight('#EXTM3U\n#EXTINF:6,\nseg0.ts')).toBe(
      0,
    );
    expect(pickDeclaredResolutionHeight('')).toBe(0);
  });

  test('buildEpisodeProbeCacheKey: different episodes use different cache entries', () => {
    expect(buildEpisodeProbeCacheKey('s1-a', 0)).toBe('s1-a::episode-0');
    expect(buildEpisodeProbeCacheKey('s1-a', 1)).toBe('s1-a::episode-1');
  });

  test('isEpisodeProbeResultFresh: only final results within TTL with unchanged url', () => {
    const now = 1_000_000;
    const base: EpisodeSourceCheckResult = {
      sourceKey: 's1-a',
      episodeIndex: 0,
      status: 'success',
      url: 'http://example.com/1.m3u8',
      checkedAt: now - 1000,
    };

    expect(isEpisodeProbeResultFresh(base, base.url, now)).toBe(true);
    // 播放地址变化（如详情补全后替换 episodes）视为过期
    expect(
      isEpisodeProbeResultFresh(base, 'http://example.com/2.m3u8', now),
    ).toBe(false);
    // 超过 TTL
    expect(
      isEpisodeProbeResultFresh(
        base,
        undefined,
        now + EPISODE_PROBE_CACHE_TTL_MS + 1,
      ),
    ).toBe(false);
    // 占位结果（checkedAt=0）不参与复用
    expect(
      isEpisodeProbeResultFresh({ ...base, checkedAt: 0 }, undefined, now),
    ).toBe(false);
    // 非终态（checking/cancelled）不可复用
    expect(
      isEpisodeProbeResultFresh(
        { ...base, status: 'checking' },
        undefined,
        now,
      ),
    ).toBe(false);
    expect(
      isEpisodeProbeResultFresh(
        { ...base, status: 'cancelled' },
        undefined,
        now,
      ),
    ).toBe(false);
  });

  test('getOptimalProbeConcurrency: defaults to 2 without connection info', () => {
    expect(getOptimalProbeConcurrency()).toBe(2);
  });

  test('isLikelyHlsUrl: recognises query strings and fragments', () => {
    expect(isLikelyHlsUrl('https://example.com/live.m3u8?token=1')).toBe(true);
    expect(isLikelyHlsUrl('https://example.com/live.m3u8#segment')).toBe(true);
    expect(isLikelyHlsUrl('https://example.com/live.mp4#segment')).toBe(false);
  });
  test('planEpisodeSourceChecks: current source is placed first', () => {
    const a = createSource({ id: 'a', source: 's1', source_name: 'S1' });
    const b = createSource({ id: 'b', source: 's2', source_name: 'S2' });
    const plan = planEpisodeSourceChecks({
      sources: [a, b],
      episodeIndex: 0,
      currentSource: 's2',
      currentId: 'b',
    });

    expect(plan[0].source.id).toBe('b');
  });

  test('planEpisodeSourceChecks: missing episode is marked as skipped', () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/ep1.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a],
      episodeIndex: 1,
      currentSource: 's1',
      currentId: 'a',
    });

    expect(plan[0].skippedReason).toBe('无此集');
  });

  test('runEpisodeSourceChecks: emits checking then success for a normal item', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/ep1.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    const updates: Array<{ status: string }> = [];
    const controller = new AbortController();

    await runEpisodeSourceChecks({
      plan,
      signal: controller.signal,
      resolveUrl: async (item) => ({ url: item.episodeData }),
      probeUrl: async () => ({
        quality: '1080p',
        loadSpeed: '1.00 MB/s',
        pingTimeMs: 123,
      }),
      onUpdate: (next) => updates.push({ status: next.status }),
    });

    expect(updates.map((u) => u.status)).toEqual(['checking', 'success']);
  });

  test('runEpisodeSourceChecks: continues when resolveUrl returns skippedReason', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/a.m3u8'],
    });
    const b = createSource({
      id: 'b',
      source: 's2',
      episodes: ['http://example.com/b.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a, b],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    const controller = new AbortController();
    const probeCalls: string[] = [];
    const finalStatuses: Record<string, string> = {};

    await runEpisodeSourceChecks({
      plan,
      signal: controller.signal,
      resolveUrl: async (item) =>
        item.source.id === 'a'
          ? { skippedReason: '跳过A' }
          : { url: item.episodeData },
      probeUrl: async (url) => {
        probeCalls.push(url);
        return { quality: '720p', loadSpeed: '100 KB/s', pingTimeMs: 50 };
      },
      onUpdate: (next) => {
        if (next.status !== 'checking') {
          finalStatuses[next.sourceKey] = next.status;
        }
      },
    });

    expect(Object.values(finalStatuses).sort()).toEqual(['skipped', 'success']);
    expect(probeCalls).toHaveLength(1);
  });

  test('runEpisodeSourceChecks: reuses fresh cached results via resolveCache', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/a.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    const cached: EpisodeSourceCheckResult = {
      sourceKey: 's1-a',
      episodeIndex: 0,
      status: 'success',
      url: 'http://example.com/a.m3u8',
      quality: '720p',
      loadSpeed: '100 KB/s',
      pingTimeMs: 50,
      message: '可播放',
      checkedAt: Date.now(),
    };

    const updates: EpisodeSourceCheckResult[] = [];
    let probeCount = 0;

    await runEpisodeSourceChecks({
      plan,
      signal: new AbortController().signal,
      resolveUrl: async () => ({ url: 'http://example.com/a.m3u8' }),
      probeUrl: async () => {
        probeCount += 1;
        return { quality: '720p', loadSpeed: '100 KB/s', pingTimeMs: 50 };
      },
      resolveCache: () => cached,
      onUpdate: (next) => updates.push(next),
    });

    // 缓存命中：不发起真实探测，且保留原始 checkedAt
    expect(probeCount).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('success');
    expect(updates[0].checkedAt).toBe(cached.checkedAt);
  });

  test('runEpisodeSourceChecks: probeUrl receives the plan item', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/a.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    let receivedSource = '';
    await runEpisodeSourceChecks({
      plan,
      signal: new AbortController().signal,
      resolveUrl: async (item) => ({ url: item.episodeData }),
      probeUrl: async (_url, _signal, item) => {
        receivedSource = item.source.source;
        return { quality: '720p', loadSpeed: '100 KB/s', pingTimeMs: 50 };
      },
      onUpdate: () => undefined,
    });

    expect(receivedSource).toBe('s1');
  });

  test('runEpisodeSourceChecks: abort cancels remaining items', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/a.m3u8'],
    });
    const b = createSource({
      id: 'b',
      source: 's2',
      episodes: ['http://example.com/b.m3u8'],
    });
    const c = createSource({
      id: 'c',
      source: 's3',
      episodes: ['http://example.com/c.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a, b, c],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    const controller = new AbortController();
    const finals: Record<string, string> = {};
    let probeCount = 0;

    await runEpisodeSourceChecks({
      plan,
      signal: controller.signal,
      resolveUrl: async (item) => ({ url: item.episodeData }),
      probeUrl: async () => {
        probeCount += 1;
        if (probeCount === 1) {
          controller.abort();
        }
        return { quality: '720p', loadSpeed: '100 KB/s', pingTimeMs: 50 };
      },
      onUpdate: (next) => {
        if (next.status !== 'checking') {
          finals[next.sourceKey] = next.status;
        }
      },
    });

    // 第一个成功，其余被取消
    const statuses = Object.values(finals);
    expect(statuses).toContain('success');
    expect(statuses).toContain('cancelled');
  });

  describe('followManifestToSegment', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function stubFetch(response: {
      ok?: boolean;
      url?: string;
      text?: string;
    }) {
      const mock = jest.fn().mockResolvedValue({
        ok: response.ok ?? true,
        url: response.url,
        text: async () => response.text ?? '',
      });
      global.fetch = mock as unknown as typeof fetch;
      return mock;
    }

    test('多码率主列表已声明 RESOLUTION 时仍下钻到真实分片', async () => {
      const master = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720',
        'low/index.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080',
        'high/index.m3u8',
      ].join('\n');
      const child = ['#EXTM3U', '#EXTINF:6,', 'seg0.ts'].join('\n');
      const mock = stubFetch({
        url: 'https://cdn.test/low/index.m3u8',
        text: child,
      });

      const result = await followManifestToSegment(
        master,
        'https://cdn.test/master.m3u8',
      );

      // 只测子列表文本会读不到足够字节，必须继续走到 .ts
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock.mock.calls[0][0]).toBe('https://cdn.test/low/index.m3u8');
      expect(result.segmentUrl).toBe('https://cdn.test/low/seg0.ts');
      // 分辨率取外层声明的最大档，不被子列表覆盖
      expect(result.declaredHeight).toBe(1080);
    });

    test('相对路径以重定向后的最终地址为基准', async () => {
      const master = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080',
        'v1/index.m3u8',
      ].join('\n');
      stubFetch({
        url: 'https://edge.test/moved/index.m3u8',
        text: ['#EXTM3U', '#EXTINF:6,', 'seg1.ts'].join('\n'),
      });

      const result = await followManifestToSegment(
        master,
        'https://cdn.test/a/master.m3u8',
      );

      expect(result.segmentUrl).toBe('https://edge.test/moved/seg1.ts');
      expect(result.declaredHeight).toBe(1080);
    });

    test('子列表读取失败时保留外层分片信息', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('network')) as unknown as typeof fetch;
      const master = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:RESOLUTION=1280x720',
        'low.m3u8',
      ].join('\n');

      const result = await followManifestToSegment(
        master,
        'https://cdn.test/master.m3u8',
      );

      expect(result.segmentUrl).toBe('https://cdn.test/low.m3u8');
      expect(result.declaredHeight).toBe(720);
    });
  });

  describe('measureSegmentLoadSpeed', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function toKbps(speed: string): number {
      const [value, unit] = speed.split(' ');
      return unit === 'MB/s'
        ? Number.parseFloat(value) * 1024
        : Number.parseFloat(value);
    }

    test('计时包含首字节延迟，快源不会被判成未知或算出虚高值', async () => {
      const chunk = new Uint8Array(128 * 1024);
      const reader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: chunk })
          .mockResolvedValueOnce({ done: true }),
        cancel: jest.fn().mockResolvedValue(undefined),
      };
      global.fetch = jest.fn(async () => {
        // 模拟 TTFB：请求发出到拿到响应头耗时 120ms
        await new Promise((resolve) => setTimeout(resolve, 120));
        return { ok: true, body: { getReader: () => reader } };
      }) as unknown as typeof fetch;

      const speed = await measureSegmentLoadSpeed('https://cdn.test/seg.ts');

      expect(speed).not.toBe('未知');
      // 128KB / 约 120ms ≈ 1.0 MB/s；旧实现从首块之后计时会得到虚高值或未知
      expect(toKbps(speed)).toBeGreaterThan(500);
      expect(toKbps(speed)).toBeLessThan(3 * 1024);
    });

    test('超时中断时按已测字节与耗时给出低速结论', async () => {
      const chunk = new Uint8Array(64 * 1024);
      const reader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: chunk })
          .mockImplementationOnce(
            () =>
              new Promise((_resolve, reject) => {
                setTimeout(() => reject(new Error('aborted')), 60);
              }),
          ),
        cancel: jest.fn().mockResolvedValue(undefined),
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      }) as unknown as typeof fetch;

      const speed = await measureSegmentLoadSpeed('https://cdn.test/slow.ts', {
        timeoutMs: 20,
      });

      // 慢源要有低速结论，而不是和没测过一样显示「未知」
      expect(speed).not.toBe('未知');
      expect(speed).toMatch(/(KB\/s|MB\/s)$/);
    });

    test('partialOnAbort: 中止时按已读字节结算低速', async () => {
      const chunk = new Uint8Array(64 * 1024);
      const reader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: chunk })
          .mockImplementationOnce(
            () =>
              new Promise((_resolve, reject) => {
                setTimeout(() => reject(new Error('aborted')), 60);
              }),
          ),
        cancel: jest.fn().mockResolvedValue(undefined),
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      }) as unknown as typeof fetch;

      const controller = new AbortController();
      const promise = measureSegmentLoadSpeed('https://cdn.test/slow.ts', {
        signal: controller.signal,
        partialOnAbort: true,
      });
      setTimeout(() => controller.abort(), 10);

      // 被放弃等待中止时，慢源仍应给出低速结论
      await expect(promise).resolves.toMatch(/(KB\/s|MB\/s)$/);
    });

    test('filterAds=true 时 followManifestToSegment 跳过前置广告分片', async () => {
      const media = [
        '#EXTM3U',
        '#EXT-X-DISCONTINUITY',
        '#EXT-X-CUE-OUT:DURATION=10',
        '#EXTINF:10,',
        'https://ads.test/ad0.ts',
        '#EXT-X-CUE-IN',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:10,',
        'https://cdn.test/main0.ts',
      ].join('\n');

      const res = await followManifestToSegment(
        media,
        'https://cdn.test/index.m3u8',
        { filterAds: true },
      );

      expect(res.segmentUrl).toBe('https://cdn.test/main0.ts');
    });

    test('measureSegmentLoadSpeedDetailed 对 403 分片标记 reachable=false，小分片且耗时充足时仍给出实测速度', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }) as unknown as typeof fetch;

      const blocked = await measureSegmentLoadSpeedDetailed(
        'https://cdn.test/403.ts',
      );
      expect(blocked.reachable).toBe(false);
      expect(blocked.status).toBe(403);
      expect(blocked.speed).toBe('未知');

      const smallChunk = new Uint8Array(24 * 1024);
      const reader = {
        read: jest
          .fn()
          .mockImplementationOnce(async () => {
            await new Promise((r) => setTimeout(r, 170));
            return { done: false, value: smallChunk };
          })
          .mockResolvedValueOnce({ done: true }),
        cancel: jest.fn().mockResolvedValue(undefined),
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
      }) as unknown as typeof fetch;

      const smallOk = await measureSegmentLoadSpeedDetailed(
        'https://cdn.test/tiny.ts',
      );
      expect(smallOk.reachable).toBe(true);
      expect(smallOk.speed).toMatch(/KB\/s$/);
    });

    test('外部取消返回未知，不编造速度', async () => {
      global.fetch = jest.fn(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      ) as unknown as typeof fetch;

      const controller = new AbortController();
      const promise = measureSegmentLoadSpeed('https://cdn.test/seg.ts', {
        signal: controller.signal,
      });
      controller.abort();

      await expect(promise).resolves.toBe('未知');
    });

    test('readLocalAdFilterSettings 正确读取本地去广告开关与自定义代码', () => {
      localStorage.removeItem('enable_blockad');
      localStorage.removeItem('custom_ad_filter_code_cache');
      expect(readLocalAdFilterSettings()).toEqual({
        enabled: true,
        customCode: '',
      });

      localStorage.setItem('enable_blockad', 'false');
      localStorage.setItem('custom_ad_filter_code_cache', 'return lines;');
      expect(readLocalAdFilterSettings()).toEqual({
        enabled: false,
        customCode: 'return lines;',
      });

      localStorage.removeItem('enable_blockad');
      localStorage.removeItem('custom_ad_filter_code_cache');
    });

    test('probePlayableMediaUrl 在原生 HLS 路径清单挂起时仍受总超时预算约束不会永久阻塞', async () => {
      const originalUserAgent = navigator.userAgent;
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value:
          'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      });
      const originalCreateElement = document.createElement.bind(document);
      let createdVideo: HTMLVideoElement | null = null;
      jest
        .spyOn(document, 'createElement')
        .mockImplementation((tagName: string) => {
          const el = originalCreateElement(tagName);
          if (tagName.toLowerCase() === 'video') {
            createdVideo = el as HTMLVideoElement;
            Object.defineProperty(createdVideo, 'canPlayType', {
              configurable: true,
              value: () => 'probably',
            });
            Object.defineProperty(createdVideo, 'videoHeight', {
              configurable: true,
              value: 1080,
            });
            Object.defineProperty(createdVideo, 'readyState', {
              configurable: true,
              value: 4,
            });
            createdVideo.play = jest.fn().mockResolvedValue(undefined);
            createdVideo.pause = jest.fn();
            createdVideo.load = jest.fn(() => {
              setTimeout(() => {
                createdVideo?.dispatchEvent(new Event('loadedmetadata'));
              }, 10);
            });
          }
          return el;
        });

      global.fetch = jest.fn(
        (_input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === 'HEAD') {
            return Promise.resolve({ ok: true, status: 200 });
          }
          // 模拟原生 HLS 结算后的独立测速清单请求挂起，直到收到 abort 才退出
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          });
        },
      ) as unknown as typeof fetch;

      try {
        const started = Date.now();
        const controller = new AbortController();
        const result = await probePlayableMediaUrl(
          'https://cdn.test/native/index.m3u8',
          {
            timeoutMs: 450,
            signal: controller.signal,
          },
        );
        const elapsed = Date.now() - started;

        expect(result.quality).toBe('1080p');
        expect(result.loadSpeed).toBe('未知');
        expect(elapsed).toBeLessThan(1500);
      } finally {
        Object.defineProperty(navigator, 'userAgent', {
          configurable: true,
          value: originalUserAgent,
        });
        jest.restoreAllMocks();
      }
    });

    test('classifyEpisodeProbeSpeed 将低速与未知速率与正常高速区分开', () => {
      expect(classifyEpisodeProbeSpeed('1.50 MB/s')).toBe('normal');
      expect(classifyEpisodeProbeSpeed('220.00 KB/s')).toBe('normal');
      expect(classifyEpisodeProbeSpeed('140.00 KB/s')).toBe('slow');
      expect(classifyEpisodeProbeSpeed('14.00 KB/s')).toBe('slow');
      expect(classifyEpisodeProbeSpeed('未知')).toBe('unknown');
      expect(classifyEpisodeProbeSpeed('未知', true)).toBe('slow');
    });

    test('measureSegmentLoadSpeedDetailed 在超时无字节时标记 timedOut=true', async () => {
      global.fetch = jest.fn(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      ) as unknown as typeof fetch;

      const res = await measureSegmentLoadSpeedDetailed(
        'https://cdn.test/stalled.ts',
        { timeoutMs: 30, partialOnAbort: true },
      );
      expect(res.timedOut).toBe(true);
      expect(res.reachable).toBe(false);
      expect(res.bytes).toBe(0);
      expect(res.speed).toBe('未知');
    });
  });
});
