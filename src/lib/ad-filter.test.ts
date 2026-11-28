import {
  type AdFilterWorkerLike,
  DEFAULT_CUSTOM_AD_FILTER_CODE,
  disposeCustomAdFilterWorker,
  filterAdsFromM3U8,
  filterAdsFromM3U8Async,
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

  test('sandboxes custom ad filter execution away from host globals and eval', () => {
    const manifest = ['#EXTM3U', '#EXTINF:10,', 'main-1.ts'].join('\n');
    const onCustomError = jest.fn();

    const processAccessResult = filterAdsFromM3U8(manifest, {
      customCode: `
function filterAdsFromM3U8(type, m3u8Content) {
  return String(typeof process) + ':' + JSON.stringify(process.env || {});
}`,
      onCustomError,
    });
    expect(processAccessResult).toBe(manifest);
    expect(onCustomError).toHaveBeenCalled();

    onCustomError.mockClear();
    const fnConstructorEscape = filterAdsFromM3U8(manifest, {
      customCode: `
function filterAdsFromM3U8(type, m3u8Content) {
  return (type.constructor.constructor('return typeof process'))();
}`,
      onCustomError,
    });
    expect(fnConstructorEscape).toBe(manifest);
    expect(onCustomError).toHaveBeenCalled();
  });

  afterEach(() => {
    disposeCustomAdFilterWorker();
  });

  test('filterAdsFromM3U8Async executes custom code inside isolated worker and terminates hung workers on timeout', async () => {
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

    // 1. 正常 Worker 执行成功路径
    const okTerminate = jest.fn();
    const okResult = await filterAdsFromM3U8Async(manifest, {
      type: 'iqiyi',
      customCode:
        'function filterAdsFromM3U8(type: string, m3u8Content: string): string { return "#EXTM3U\\ncustom.ts"; }',
      createWorker: () => {
        const worker: AdFilterWorkerLike = {
          onmessage: null,
          onerror: null,
          postMessage(msg) {
            const payload = msg as { id: number; jsCode: string };
            expect(payload.jsCode).not.toContain(': string');
            setTimeout(() => {
              worker.onmessage?.({
                data: {
                  id: payload.id,
                  ok: true,
                  result: '#EXTM3U\ncustom.ts',
                },
              });
            }, 5);
          },
          terminate: okTerminate,
        };
        return worker;
      },
    });
    expect(okResult).toBe('#EXTM3U\ncustom.ts');
    expect(okTerminate).toHaveBeenCalledTimes(1);

    // 2. 死循环脚本超时熔断：立即 terminate Worker 并回退默认安全去广告规则
    const hungTerminate = jest.fn();
    const onCustomError = jest.fn();
    const fallbackResult = await filterAdsFromM3U8Async(manifest, {
      type: 'iqiyi',
      customCode: 'function filterAdsFromM3U8() { while (true) {} }',
      timeoutMs: 25,
      onCustomError,
      createWorker: () => ({
        onmessage: null,
        onerror: null,
        postMessage: () => {
          /* 模拟 Worker 主循环卡死无响应 */
        },
        terminate: hungTerminate,
      }),
    });

    expect(hungTerminate).toHaveBeenCalledTimes(1);
    expect(onCustomError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('超时'),
      }),
    );
    expect(fallbackResult).toBe(
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
});
