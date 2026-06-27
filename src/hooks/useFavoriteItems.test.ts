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

    rerender({ activeTab: 'favorites' });
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
});
