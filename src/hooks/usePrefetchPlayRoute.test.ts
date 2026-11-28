import { renderHook } from '@testing-library/react';

import {
  resetPrefetchPlayRouteForTests,
  usePrefetchPlayRoute,
} from './usePrefetchPlayRoute';

const mockPrefetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch: mockPrefetch,
  }),
}));

describe('usePrefetchPlayRoute', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPrefetch.mockReset();
    resetPrefetchPlayRouteForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    Reflect.deleteProperty(navigator, 'connection');
  });

  test('prefetches /play once after idle delay and does not repeat on remount', () => {
    const first = renderHook(() => usePrefetchPlayRoute());
    expect(mockPrefetch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(800);
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledWith('/play');

    first.unmount();

    renderHook(() => usePrefetchPlayRoute());
    jest.advanceTimersByTime(2000);
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
  });

  test('cancels pending prefetch when unmounted before idle fires', () => {
    const { unmount } = renderHook(() => usePrefetchPlayRoute());
    unmount();

    jest.advanceTimersByTime(2000);
    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  test('skips prefetch when browser saveData is enabled', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });

    renderHook(() => usePrefetchPlayRoute());
    jest.advanceTimersByTime(2000);
    expect(mockPrefetch).not.toHaveBeenCalled();
  });
});
