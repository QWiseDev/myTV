import { withTimeout } from './promise-timeout';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes through a fulfilled result', async () => {
    await expect(
      withTimeout(Promise.resolve('result'), 100, 'fallback'),
    ).resolves.toBe('result');
  });

  it('normalizes a rejection to the configured fallback', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('failed')), 100, 'fallback'),
    ).resolves.toBe('fallback');
  });

  it('returns the fallback on timeout and ignores a late result', async () => {
    jest.useFakeTimers();
    let resolveSource!: (value: string) => void;
    const source = new Promise<string>((resolve) => {
      resolveSource = resolve;
    });
    const result = withTimeout(source, 100, 'fallback');

    jest.advanceTimersByTime(100);
    await expect(result).resolves.toBe('fallback');

    resolveSource('late-result');
    await Promise.resolve();
    await expect(result).resolves.toBe('fallback');
  });

  it('resolves undefined when no fallback is configured', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('failed')), 100),
    ).resolves.toBeUndefined();
  });
});
