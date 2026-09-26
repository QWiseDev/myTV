import { withAbortableTimeout } from './promise-timeout';

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
