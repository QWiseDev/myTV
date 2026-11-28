import type { MutableRefObject } from 'react';

import type { PrefetchClaim } from './fragmentPrefetcher';
import { createAdFilterHlsLoader } from './hlsAdFilterLoader';

class FakeBaseLoader {
  public stats = {
    aborted: false,
    loaded: 0,
    total: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
  };
  public context: unknown = null;
  public config: unknown = null;
  public callbacks: {
    onSuccess?: (...args: unknown[]) => void;
    onAbort?: (...args: unknown[]) => void;
    onTimeout?: (...args: unknown[]) => void;
  } | null = null;
  public nativeLoadCalls: Array<{
    context: { type?: string; url?: string };
    callbacks: unknown;
  }> = [];
  public aborted = false;

  load(
    context: { type?: string; url?: string },
    config: unknown,
    callbacks: { onSuccess?: (...args: unknown[]) => void },
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.nativeLoadCalls.push({ context, callbacks });
  }

  abort() {
    this.aborted = true;
    this.callbacks?.onAbort?.(this.stats, this.context, null);
  }

  destroy() {
    this.callbacks = null;
    this.context = null;
  }
}

function createFakeHlsConstructor() {
  return {
    DefaultConfig: {
      loader: FakeBaseLoader,
    },
  } as unknown as typeof import('hls.js').default;
}

describe('createAdFilterHlsLoader prefetch integration', () => {
  const blockAdEnabledRef = { current: false } as MutableRefObject<boolean>;
  const customAdFilterCodeRef = { current: '' } as MutableRefObject<string>;

  it('delivers prefetched fragment directly, strips MPEG-TS prefix, and reports real timing stats', async () => {
    // 4 字节伪装头前缀 + 3 个 188 字节 MPEG-TS 包（每包以 0x47 开头）
    const prefixLen = 4;
    const tsPayloadLen = 188 * 3;
    const rawBytes = new Uint8Array(prefixLen + tsPayloadLen);
    rawBytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    rawBytes[prefixLen] = 0x47;
    rawBytes[prefixLen + 1] = 0x11;
    rawBytes[prefixLen + 188] = 0x47;
    rawBytes[prefixLen + 188 * 2] = 0x47;
    const claim: PrefetchClaim = {
      promise: Promise.resolve({
        url: 'https://cdn.example.com/seg-1.ts',
        data: rawBytes.buffer,
        bytes: rawBytes.byteLength,
        startedAt: 100,
        firstByteAt: 300,
        endAt: 900,
      }),
      cancel: jest.fn(),
    };
    const claimMock = jest.fn(() => claim);

    const LoaderClass = createAdFilterHlsLoader(createFakeHlsConstructor(), {
      blockAdEnabledRef,
      customAdFilterCodeRef,
      source: 'test_source',
      fragmentPrefetcher: { claim: claimMock },
    });

    const loader = new LoaderClass({} as never) as unknown as FakeBaseLoader;
    const onSuccess = jest.fn();

    loader.load(
      { type: 'media-fragment', url: 'https://cdn.example.com/seg-1.ts' },
      { timeout: 10_000 },
      { onSuccess },
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(claimMock).toHaveBeenCalledWith('https://cdn.example.com/seg-1.ts');
    expect(loader.nativeLoadCalls).toHaveLength(0);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    const [response, stats] = onSuccess.mock.calls[0];
    const delivered = new Uint8Array(response.data);
    expect(delivered.byteLength).toBe(tsPayloadLen);
    expect(delivered[0]).toBe(0x47);
    expect(delivered[1]).toBe(0x11);
    expect(stats.loading).toEqual({ start: 100, first: 300, end: 900 });
    expect(stats.loaded).toBe(rawBytes.byteLength);
  });

  it('falls back to native loader when prefetched fragment rejects', async () => {
    const claim: PrefetchClaim = {
      promise: Promise.reject(new Error('network error')),
      cancel: jest.fn(),
    };

    const LoaderClass = createAdFilterHlsLoader(createFakeHlsConstructor(), {
      blockAdEnabledRef,
      customAdFilterCodeRef,
      source: 'test_source',
      fragmentPrefetcher: { claim: () => claim },
    });

    const loader = new LoaderClass({} as never) as unknown as FakeBaseLoader;
    const onSuccess = jest.fn();

    loader.load(
      { type: 'media-fragment', url: 'https://cdn.example.com/seg-2.ts' },
      { timeout: 10_000 },
      { onSuccess },
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(loader.nativeLoadCalls).toHaveLength(1);
    expect(loader.nativeLoadCalls[0].context.url).toBe(
      'https://cdn.example.com/seg-2.ts',
    );
  });

  it('cancels in-flight prefetch claim on abort and does not deliver stale payload', async () => {
    let resolveClaim!: (value: {
      url: string;
      data: ArrayBuffer;
      bytes: number;
      startedAt: number;
      firstByteAt: number;
      endAt: number;
    }) => void;
    const cancel = jest.fn();
    const claim: PrefetchClaim = {
      promise: new Promise((resolve) => {
        resolveClaim = resolve;
      }),
      cancel,
    };

    const LoaderClass = createAdFilterHlsLoader(createFakeHlsConstructor(), {
      blockAdEnabledRef,
      customAdFilterCodeRef,
      source: 'test_source',
      fragmentPrefetcher: { claim: () => claim },
    });

    const loader = new LoaderClass({} as never) as unknown as FakeBaseLoader;
    const onSuccess = jest.fn();
    const onAbort = jest.fn();

    loader.load(
      { type: 'media-fragment', url: 'https://cdn.example.com/seg-3.ts' },
      { timeout: 10_000 },
      { onSuccess, onAbort } as never,
    );

    loader.abort();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledTimes(1);

    resolveClaim({
      url: 'https://cdn.example.com/seg-3.ts',
      data: new Uint8Array([0x47]).buffer,
      bytes: 1,
      startedAt: 10,
      firstByteAt: 20,
      endAt: 30,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
