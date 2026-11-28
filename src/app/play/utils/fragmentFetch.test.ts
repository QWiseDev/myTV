import {
  fetchFragmentWithStallWatchdog,
  FragmentStallError,
  isFragmentStallError,
} from './fragmentFetch';

async function flushMicrotasks(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

describe('fetchFragmentWithStallWatchdog', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('streams chunks, merges into ArrayBuffer, and resets stall timer on each chunk', async () => {
    jest.useFakeTimers();
    let clock = 100;
    const chunk1 = new Uint8Array([0x47, 0x01, 0x02]);
    const chunk2 = new Uint8Array([0x47, 0x03, 0x04]);

    let readCall = 0;
    const reader = {
      read: jest.fn(async () => {
        readCall += 1;
        if (readCall === 1) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          clock += 600;
          return { done: false, value: chunk1 };
        }
        if (readCall === 2) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          clock += 600;
          return { done: false, value: chunk2 };
        }
        return { done: true, value: undefined };
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    const fetchImpl = jest.fn(async () => {
      clock += 200;
      return {
        ok: true,
        status: 200,
        body: { getReader: () => reader },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const onFirstByte = jest.fn();
    const onProgress = jest.fn();

    const promise = fetchFragmentWithStallWatchdog(
      'https://cdn.example/seg.ts',
      {
        fetchImpl,
        noProgressTimeoutMs: 1_000,
        maxLoadTimeMs: 10_000,
        perfNow: () => clock,
        onFirstByte,
        onProgress,
      },
    );

    // 总耗时 1200ms > 单次 noProgressTimeoutMs(1000ms)，但每 600ms 有进展，不应误判假死
    await flushMicrotasks();
    jest.advanceTimersByTime(650);
    await flushMicrotasks();
    jest.advanceTimersByTime(650);
    await flushMicrotasks();
    const result = await promise;

    expect(result.bytes).toBe(6);
    expect(Array.from(new Uint8Array(result.data))).toEqual([
      0x47, 0x01, 0x02, 0x47, 0x03, 0x04,
    ]);
    expect(onFirstByte).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(6, expect.any(Number));
  });

  it('aborts and throws FragmentStallError when stream hangs with no new bytes', async () => {
    jest.useFakeTimers();
    let aborted = false;
    const cancel = jest.fn().mockResolvedValue(undefined);
    let rejectPendingRead!: (err: Error) => void;
    let readCall = 0;

    const reader = {
      read: jest.fn(() => {
        readCall += 1;
        if (readCall === 1) {
          return Promise.resolve({
            done: false,
            value: new Uint8Array([0x47, 0x10]),
          });
        }
        return new Promise<ReadableStreamReadResult<Uint8Array>>(
          (_resolve, reject) => {
            rejectPendingRead = reject;
          },
        );
      }),
      cancel,
    };

    const fetchImpl = jest.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          rejectPendingRead?.(new Error('aborted'));
        });
        return {
          ok: true,
          status: 200,
          body: { getReader: () => reader },
        } as unknown as Response;
      },
    ) as unknown as typeof fetch;

    const promise = fetchFragmentWithStallWatchdog(
      'https://cdn.example/stuck.ts',
      {
        fetchImpl,
        noProgressTimeoutMs: 1_000,
        maxLoadTimeMs: 30_000,
      },
    );
    const assertion = expect(promise).rejects.toThrow(FragmentStallError);

    await flushMicrotasks();
    jest.advanceTimersByTime(1_050);
    await flushMicrotasks();
    await assertion;
    expect(aborted).toBe(true);
    expect(cancel).toHaveBeenCalled();

    try {
      await promise;
    } catch (err) {
      expect(isFragmentStallError(err)).toBe(true);
      expect((err as FragmentStallError).loadedBytes).toBe(2);
    }
  });

  it('falls back to response.arrayBuffer() when body reader is unavailable', async () => {
    const payload = new Uint8Array([0x47, 0xaa, 0xbb]).buffer;
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => payload,
    })) as unknown as typeof fetch;

    const result = await fetchFragmentWithStallWatchdog(
      'https://cdn.example/fallback.ts',
      { fetchImpl },
    );

    expect(result.bytes).toBe(3);
    expect(new Uint8Array(result.data)[1]).toBe(0xaa);
  });
});
