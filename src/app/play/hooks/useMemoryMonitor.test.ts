import { act, renderHook } from '@testing-library/react';

import { useMemoryMonitor } from './useMemoryMonitor';

describe('useMemoryMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(window, 'gc');
    Reflect.deleteProperty(window, 'timer1');
    Reflect.deleteProperty(window, 'caches');
  });

  test('cleanup does not delete storage caches or scan window timer slots', () => {
    const gc = jest.fn();
    const caches = {
      keys: jest.fn().mockResolvedValue(['pwa-cache']),
      delete: jest.fn(),
    };

    Object.defineProperty(window, 'gc', {
      configurable: true,
      value: gc,
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: caches,
    });
    Object.defineProperty(window, 'timer1', {
      configurable: true,
      writable: true,
      value: 123,
    });

    const { result } = renderHook(() => useMemoryMonitor());

    act(() => {
      result.current.triggerCleanup();
    });

    expect(gc).toHaveBeenCalledTimes(1);
    expect(caches.keys).not.toHaveBeenCalled();
    expect(caches.delete).not.toHaveBeenCalled();
    expect((window as unknown as Record<string, unknown>).timer1).toBe(123);
  });
});
