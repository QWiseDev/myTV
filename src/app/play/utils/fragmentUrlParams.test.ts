import {
  appendSourceFragmentParam,
  FRAGMENT_URL_SUFFIX_BY_SOURCE,
} from './fragmentUrlParams';
import { createAdFilterHlsLoader } from './hlsAdFilterLoader';

describe('appendSourceFragmentParam', () => {
  it('为爱奇艺源分片追加 domianurl 参数', () => {
    expect(
      appendSourceFragmentParam(
        'iqiyizyapi.com',
        'https://cdn.example.com/a.ts',
      ),
    ).toBe('https://cdn.example.com/a.ts?domianurl=klm-ai.com');
  });

  it('已有 query 时用 & 合并', () => {
    expect(
      appendSourceFragmentParam(
        'iqiyizyapi.com',
        'https://cdn.example.com/a.ts?token=abc',
      ),
    ).toBe('https://cdn.example.com/a.ts?token=abc&domianurl=klm-ai.com');
  });

  it('其他源与无源时原样返回', () => {
    expect(
      appendSourceFragmentParam('other-source', 'https://cdn.example.com/a.ts'),
    ).toBe('https://cdn.example.com/a.ts');
    expect(
      appendSourceFragmentParam(undefined, 'https://cdn.example.com/a.ts'),
    ).toBe('https://cdn.example.com/a.ts');
    expect(appendSourceFragmentParam('iqiyizyapi.com', '')).toBe('');
  });

  it('配置表里登记的是 klm-ai.com 防盗链参数', () => {
    expect(FRAGMENT_URL_SUFFIX_BY_SOURCE['iqiyizyapi.com']).toBe(
      'domianurl=klm-ai.com',
    );
  });
});

describe('hlsAdFilterLoader 分片防盗链参数', () => {
  it('fragment 请求按源改写 URL，manifest 不改写', () => {
    const loadContexts: Array<{ type?: string; url?: string }> = [];
    const FakeBaseLoader = class {
      load(context: { type?: string; url?: string }) {
        loadContexts.push({ ...context });
      }
    };
    const HlsCtor = { DefaultConfig: { loader: FakeBaseLoader } };

    const Loader = createAdFilterHlsLoader(
      HlsCtor as unknown as Parameters<typeof createAdFilterHlsLoader>[0],
      {
        blockAdEnabledRef: { current: true },
        customAdFilterCodeRef: { current: '' },
        source: 'iqiyizyapi.com',
      },
    );

    const loader = new Loader({});
    loader.load(
      { type: 'media-fragment', url: 'https://cdn.example.com/a.ts' },
      undefined,
      {},
    );
    loader.load(
      { type: 'media-fragment', url: 'https://cdn.example.com/b.ts?token=abc' },
      undefined,
      {},
    );
    loader.load(
      { type: 'manifest', url: 'https://cdn.example.com/index.m3u8' },
      undefined,
      {},
    );

    expect(loadContexts).toEqual([
      {
        type: 'media-fragment',
        url: 'https://cdn.example.com/a.ts?domianurl=klm-ai.com',
      },
      {
        type: 'media-fragment',
        url: 'https://cdn.example.com/b.ts?token=abc&domianurl=klm-ai.com',
      },
      { type: 'manifest', url: 'https://cdn.example.com/index.m3u8' },
    ]);
  });

  it('非爱奇艺源的 fragment 不追加参数', () => {
    const loadContexts: Array<{ type?: string; url?: string }> = [];
    const FakeBaseLoader = class {
      load(context: { type?: string; url?: string }) {
        loadContexts.push({ ...context });
      }
    };
    const HlsCtor = { DefaultConfig: { loader: FakeBaseLoader } };

    const Loader = createAdFilterHlsLoader(
      HlsCtor as unknown as Parameters<typeof createAdFilterHlsLoader>[0],
      {
        blockAdEnabledRef: { current: false },
        customAdFilterCodeRef: { current: '' },
        source: 'other-source',
      },
    );

    const loader = new Loader({});
    loader.load(
      { type: 'media-fragment', url: 'https://cdn.example.com/a.ts' },
      undefined,
      {},
    );

    expect(loadContexts[0].url).toBe('https://cdn.example.com/a.ts');
  });
});
