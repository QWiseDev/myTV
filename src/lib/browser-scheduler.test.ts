import { scheduleIdleTask } from './browser-scheduler';

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

describe('scheduleIdleTask', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Reflect.deleteProperty(window as IdleWindow, 'requestIdleCallback');
    Reflect.deleteProperty(window as IdleWindow, 'cancelIdleCallback');
  });

  it('uses requestIdleCallback when available', () => {
    const callback = jest.fn();
    const requestIdleCallback = jest.fn((idleCallback: IdleRequestCallback) => {
      idleCallback({ didTimeout: false, timeRemaining: () => 10 });
      return 42;
    });
    (window as IdleWindow).requestIdleCallback = requestIdleCallback;

    scheduleIdleTask(callback, { delayMs: 100, timeoutMs: 300 });

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 300,
    });
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('falls back to setTimeout without idle callback support', () => {
    const callback = jest.fn();

    scheduleIdleTask(callback, { delayMs: 100 });
    jest.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels pending idle and timeout work', () => {
    const callback = jest.fn();
    const cancelIdleCallback = jest.fn();
    const requestIdleCallback = jest.fn((idleCallback: IdleRequestCallback) => {
      idleCallback({ didTimeout: false, timeRemaining: () => 10 });
      return 7;
    });
    (window as IdleWindow).requestIdleCallback = requestIdleCallback;
    (window as IdleWindow).cancelIdleCallback = cancelIdleCallback;

    const cancel = scheduleIdleTask(callback, { delayMs: 100 });
    cancel();
    jest.advanceTimersByTime(100);

    expect(callback).not.toHaveBeenCalled();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });
});
