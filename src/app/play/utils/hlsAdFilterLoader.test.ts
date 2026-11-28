import type { MutableRefObject } from 'react';

import {
  clearEpisodePrefetchCache,
  prefetchNextEpisodeMedia,
} from './episodePrefetch';
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
    onProgress?: (...args: unknown[]) => void;
  } | null = null;
  public nativeLoadCalls: Array<{
    context: { type?: string; url?: string; frag?: { sn?: number } };
    callbacks: {
      onSuccess?: (...args: unknown[]) => void;
      onAbort?: (...args: unknown[]) => void;
      onTimeout?: (...args: unknown[]) => void;
      onProgress?: (...args: unknown[]) => void;
    };
  }> = [];
  public aborted = false;

  load(
    context: { type?: string; url?: string; frag?: { sn?: number } },
    config: unknown,
    callbacks: {
      onSuccess?: (...args: unknown[]) => void;
      onAbort?: (...args: unknown[]) => void;
      onTimeout?: (...args: unknown[]) => void;
      onProgress?: (...args: unknown[]) => void;
    },
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

  it('races a hedged request when urgent media-fragment stalls, strips prefix, and suppresses native onAbort', async () => {
    jest.useFakeTimers();
    const rawBytes = new Uint8Array(4 + 188 * 3);
    rawBytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    rawBytes[4] = 0x47;
    rawBytes[4 + 188] = 0x47;
    rawBytes[4 + 188 * 2] = 0x47;

    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => rawBytes.buffer,
    })) as unknown as typeof fetch;

    const LoaderClass = createAdFilterHlsLoader(createFakeHlsConstructor(), {
      blockAdEnabledRef,
      customAdFilterCodeRef,
      source: 'test_source',
      fetchImpl,
      hedgeDelayMs: 2_000,
      noProgressTimeoutMs: 8_000,
    });

    const loader = new LoaderClass({} as never) as unknown as FakeBaseLoader;
    const onSuccess = jest.fn();
    const onAbort = jest.fn();

    loader.load(
      {
        type: 'media-fragment',
        url: 'https://cdn.example.com/slow-seg.ts',
        frag: { sn: 0 },
      },
      { timeout: 30_000 },
      { onSuccess, onAbort } as never,
    );

    expect(loader.nativeLoadCalls).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled();

    // 2s 无进展后发起对冲请求并立即胜出
    jest.advanceTimersByTime(2_050);
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(loader.aborted).toBe(true);
    expect(onAbort).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    const [response] = onSuccess.mock.calls[0];
    expect(new Uint8Array(response.data).byteLength).toBe(188 * 3);
    expect(new Uint8Array(response.data)[0]).toBe(0x47);

    loader.destroy();
    jest.useRealTimers();
  });

  it('triggers onTimeout via no-progress watchdog when native fragment hangs', async () => {
    jest.useFakeTimers();
    const LoaderClass = createAdFilterHlsLoader(createFakeHlsConstructor(), {
      blockAdEnabledRef,
      customAdFilterCodeRef,
      source: 'test_source',
      hedgeDelayMs: 0,
      noProgressTimeoutMs: 3_000,
    });

    const loader = new LoaderClass({} as never) as unknown as FakeBaseLoader;
    const onTimeout = jest.fn();
    const onAbort = jest.fn();

    loader.load(
      { type: 'media-fragment', url: 'https://cdn.example.com/hung.ts' },
      { timeout: 60_000 },
      { onTimeout, onAbort } as never,
    );

    jest.advanceTimersByTime(3_050);
    await Promise.resolve();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(loader.aborted).toBe(true);
    expect(onAbort).not.toHaveBeenCalled();

    loader.destroy();
    jest.useRealTimers();
  });

  it('notifies fragmentPrefetcher on first urgent progress byte once', () => {
    const notifyUrgentProgress = jest.fn();
    const LoaderClass = createAdFilterHlsLoader(createFakeHlsConstructor(), {
      blockAdEnabledRef,
      customAdFilterCodeRef,
      source: 'test_source',
      fragmentPrefetcher: {
        claim: () => null,
        notifyUrgentProgress,
      },
      hedgeDelayMs: 0,
      noProgressTimeoutMs: 0,
    });

    const loader = new LoaderClass({} as never) as unknown as FakeBaseLoader;
    loader.load(
      {
        type: 'media-fragment',
        url: 'https://cdn.example.com/seg-0.ts',
        frag: { sn: 0 },
      },
      { timeout: 30_000 },
      {} as never,
    );

    const wrappedOnProgress = loader.nativeLoadCalls[0].callbacks.onProgress;
    wrappedOnProgress?.({ loaded: 1024 }, loader.context, null, null);
    wrappedOnProgress?.({ loaded: 2048 }, loader.context, null, null);

    expect(notifyUrgentProgress).toHaveBeenCalledTimes(1);
    expect(notifyUrgentProgress).toHaveBeenCalledWith(0);

    loader.destroy();
  });

  it('serves prefetched next-episode manifest and segment directly from memory cache', async () => {
    const originalFetch = global.fetch;
    clearEpisodePrefetchCache();
    const tsPayload = new Uint8Array(188 * 2);
    tsPayload[0] = 0x47;
    tsPayload[188] = 0x47;

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        url: 'https://cdn.example.com/ep2/index.m3u8',
        text: async () => '#EXTM3U\n#EXTINF:5,\nseg-0.ts\n',
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => tsPayload.buffer,
      }) as unknown as typeof fetch;

    try {
      await expect(
        prefetchNextEpisodeMedia('https://cdn.example.com/ep2/index.m3u8', {
          sourceKey: 'test_source',
        }),
      ).resolves.toBe(true);

      const LoaderClass = createAdFilterHlsLoader(createFakeHlsConstructor(), {
        blockAdEnabledRef,
        customAdFilterCodeRef,
        source: 'test_source',
        hedgeDelayMs: 0,
        noProgressTimeoutMs: 0,
      });

      const manifestLoader = new LoaderClass(
        {} as never,
      ) as unknown as FakeBaseLoader;
      const onManifestSuccess = jest.fn();
      manifestLoader.load(
        { type: 'manifest', url: 'https://cdn.example.com/ep2/index.m3u8' },
        { timeout: 10_000 },
        { onSuccess: onManifestSuccess },
      );
      await Promise.resolve();
      expect(manifestLoader.nativeLoadCalls).toHaveLength(0);
      expect(onManifestSuccess).toHaveBeenCalledTimes(1);
      expect(onManifestSuccess.mock.calls[0][0].data).toContain('seg-0.ts');

      const fragLoader = new LoaderClass(
        {} as never,
      ) as unknown as FakeBaseLoader;
      const onFragSuccess = jest.fn();
      fragLoader.load(
        { type: 'media-fragment', url: 'https://cdn.example.com/ep2/seg-0.ts' },
        { timeout: 10_000 },
        { onSuccess: onFragSuccess },
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(fragLoader.nativeLoadCalls).toHaveLength(0);
      expect(onFragSuccess).toHaveBeenCalledTimes(1);
      expect(
        new Uint8Array(onFragSuccess.mock.calls[0][0].data).byteLength,
      ).toBe(188 * 2);
    } finally {
      clearEpisodePrefetchCache();
      global.fetch = originalFetch;
    }
  });
});
