import { act, renderHook } from '@testing-library/react';

import { useWatchingUpdatesRefresh } from './useWatchingUpdatesRefresh';

const mockCheckWatchingUpdates = jest.fn();
const mockScheduleIdleTask = jest.fn();
const mockSubscribeToWatchingUpdatesEvent = jest.fn();

jest.mock('@/lib/browser-scheduler', () => ({
  scheduleIdleTask: (
    callback: () => void,
    options?: { delayMs?: number; timeoutMs?: number },
  ) => mockScheduleIdleTask(callback, options),
}));

jest.mock('@/lib/watching-updates', () => ({
  checkWatchingUpdates: (forceRefresh?: boolean) =>
    mockCheckWatchingUpdates(forceRefresh),
  subscribeToWatchingUpdatesEvent: (handler: () => void) =>
    mockSubscribeToWatchingUpdatesEvent(handler),
}));

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

describe('useWatchingUpdatesRefresh', () => {
  beforeEach(() => {
    mockCheckWatchingUpdates.mockReset();
    mockScheduleIdleTask.mockReset();
    mockSubscribeToWatchingUpdatesEvent.mockReset();
    mockCheckWatchingUpdates.mockResolvedValue(undefined);
    mockScheduleIdleTask.mockReturnValue(jest.fn());
    mockSubscribeToWatchingUpdatesEvent.mockReturnValue(jest.fn());
    setDocumentHidden(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setDocumentHidden(false);
  });

  it('schedules a visible home-tab watching update check on idle', async () => {
    const cancelIdleTask = jest.fn();
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    mockScheduleIdleTask.mockReturnValue(cancelIdleTask);
    const { result } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates,
      }),
    );

    await act(async () => {
      await flushAsyncWork();
    });

    let cancelScheduledCheck: (() => void) | undefined;
    act(() => {
      cancelScheduledCheck = result.current.scheduleWatchingUpdatesCheck();
    });

    expect(cancelScheduledCheck).toBe(cancelIdleTask);
    expect(mockScheduleIdleTask).toHaveBeenCalledWith(expect.any(Function), {
      delayMs: 4000,
      timeoutMs: 5500,
    });

    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(mockCheckWatchingUpdates).toHaveBeenCalledWith(false);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);

    cancelScheduledCheck?.();
    expect(cancelIdleTask).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the snapshot twice when the check publishes an event', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates,
      }),
    );

    await act(async () => {
      await flushAsyncWork();
    });

    const eventHandler = mockSubscribeToWatchingUpdatesEvent.mock.calls[0][0];
    mockCheckWatchingUpdates.mockImplementationOnce(async () => {
      eventHandler();
    });

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('rechecks a pending invalidation when returning to the home tab', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useWatchingUpdatesRefresh({
          activeTab,
          refreshWatchingUpdates,
        }),
      {
        initialProps: {
          activeTab: 'favorites' as 'home' | 'favorites',
        },
      },
    );

    await act(async () => {
      await flushAsyncWork();
    });

    const eventHandler = mockSubscribeToWatchingUpdatesEvent.mock.calls[0][0];
    act(() => {
      eventHandler(false, 0, true);
    });
    expect(mockCheckWatchingUpdates).not.toHaveBeenCalled();

    mockCheckWatchingUpdates.mockImplementationOnce(async () => {
      eventHandler(false, 0, false);
    });
    rerender({ activeTab: 'home' });

    await act(async () => {
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(mockCheckWatchingUpdates).toHaveBeenCalledWith(true);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('clears the stale snapshot when an invalidation check publishes no result', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates,
      }),
    );

    await act(async () => {
      await flushAsyncWork();
    });

    const eventHandler = mockSubscribeToWatchingUpdatesEvent.mock.calls[0][0];
    await act(async () => {
      eventHandler(false, 0, true);
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledWith(true);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('queues an invalidation that arrives during an existing check', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    const firstCheck = createDeferred();
    const { result } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates,
      }),
    );

    await act(async () => {
      await flushAsyncWork();
    });

    const eventHandler = mockSubscribeToWatchingUpdatesEvent.mock.calls[0][0];
    mockCheckWatchingUpdates
      .mockReturnValueOnce(firstCheck.promise)
      .mockImplementationOnce(async () => {
        eventHandler(false, 0, false);
      });

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });
    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);

    act(() => {
      eventHandler(false, 0, true);
    });

    await act(async () => {
      firstCheck.resolve();
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(2);
    expect(mockCheckWatchingUpdates.mock.calls).toEqual([[false], [true]]);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('skips the scheduled check outside the visible home tab', async () => {
    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useWatchingUpdatesRefresh({
          activeTab,
          refreshWatchingUpdates: jest.fn(),
        }),
      {
        initialProps: {
          activeTab: 'favorites',
        },
      },
    );

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });

    let runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;
    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).not.toHaveBeenCalled();

    setDocumentHidden(true);
    rerender({ activeTab: 'home' });

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });

    runCheck = mockScheduleIdleTask.mock.calls[1][0] as () => void;
    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).not.toHaveBeenCalled();
  });

  it('replays a scheduled regular check after returning from favorites', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useWatchingUpdatesRefresh({
          activeTab,
          refreshWatchingUpdates,
        }),
      { initialProps: { activeTab: 'home' as 'home' | 'favorites' } },
    );

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    rerender({ activeTab: 'favorites' });
    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });
    expect(mockCheckWatchingUpdates).not.toHaveBeenCalled();

    rerender({ activeTab: 'home' });
    await act(async () => {
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(mockCheckWatchingUpdates).toHaveBeenCalledWith(false);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('merges a skipped regular check with a pending invalidation', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useWatchingUpdatesRefresh({
          activeTab,
          refreshWatchingUpdates,
        }),
      { initialProps: { activeTab: 'home' as 'home' | 'favorites' } },
    );

    await act(async () => {
      await flushAsyncWork();
    });
    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;
    const eventHandler = mockSubscribeToWatchingUpdatesEvent.mock.calls[0][0];

    rerender({ activeTab: 'favorites' });
    await act(async () => {
      runCheck();
      eventHandler(false, 0, true);
      await flushAsyncWork();
    });

    rerender({ activeTab: 'home' });
    await act(async () => {
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(mockCheckWatchingUpdates).toHaveBeenCalledWith(true);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('keeps a skipped regular check pending until the home tab is visible', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useWatchingUpdatesRefresh({
          activeTab,
          refreshWatchingUpdates,
        }),
      { initialProps: { activeTab: 'home' as 'home' | 'favorites' } },
    );

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    rerender({ activeTab: 'favorites' });
    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    setDocumentHidden(true);
    rerender({ activeTab: 'home' });
    await act(async () => {
      await flushAsyncWork();
    });
    expect(mockCheckWatchingUpdates).not.toHaveBeenCalled();

    setDocumentHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(mockCheckWatchingUpdates).toHaveBeenCalledWith(false);
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);
  });

  it('shares the regular check interval across idle and visibility triggers', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(20_000);
    const { result } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates: jest.fn(),
      }),
    );

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(mockCheckWatchingUpdates).toHaveBeenLastCalledWith(false);

    nowSpy.mockReturnValue(20_000 + 30 * 60 * 1000 - 1);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(20_000 + 30 * 60 * 1000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(2);
  });

  it('allows a regular retry when the previous check rejects', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(20_000);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCheckWatchingUpdates
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates: jest.fn(),
      }),
    );

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(2);
  });

  it('does not refresh or recheck after unmount', async () => {
    const refreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
    const firstCheck = createDeferred();
    mockCheckWatchingUpdates.mockReturnValueOnce(firstCheck.promise);
    const { result, unmount } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates,
      }),
    );

    await act(async () => {
      await flushAsyncWork();
    });

    const eventHandler = mockSubscribeToWatchingUpdatesEvent.mock.calls[0][0];
    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });
    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });
    act(() => {
      eventHandler(false, 0, true);
      unmount();
    });

    await act(async () => {
      firstCheck.resolve();
      await flushAsyncWork();
    });

    expect(mockCheckWatchingUpdates).toHaveBeenCalledTimes(1);
    expect(refreshWatchingUpdates).not.toHaveBeenCalled();
  });

  it('subscribes to watching update events on the home tab and cleans up', async () => {
    const refreshWatchingUpdates = jest.fn();
    const unsubscribe = jest.fn();
    mockSubscribeToWatchingUpdatesEvent.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates,
      }),
    );

    await act(async () => {
      await flushAsyncWork();
    });

    expect(mockSubscribeToWatchingUpdatesEvent).toHaveBeenCalledWith(
      expect.any(Function),
    );

    const eventHandler = mockSubscribeToWatchingUpdatesEvent.mock.calls[0][0];
    act(() => {
      eventHandler();
    });
    expect(refreshWatchingUpdates).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
