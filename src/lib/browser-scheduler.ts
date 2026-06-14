type IdleCallbackWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleIdleTask(
  callback: () => void,
  options: {
    delayMs?: number;
    timeoutMs?: number;
  } = {},
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const { delayMs = 0, timeoutMs } = options;
  const idleWindow = window as IdleCallbackWindow;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    timeoutId = setTimeout(callback, delayMs);
  };

  if (idleWindow.requestIdleCallback) {
    const idleId = idleWindow.requestIdleCallback(run, {
      timeout: timeoutMs ?? delayMs + 1500,
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      idleWindow.cancelIdleCallback?.(idleId);
    };
  }

  timeoutId = setTimeout(callback, delayMs);
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
