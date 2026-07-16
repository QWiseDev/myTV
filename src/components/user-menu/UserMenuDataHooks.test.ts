import { act, renderHook } from '@testing-library/react';

import type { Favorite, PlayRecord } from '@/lib/types';
import type { WatchingUpdate } from '@/lib/watching-updates';

const mockGetAllPlayRecords = jest.fn();
const mockGetCachedWatchingUpdates = jest.fn();
const mockGetDetailedWatchingUpdates = jest.fn();
const mockSubscribeToWatchingUpdatesEvent = jest.fn();
const mockDebugError = jest.fn();
const mockDebugLog = jest.fn();

jest.mock('@/lib/db.client', () => ({
  getAllPlayRecords: mockGetAllPlayRecords,
}));

jest.mock('@/lib/debug', () => ({
  debug: {
    error: mockDebugError,
    log: mockDebugLog,
  },
}));

jest.mock('@/lib/watching-updates', () => ({
  getCachedWatchingUpdates: mockGetCachedWatchingUpdates,
  getDetailedWatchingUpdates: mockGetDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent: mockSubscribeToWatchingUpdatesEvent,
}));

let useUserMenuContinueWatching: typeof import('./useUserMenuContinueWatching').useUserMenuContinueWatching;
let useUserMenuFavorites: typeof import('./useUserMenuFavorites').useUserMenuFavorites;
let useUserMenuWatchingUpdates: typeof import('./useUserMenuWatchingUpdates').useUserMenuWatchingUpdates;

interface HookProps {
  authInfo: { username?: string } | null;
  isOpen: boolean;
  storageType: string;
}

type WatchingUpdatesHandler = (
  hasUpdates: boolean,
  updatedCount: number,
  invalidated: boolean,
) => void;

const AUTH_INFO = { username: 'alice' };
const originalFetch = global.fetch;
const mockFetch = jest.fn();

let watchingUpdatesHandler: WatchingUpdatesHandler | undefined;
let unsubscribeWatchingUpdates: jest.Mock;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function createWatchingUpdate(
  overrides: Partial<WatchingUpdate> = {},
): WatchingUpdate {
  return {
    continueWatchingCount: 0,
    hasUpdates: true,
    timestamp: 1,
    updatedCount: 1,
    updatedSeries: [],
    ...overrides,
  };
}

function createPlayRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    cover: 'https://example.com/play.jpg',
    index: 2,
    play_time: 240,
    save_time: 2000,
    search_title: '继续观看影片',
    source_name: '测试源',
    title: '继续观看影片',
    total_episodes: 12,
    total_time: 1200,
    year: '2026',
    ...overrides,
  };
}

function createFavorite(overrides: Partial<Favorite> = {}): Favorite {
  return {
    cover: 'https://example.com/favorite.jpg',
    save_time: 2000,
    search_title: '收藏影片',
    source_name: '测试源',
    title: '收藏影片',
    total_episodes: 1,
    year: '2026',
    ...overrides,
  };
}

describe('UserMenu data hooks', () => {
  beforeAll(async () => {
    useUserMenuContinueWatching = (
      await import('./useUserMenuContinueWatching')
    ).useUserMenuContinueWatching;
    useUserMenuFavorites = (await import('./useUserMenuFavorites'))
      .useUserMenuFavorites;
    useUserMenuWatchingUpdates = (await import('./useUserMenuWatchingUpdates'))
      .useUserMenuWatchingUpdates;
  });

  beforeEach(() => {
    localStorage.clear();
    watchingUpdatesHandler = undefined;
    unsubscribeWatchingUpdates = jest.fn();
    mockGetAllPlayRecords.mockReset().mockResolvedValue({});
    mockGetCachedWatchingUpdates.mockReset().mockReturnValue(false);
    mockGetDetailedWatchingUpdates.mockReset().mockReturnValue(null);
    mockSubscribeToWatchingUpdatesEvent
      .mockReset()
      .mockImplementation((handler: WatchingUpdatesHandler) => {
        watchingUpdatesHandler = handler;
        return unsubscribeWatchingUpdates;
      });
    mockDebugError.mockReset();
    mockDebugLog.mockReset();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('useUserMenuWatchingUpdates', () => {
    it('does not read or subscribe without an eligible server user', () => {
      const { rerender } = renderHook(
        ({
          authInfo,
          storageType,
        }: Pick<HookProps, 'authInfo' | 'storageType'>) =>
          useUserMenuWatchingUpdates({ authInfo, storageType }),
        {
          initialProps: {
            authInfo: null as HookProps['authInfo'],
            storageType: 'redis',
          },
        },
      );

      rerender({ authInfo: AUTH_INFO, storageType: 'localstorage' });

      expect(mockGetCachedWatchingUpdates).not.toHaveBeenCalled();
      expect(mockGetDetailedWatchingUpdates).not.toHaveBeenCalled();
      expect(mockSubscribeToWatchingUpdatesEvent).not.toHaveBeenCalled();
    });

    it('subscribes even when the boolean cache gate is false', () => {
      const { result, unmount } = renderHook(() =>
        useUserMenuWatchingUpdates({
          authInfo: AUTH_INFO,
          storageType: 'redis',
        }),
      );

      expect(mockGetCachedWatchingUpdates).toHaveBeenCalledTimes(1);
      expect(mockGetDetailedWatchingUpdates).not.toHaveBeenCalled();
      expect(mockSubscribeToWatchingUpdatesEvent).toHaveBeenCalledTimes(1);
      expect(result.current.watchingUpdatesState.totalUpdates).toBe(0);

      unmount();
      expect(unsubscribeWatchingUpdates).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['never viewed', '0', true],
      ['viewed exactly one minute ago', '40000', false],
      ['viewed more than one minute ago', '39999', true],
    ])('hydrates unread state when %s', (_label, lastViewed, expected) => {
      jest.spyOn(Date, 'now').mockReturnValue(100000);
      localStorage.setItem('watchingUpdatesLastViewed', lastViewed);
      mockGetCachedWatchingUpdates.mockReturnValue(true);
      mockGetDetailedWatchingUpdates.mockReturnValue(createWatchingUpdate());

      const { result } = renderHook(() =>
        useUserMenuWatchingUpdates({
          authInfo: AUTH_INFO,
          storageType: 'redis',
        }),
      );

      expect(result.current.hasUnreadUpdates).toBe(expected);
      expect(result.current.watchingUpdatesState.totalUpdates).toBe(1);
    });

    it('ignores invalidation, refreshes from cache on normal events and marks viewed locally', () => {
      jest.spyOn(Date, 'now').mockReturnValue(123456);
      const initialUpdate = createWatchingUpdate();
      const refreshedUpdate = createWatchingUpdate({ updatedCount: 2 });
      mockGetCachedWatchingUpdates.mockReturnValue(true);
      mockGetDetailedWatchingUpdates.mockReturnValue(initialUpdate);

      const { result } = renderHook(() =>
        useUserMenuWatchingUpdates({
          authInfo: AUTH_INFO,
          storageType: 'redis',
        }),
      );

      act(() => {
        result.current.markWatchingUpdatesViewed();
      });
      expect(result.current.hasUnreadUpdates).toBe(false);
      expect(localStorage.getItem('watchingUpdatesLastViewed')).toBe('123456');

      mockGetDetailedWatchingUpdates.mockReturnValue(refreshedUpdate);
      const readsBeforeInvalidation =
        mockGetDetailedWatchingUpdates.mock.calls.length;
      act(() => {
        watchingUpdatesHandler?.(false, 0, true);
      });
      expect(mockGetDetailedWatchingUpdates).toHaveBeenCalledTimes(
        readsBeforeInvalidation,
      );
      expect(result.current.watchingUpdatesState.totalUpdates).toBe(1);

      act(() => {
        watchingUpdatesHandler?.(false, 0, false);
      });
      expect(result.current.watchingUpdatesState.totalUpdates).toBe(2);
      expect(result.current.hasUnreadUpdates).toBe(false);
    });
  });

  describe('useUserMenuContinueWatching', () => {
    function renderContinueWatchingHook(initialProps: HookProps) {
      return renderHook(
        ({ authInfo, isOpen, storageType }: HookProps) =>
          useUserMenuContinueWatching({
            authInfo,
            enableProgressFilter: false,
            isOpen,
            maxProgress: 100,
            minProgress: 5,
            storageType,
          }),
        { initialProps },
      );
    }

    it('does not request or subscribe while disabled', () => {
      renderContinueWatchingHook({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });

      expect(mockGetAllPlayRecords).not.toHaveBeenCalled();
      expect(mockSubscribeToWatchingUpdatesEvent).not.toHaveBeenCalled();
    });

    it('loads on open, reloads on play record events and cleans up on close', async () => {
      mockGetAllPlayRecords
        .mockResolvedValueOnce({ 'source+old': createPlayRecord() })
        .mockResolvedValueOnce({
          'source+new': createPlayRecord({ title: '更新后的影片' }),
        });
      const { result, rerender } = renderContinueWatchingHook({
        authInfo: AUTH_INFO,
        isOpen: true,
        storageType: 'redis',
      });

      await act(async () => {
        await flushAsyncWork();
      });
      expect(result.current.playRecords[0]).toEqual(
        expect.objectContaining({ key: 'source+old' }),
      );

      await act(async () => {
        window.dispatchEvent(new Event('playRecordsUpdated'));
        await flushAsyncWork();
      });
      expect(result.current.playRecords[0]).toEqual(
        expect.objectContaining({ key: 'source+new', title: '更新后的影片' }),
      );

      rerender({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });
      window.dispatchEvent(new Event('playRecordsUpdated'));

      expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
      expect(unsubscribeWatchingUpdates).toHaveBeenCalledTimes(1);
    });

    it('coalesces valid watching events and cancels a pending timer on close', async () => {
      jest.useFakeTimers();
      mockGetDetailedWatchingUpdates.mockReturnValue(createWatchingUpdate());
      const { rerender } = renderContinueWatchingHook({
        authInfo: AUTH_INFO,
        isOpen: true,
        storageType: 'redis',
      });

      await act(async () => {
        await flushAsyncWork();
      });
      mockGetAllPlayRecords.mockClear();

      act(() => {
        watchingUpdatesHandler?.(true, 1, true);
      });
      expect(mockGetDetailedWatchingUpdates).not.toHaveBeenCalled();

      act(() => {
        watchingUpdatesHandler?.(true, 1, false);
        watchingUpdatesHandler?.(true, 1, false);
        jest.advanceTimersByTime(99);
      });
      expect(mockGetAllPlayRecords).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
        await flushAsyncWork();
      });
      expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(1);

      act(() => {
        watchingUpdatesHandler?.(true, 1, false);
      });
      rerender({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });
      await act(async () => {
        jest.advanceTimersByTime(100);
        await flushAsyncWork();
      });

      expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(1);
      expect(unsubscribeWatchingUpdates).toHaveBeenCalledTimes(1);
    });

    it('ignores an initial response that resolves after the panel closes', async () => {
      const pendingRecords = createDeferred<Record<string, PlayRecord>>();
      mockGetAllPlayRecords.mockReturnValue(pendingRecords.promise);
      const { result, rerender } = renderContinueWatchingHook({
        authInfo: AUTH_INFO,
        isOpen: true,
        storageType: 'redis',
      });

      rerender({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });
      await act(async () => {
        pendingRecords.resolve({
          'source+late': createPlayRecord({ title: '晚到影片' }),
        });
        await flushAsyncWork();
      });

      expect(result.current.playRecords).toEqual([]);
    });
  });

  describe('useUserMenuFavorites', () => {
    function renderFavoritesHook(initialProps: HookProps) {
      return renderHook(
        ({ authInfo, isOpen, storageType }: HookProps) =>
          useUserMenuFavorites({ authInfo, isOpen, storageType }),
        { initialProps },
      );
    }

    it('does not fetch while disabled', () => {
      renderFavoritesHook({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('loads, reloads on events and keeps the last data after close', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({ 'source+old': createFavorite() }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            'source+new': createFavorite({ title: '更新后的收藏' }),
          }),
          ok: true,
        });
      const { result, rerender } = renderFavoritesHook({
        authInfo: AUTH_INFO,
        isOpen: true,
        storageType: 'redis',
      });

      await act(async () => {
        await flushAsyncWork();
      });
      expect(result.current.favorites[0]).toEqual(
        expect.objectContaining({ key: 'source+old' }),
      );

      await act(async () => {
        window.dispatchEvent(new Event('favoritesUpdated'));
        await flushAsyncWork();
      });
      expect(result.current.favorites[0]).toEqual(
        expect.objectContaining({
          key: 'source+new',
          title: '更新后的收藏',
        }),
      );

      rerender({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });
      window.dispatchEvent(new Event('favoritesUpdated'));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.current.favorites[0]).toEqual(
        expect.objectContaining({ key: 'source+new' }),
      );
    });

    it('does not read JSON when fetch resolves after close', async () => {
      const pendingResponse = createDeferred<{
        json: jest.Mock;
        ok: boolean;
      }>();
      const json = jest.fn().mockResolvedValue({
        'source+late': createFavorite(),
      });
      mockFetch.mockReturnValue(pendingResponse.promise);
      const { result, rerender } = renderFavoritesHook({
        authInfo: AUTH_INFO,
        isOpen: true,
        storageType: 'redis',
      });

      rerender({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });
      await act(async () => {
        pendingResponse.resolve({ json, ok: true });
        await flushAsyncWork();
      });

      expect(json).not.toHaveBeenCalled();
      expect(result.current.favorites).toEqual([]);
    });

    it('ignores JSON that resolves after close and skips JSON for non-ok responses', async () => {
      const pendingJson = createDeferred<Record<string, Favorite>>();
      const json = jest.fn(() => pendingJson.promise);
      mockFetch.mockResolvedValueOnce({ json, ok: true });
      const { result, rerender } = renderFavoritesHook({
        authInfo: AUTH_INFO,
        isOpen: true,
        storageType: 'redis',
      });

      await act(async () => {
        await flushAsyncWork();
      });
      expect(json).toHaveBeenCalledTimes(1);
      rerender({
        authInfo: AUTH_INFO,
        isOpen: false,
        storageType: 'redis',
      });
      await act(async () => {
        pendingJson.resolve({ 'source+late': createFavorite() });
        await flushAsyncWork();
      });
      expect(result.current.favorites).toEqual([]);

      const nonOkJson = jest.fn();
      mockFetch.mockResolvedValueOnce({ json: nonOkJson, ok: false });
      rerender({
        authInfo: AUTH_INFO,
        isOpen: true,
        storageType: 'redis',
      });
      await act(async () => {
        await flushAsyncWork();
      });

      expect(nonOkJson).not.toHaveBeenCalled();
      expect(mockDebugError).not.toHaveBeenCalled();
    });
  });
});
