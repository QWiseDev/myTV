import { act, renderHook } from '@testing-library/react';

import { useAiRecommendStatus } from './useAiRecommendStatus';

describe('useAiRecommendStatus', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    localStorage.clear();
  });

  it('keeps AI recommendations disabled for unauthorized users', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAiRecommendStatus());

    expect(result.current).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith('/api/ai-recommend/status');
    expect(
      JSON.parse(localStorage.getItem('home_ai_status_cache_v1') || '{}'),
    ).toEqual(expect.objectContaining({ enabled: false }));
  });

  it('uses cached status without calling the status endpoint', () => {
    localStorage.setItem(
      'home_ai_status_cache_v1',
      JSON.stringify({
        enabled: true,
        timestamp: Date.now(),
      }),
    );
    global.fetch = jest.fn();

    const { result } = renderHook(() => useAiRecommendStatus());

    expect(result.current).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
