export {};

describe('getPlayRecordsPage', () => {
  const originalFetch = global.fetch;
  const originalRuntimeConfig = (
    window as typeof window & {
      RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
    }
  ).RUNTIME_CONFIG;

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = originalRuntimeConfig;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('rethrows remote pagination failures after emitting the global error', async () => {
    const requestError = new Error('play records unavailable');
    const globalErrorListener = jest.fn();
    global.fetch = jest.fn().mockRejectedValue(requestError);
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'redis' };
    window.addEventListener('globalError', globalErrorListener, { once: true });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { getPlayRecordsPage } = await import('./db.client');

    await expect(getPlayRecordsPage({ pageSize: 12 })).rejects.toBe(
      requestError,
    );
    expect(globalErrorListener).toHaveBeenCalledTimes(1);
  });

  it('rethrows invalid local pagination data after emitting the global error', async () => {
    const globalErrorListener = jest.fn();
    (
      window as typeof window & {
        RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
      }
    ).RUNTIME_CONFIG = { STORAGE_TYPE: 'localstorage' };
    localStorage.setItem('moontv_play_records', '{invalid-json');
    window.addEventListener('globalError', globalErrorListener, { once: true });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { getPlayRecordsPage } = await import('./db.client');

    await expect(getPlayRecordsPage({ pageSize: 12 })).rejects.toBeInstanceOf(
      SyntaxError,
    );
    expect(globalErrorListener).toHaveBeenCalledTimes(1);
  });
});
