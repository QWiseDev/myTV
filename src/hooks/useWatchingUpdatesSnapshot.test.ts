import { act, renderHook } from '@testing-library/react';

import { useWatchingUpdatesSnapshot } from './useWatchingUpdatesSnapshot';
import type { WatchingUpdate } from '@/lib/watching-updates';

jest.mock('@/lib/watching-updates', () => ({
  getDetailedWatchingUpdates: jest.fn(),
}));

const { getDetailedWatchingUpdates } = jest.requireMock(
  '@/lib/watching-updates',
) as {
  getDetailedWatchingUpdates: jest.Mock;
};

function createWatchingUpdate(): WatchingUpdate {
  return {
    continueWatchingCount: 0,
    hasUpdates: true,
    timestamp: 1,
    updatedCount: 1,
    updatedSeries: [],
  };
}

describe('useWatchingUpdatesSnapshot', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    getDetailedWatchingUpdates.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('refreshes the watching updates snapshot from cache', async () => {
    const updates = createWatchingUpdate();
    getDetailedWatchingUpdates.mockReturnValue(updates);

    const { result } = renderHook(() => useWatchingUpdatesSnapshot());

    await act(async () => {
      await result.current.refreshWatchingUpdates();
    });

    expect(getDetailedWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(result.current.watchingUpdates).toBe(updates);
    expect(result.current.loadingWatchingUpdates).toBe(false);
  });

  it('sets null when cached watching updates cannot be read', async () => {
    getDetailedWatchingUpdates.mockImplementation(() => {
      throw new Error('cache failed');
    });

    const { result } = renderHook(() => useWatchingUpdatesSnapshot());

    await act(async () => {
      await result.current.refreshWatchingUpdates();
    });

    expect(result.current.watchingUpdates).toBeNull();
    expect(result.current.loadingWatchingUpdates).toBe(false);
  });
});
