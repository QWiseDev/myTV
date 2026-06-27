import { act, renderHook } from '@testing-library/react';

import { useWatchingUpdatesRefresh } from './useWatchingUpdatesRefresh';

const mockFetchWatchingUpdatesFromServer = jest.fn();
const mockScheduleIdleTask = jest.fn();
const mockSubscribeToWatchingUpdatesEvent = jest.fn();

jest.mock('@/lib/browser-scheduler', () => ({
  scheduleIdleTask: (
    callback: () => void,
    options?: { delayMs?: number; timeoutMs?: number },
  ) => mockScheduleIdleTask(callback, options),
}));

jest.mock('@/lib/watching-updates', () => ({
  fetchWatchingUpdatesFromServer: () => mockFetchWatchingUpdatesFromServer(),
  subscribeToWatchingUpdatesEvent: (handler: () => void) =>
    mockSubscribeToWatchingUpdatesEvent(handler),
}));

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

describe('useWatchingUpdatesRefresh', () => {
  beforeEach(() => {
    mockFetchWatchingUpdatesFromServer.mockReset();
    mockScheduleIdleTask.mockReset();
    mockSubscribeToWatchingUpdatesEvent.mockReset();
    mockFetchWatchingUpdatesFromServer.mockResolvedValue(undefined);
    mockScheduleIdleTask.mockReturnValue(jest.fn());
    mockSubscribeToWatchingUpdatesEvent.mockReturnValue(jest.fn());
    setDocumentHidden(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setDocumentHidden(false);
  });

  it('schedules a visible home-tab watching update check on idle', async () => {
    const { result } = renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates: jest.fn(),
      }),
    );

    await act(async () => {
      await flushAsyncWork();
    });

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });

    expect(mockScheduleIdleTask).toHaveBeenCalledWith(expect.any(Function), {
      delayMs: 4000,
      timeoutMs: 5500,
    });

    const runCheck = mockScheduleIdleTask.mock.calls[0][0] as () => void;

    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    expect(mockFetchWatchingUpdatesFromServer).toHaveBeenCalledTimes(1);
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

    expect(mockFetchWatchingUpdatesFromServer).not.toHaveBeenCalled();

    rerender({ activeTab: 'home' });
    setDocumentHidden(true);

    act(() => {
      result.current.scheduleWatchingUpdatesCheck();
    });

    runCheck = mockScheduleIdleTask.mock.calls[1][0] as () => void;
    await act(async () => {
      runCheck();
      await flushAsyncWork();
    });

    expect(mockFetchWatchingUpdatesFromServer).not.toHaveBeenCalled();
  });

  it('checks on visibility changes with throttling', async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(20_000)
      .mockReturnValueOnce(25_000)
      .mockReturnValueOnce(36_000);

    renderHook(() =>
      useWatchingUpdatesRefresh({
        activeTab: 'home',
        refreshWatchingUpdates: jest.fn(),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();
    });

    expect(mockFetchWatchingUpdatesFromServer).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();
    });

    expect(mockFetchWatchingUpdatesFromServer).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();
    });

    expect(mockFetchWatchingUpdatesFromServer).toHaveBeenCalledTimes(2);
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
      refreshWatchingUpdates,
    );

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
