import { act, renderHook } from '@testing-library/react';

import type { Favorite } from '@/lib/db.client';
import type { PlayRecord } from '@/lib/types';

const mockGetAllFavorites = jest.fn();
const mockGetAllPlayRecords = jest.fn();
const mockSubscribeToDataUpdates = jest.fn();

jest.mock('@/lib/db.client', () => ({
  getAllFavorites: mockGetAllFavorites,
  getAllPlayRecords: mockGetAllPlayRecords,
  subscribeToDataUpdates: mockSubscribeToDataUpdates,
}));

let useFavoriteItems: typeof import('./useFavoriteItems').useFavoriteItems;

type FavoriteUpdateHandler = (favorites: Record<string, Favorite>) => void;

const favoriteKey = 'source-a+video-a';

function createFavorite(overrides: Partial<Favorite> = {}): Favorite {
  return {
    cover: 'https://cdn.example/poster.jpg',
    save_time: 100,
    source_name: '测试源',
    title: '收藏影片',
    total_episodes: 12,
    year: '2026',
    ...overrides,
  };
}

function createPlayRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    cover: 'https://cdn.example/poster.jpg',
    index: 5,
    play_time: 50,
    save_time: 200,
    search_title: '播放记录',
    source_name: '测试源',
    title: '播放记录',
    total_episodes: 12,
    total_time: 100,
    year: '2026',
    ...overrides,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

async function runFavoriteDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(300);
    await flushAsyncWork();
  });
}

describe('useFavoriteItems', () => {
  let favoriteUpdateHandler: FavoriteUpdateHandler | undefined;

  beforeAll(async () => {
    useFavoriteItems = (await import('./useFavoriteItems')).useFavoriteItems;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    favoriteUpdateHandler = undefined;
    mockGetAllFavorites.mockReset();
    mockGetAllPlayRecords.mockReset();
    mockSubscribeToDataUpdates.mockReset();
    mockGetAllFavorites.mockResolvedValue({});
    mockGetAllPlayRecords.mockResolvedValue({});
    mockSubscribeToDataUpdates.mockImplementation(
      (_event: string, handler: FavoriteUpdateHandler) => {
        favoriteUpdateHandler = handler;
        return jest.fn();
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads favorites only after switching to the favorites tab', async () => {
    const favorite = createFavorite();
    const playRecord = createPlayRecord();
    mockGetAllFavorites.mockResolvedValue({ [favoriteKey]: favorite });
    mockGetAllPlayRecords.mockResolvedValue({ [favoriteKey]: playRecord });

    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useFavoriteItems(activeTab),
      {
        initialProps: { activeTab: 'home' },
      },
    );

    await act(async () => {
      await flushAsyncWork();
    });

    expect(mockGetAllFavorites).not.toHaveBeenCalled();
    expect(result.current.favoriteItems).toEqual([]);
    expect(result.current.loadingFavorites).toBe(false);
    expect(result.current.favoriteLoadError).toBe(false);

    rerender({ activeTab: 'favorites' });
    expect(result.current.loadingFavorites).toBe(true);
    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();

    expect(mockGetAllFavorites).toHaveBeenCalledTimes(1);
    expect(mockSubscribeToDataUpdates).toHaveBeenCalledWith(
      'favoritesUpdated',
      expect.any(Function),
    );
    expect(result.current.favoriteItems).toEqual([
      expect.objectContaining({
        currentEpisode: 5,
        id: 'video-a',
        source: 'source-a',
        title: '收藏影片',
      }),
    ]);
    expect(result.current.loadingFavorites).toBe(false);
    expect(result.current.favoriteLoadError).toBe(false);
  });

  it('debounces favorite update events and applies the latest favorites payload', async () => {
    renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();
    mockGetAllPlayRecords.mockClear();

    act(() => {
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ title: '旧收藏' }),
      });
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ save_time: 300, title: '新收藏' }),
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(299);
      await flushAsyncWork();
    });
    expect(mockGetAllPlayRecords).not.toHaveBeenCalled();

    await runFavoriteDebounce();

    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(1);
  });

  it('processes the latest favorites payload received during record enrichment', async () => {
    const { result } = renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();

    const pendingPlayRecords = createDeferred<Record<string, PlayRecord>>();
    mockGetAllPlayRecords
      .mockReset()
      .mockImplementationOnce(() => pendingPlayRecords.promise)
      .mockResolvedValueOnce({});

    act(() => {
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ title: '旧收藏' }),
      });
    });
    await runFavoriteDebounce();
    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(1);

    act(() => {
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ save_time: 300, title: '新收藏' }),
      });
    });

    await act(async () => {
      pendingPlayRecords.resolve({});
      await flushAsyncWork();
    });

    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
    expect(result.current.favoriteItems).toEqual([
      expect.objectContaining({ title: '新收藏' }),
    ]);
  });

  it('continues with the latest payload when the superseded enrichment fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();

    const failedPlayRecords = createDeferred<Record<string, PlayRecord>>();
    mockGetAllPlayRecords
      .mockReset()
      .mockImplementationOnce(() => failedPlayRecords.promise)
      .mockResolvedValueOnce({});

    act(() => {
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ title: '旧收藏' }),
      });
    });
    await runFavoriteDebounce();

    act(() => {
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ save_time: 300, title: '新收藏' }),
      });
    });

    await act(async () => {
      failedPlayRecords.reject(new Error('temporary failure'));
      await flushAsyncWork();
    });

    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
    expect(result.current.favoriteItems).toEqual([
      expect.objectContaining({ title: '新收藏' }),
    ]);
    consoleError.mockRestore();
  });

  it('cancels pending favorite updates after unmount', async () => {
    const { unmount } = renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();
    mockGetAllPlayRecords.mockClear();

    act(() => {
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ title: '卸载前收藏' }),
      });
    });
    unmount();

    await runFavoriteDebounce();

    expect(mockGetAllPlayRecords).not.toHaveBeenCalled();
  });

  it('ignores an initial favorites read that resolves after unmount', async () => {
    const pendingFavorites = createDeferred<Record<string, Favorite>>();
    mockGetAllFavorites.mockReturnValue(pendingFavorites.promise);
    const { unmount } = renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });
    unmount();

    await act(async () => {
      pendingFavorites.resolve({
        [favoriteKey]: createFavorite({ title: '卸载后收藏' }),
      });
      await flushAsyncWork();
      jest.advanceTimersByTime(300);
      await flushAsyncWork();
    });

    expect(mockGetAllPlayRecords).not.toHaveBeenCalled();
  });

  it('does not apply record enrichment after leaving the favorites tab', async () => {
    const pendingPlayRecords = createDeferred<Record<string, PlayRecord>>();
    mockGetAllFavorites.mockResolvedValue({
      [favoriteKey]: createFavorite({ title: '旧收藏' }),
    });
    mockGetAllPlayRecords.mockReturnValue(pendingPlayRecords.promise);
    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useFavoriteItems(activeTab),
      { initialProps: { activeTab: 'favorites' } },
    );

    await act(async () => {
      await flushAsyncWork();
      jest.advanceTimersByTime(300);
      await flushAsyncWork();
    });
    rerender({ activeTab: 'home' });

    await act(async () => {
      pendingPlayRecords.resolve({});
      await flushAsyncWork();
    });

    expect(result.current.favoriteItems).toEqual([
      expect.objectContaining({
        currentEpisode: undefined,
        title: '旧收藏',
      }),
    ]);
  });

  it('reports a favorite load error without treating it as loaded empty data', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockGetAllFavorites.mockRejectedValue(new Error('load failed'));
    const { result } = renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });

    expect(result.current.loadingFavorites).toBe(false);
    expect(result.current.favoriteLoadError).toBe(true);
    expect(result.current.favoriteItems).toEqual([]);
    consoleError.mockRestore();
  });

  it('does not let an older initial read overwrite a newer favorite event', async () => {
    const pendingFavorites = createDeferred<Record<string, Favorite>>();
    mockGetAllFavorites.mockReturnValue(pendingFavorites.promise);
    const { result } = renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });
    act(() => {
      favoriteUpdateHandler?.({
        [favoriteKey]: createFavorite({ save_time: 300, title: '事件收藏' }),
      });
    });

    await act(async () => {
      pendingFavorites.resolve({
        [favoriteKey]: createFavorite({ title: '旧请求收藏' }),
      });
      await flushAsyncWork();
    });

    expect(result.current.favoriteItems).toEqual([
      expect.objectContaining({ title: '事件收藏' }),
    ]);
  });

  it('starts a new enrichment worker without waiting for an older tab generation', async () => {
    const oldPlayRecords = createDeferred<Record<string, PlayRecord>>();
    mockGetAllFavorites
      .mockResolvedValueOnce({
        [favoriteKey]: createFavorite({ title: '旧标签收藏' }),
      })
      .mockResolvedValueOnce({
        [favoriteKey]: createFavorite({ save_time: 300, title: '新标签收藏' }),
      });
    mockGetAllPlayRecords
      .mockReturnValueOnce(oldPlayRecords.promise)
      .mockResolvedValueOnce({});
    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: 'home' | 'favorites' }) =>
        useFavoriteItems(activeTab),
      { initialProps: { activeTab: 'favorites' } },
    );

    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();
    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(1);

    rerender({ activeTab: 'home' });
    rerender({ activeTab: 'favorites' });
    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();

    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
    expect(result.current.favoriteItems).toEqual([
      expect.objectContaining({ title: '新标签收藏' }),
    ]);

    await act(async () => {
      oldPlayRecords.resolve({});
      await flushAsyncWork();
    });
    expect(result.current.favoriteItems).toEqual([
      expect.objectContaining({ title: '新标签收藏' }),
    ]);
  });

  it('does not load play records for a confirmed empty favorite list', async () => {
    const { result } = renderHook(() => useFavoriteItems('favorites'));

    await act(async () => {
      await flushAsyncWork();
    });
    await runFavoriteDebounce();

    expect(mockGetAllPlayRecords).not.toHaveBeenCalled();
    expect(result.current.favoriteItems).toEqual([]);
    expect(result.current.loadingFavorites).toBe(false);
    expect(result.current.favoriteLoadError).toBe(false);
  });
});
