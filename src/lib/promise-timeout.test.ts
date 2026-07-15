import { withAbortableTimeout, withTimeout } from './promise-timeout';

describe('withAbortableTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts the task signal when the timeout expires', async () => {
    jest.useFakeTimers();
    let taskSignal: AbortSignal | undefined;
    const result = withAbortableTimeout((signal) => {
      taskSignal = signal;
      return new Promise<string>(() => undefined);
    }, 100);
    const rejection = expect(result).rejects.toMatchObject({
      name: 'TimeoutError',
    });

    await Promise.resolve();
    jest.advanceTimersByTime(100);

    expect(taskSignal?.aborted).toBe(true);
    await rejection;
  });

  it('forwards parent cancellation to the task signal', async () => {
    const parentController = new AbortController();
    const abortReason = new Error('parent aborted');
    let taskSignal: AbortSignal | undefined;
    const result = withAbortableTimeout(
      (signal) => {
        taskSignal = signal;
        return new Promise<string>(() => undefined);
      },
      100,
      parentController.signal,
    );
    const rejection = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });

    await Promise.resolve();
    parentController.abort(abortReason);

    expect(taskSignal?.aborted).toBe(true);
    await rejection;
  });

  it('does not start a task when the parent is already aborted', async () => {
    const parentController = new AbortController();
    const task = jest.fn<Promise<string>, [AbortSignal]>();
    parentController.abort();

    await expect(
      withAbortableTimeout(task, 100, parentController.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(task).not.toHaveBeenCalled();
  });
});

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
