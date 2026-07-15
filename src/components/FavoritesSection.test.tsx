import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { clearAllFavorites } from '@/lib/db.client';
import type { FavoriteItem } from '@/lib/types';

import FavoritesSection from './FavoritesSection';
import VideoCard from './VideoCard';

jest.mock('@/lib/db.client', () => ({
  clearAllFavorites: jest.fn(),
}));

jest.mock('./VideoCard', () => ({
  __esModule: true,
  default: jest.fn(({ title }: { title: string }) => (
    <div data-testid='video-card'>{title}</div>
  )),
}));

const mockClearAllFavorites = clearAllFavorites as jest.MockedFunction<
  typeof clearAllFavorites
>;
const mockVideoCard = VideoCard as jest.MockedFunction<typeof VideoCard>;

const favorite: FavoriteItem = {
  id: '1',
  source: 'source-a',
  title: '测试剧集',
  poster: 'https://example.com/poster.jpg',
  episodes: 12,
  source_name: 'source-a',
  search_title: '测试搜索词',
};

describe('FavoritesSection', () => {
  beforeEach(() => {
    mockClearAllFavorites.mockReset();
    mockClearAllFavorites.mockResolvedValue(undefined);
    mockVideoCard.mockClear();
  });

  it('renders favorite cards with the existing playback props', async () => {
    render(
      <FavoritesSection
        favoriteItems={[favorite]}
        loadError={false}
        loading={false}
        onClearAll={jest.fn()}
      />,
    );

    expect((await screen.findByTestId('video-card')).textContent).toBe(
      '测试剧集',
    );
    expect(mockVideoCard.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        from: 'favorite',
        query: '测试搜索词',
        type: 'tv',
      }),
    );
  });

  it('keeps the empty state for an empty favorite list', () => {
    render(
      <FavoritesSection
        favoriteItems={[]}
        loadError={false}
        loading={false}
        onClearAll={jest.fn()}
      />,
    );

    expect(screen.getByText('收藏夹空空如也')).toBeTruthy();
  });

  it('does not show the empty state while favorites are loading', () => {
    render(
      <FavoritesSection
        favoriteItems={[]}
        loadError={false}
        loading
        onClearAll={jest.fn()}
      />,
    );

    expect(screen.getByRole('status').textContent).toBe('正在加载收藏...');
    expect(screen.queryByText('收藏夹空空如也')).toBeNull();
  });

  it('shows a load error instead of treating it as an empty list', () => {
    render(
      <FavoritesSection
        favoriteItems={[]}
        loadError
        loading={false}
        onClearAll={jest.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      '收藏加载失败，请稍后重试',
    );
    expect(screen.queryByText('收藏夹空空如也')).toBeNull();
  });

  it('keeps stale favorites visible when a refresh fails', () => {
    render(
      <FavoritesSection
        favoriteItems={[favorite]}
        loadError
        loading={false}
        onClearAll={jest.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      '收藏刷新失败，当前显示已有内容',
    );
    expect(screen.getByText('测试剧集')).toBeTruthy();
  });

  it('clears storage before updating the local favorite state', async () => {
    const events: string[] = [];
    mockClearAllFavorites.mockImplementation(async () => {
      events.push('storage');
    });
    const onClearAll = jest.fn(() => {
      events.push('state');
    });
    render(
      <FavoritesSection
        favoriteItems={[favorite]}
        loadError={false}
        loading={false}
        onClearAll={onClearAll}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '清空' }));

    await waitFor(() => expect(onClearAll).toHaveBeenCalledTimes(1));
    expect(events).toEqual(['storage', 'state']);
  });

  it('keeps local favorites when clearing storage fails', async () => {
    mockClearAllFavorites.mockRejectedValue(new Error('request failed'));
    const onClearAll = jest.fn();
    render(
      <FavoritesSection
        favoriteItems={[favorite]}
        loadError={false}
        loading={false}
        onClearAll={onClearAll}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '清空' }));

    await waitFor(() => expect(mockClearAllFavorites).toHaveBeenCalledTimes(1));
    expect(onClearAll).not.toHaveBeenCalled();
    expect(screen.getByText('测试剧集')).toBeTruthy();
  });
});
