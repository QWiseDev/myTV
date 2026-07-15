import { render, screen } from '@testing-library/react';

import type { DoubanItem } from '@/lib/types';

import type { HomeContinueWatchingState } from './HomeTabContent';
import HomeTabContent from './HomeTabContent';

let mockSuspendContinueWatching = false;
const mockNeverResolve = new Promise<void>(() => undefined);
const mockVideoCard = jest.fn(({ title }: { title: string }) => (
  <div>{title}</div>
));

jest.mock('./ContinueWatching', () => ({
  __esModule: true,
  default: () => {
    if (mockSuspendContinueWatching) {
      throw mockNeverResolve;
    }
    return <div>继续观看</div>;
  },
}));

jest.mock('./VideoCard', () => ({
  __esModule: true,
  default: (props: { title: string }) => mockVideoCard(props),
}));

jest.mock('./BangumiSection', () => ({
  __esModule: true,
  default: () => <div data-testid='新番放送'>新番放送</div>,
}));

jest.mock('./LazyVideoSection', () => ({
  __esModule: true,
  default: ({
    data,
    loading,
    renderItem,
    title,
  }: {
    data: DoubanItem[];
    loading: boolean;
    renderItem: (item: DoubanItem, index: number) => React.ReactNode;
    title: string;
  }) => (
    <div data-testid={title}>
      {String(loading)}
      {data[0] ? renderItem(data[0], 0) : null}
    </div>
  ),
}));

jest.mock('./SectionSkeleton', () => ({
  __esModule: true,
  default: ({ title }: { title?: string }) => (
    <div data-testid={`skeleton-${title ?? 'section'}`} />
  ),
}));

const continueWatching: HomeContinueWatchingState = {
  playRecords: {},
  watchingUpdates: null,
  loading: false,
  loadingMore: false,
  hasMore: false,
  loadError: null,
  onDeleteRecord: jest.fn(),
  onClearAll: jest.fn(),
  onLoadMore: jest.fn().mockResolvedValue(undefined),
  onRetry: jest.fn().mockResolvedValue(undefined),
};

describe('HomeTabContent', () => {
  beforeEach(() => {
    mockSuspendContinueWatching = false;
    mockVideoCard.mockClear();
  });

  it('passes independent loading state to TV and variety sections', async () => {
    render(
      <HomeTabContent
        continueWatching={continueWatching}
        homeData={{
          hotMovies: [],
          hotTvShows: [],
          hotVarietyShows: [],
          bangumiCalendarData: [],
        }}
        loading={{
          criticalLoading: false,
          tertiaryLoading: false,
          tvLoading: false,
          varietyLoading: true,
        }}
      />,
    );

    await screen.findByText('继续观看');
    expect(screen.getByTestId('热门剧集').textContent).toBe('false');
    expect(screen.getByTestId('热门综艺').textContent).toBe('true');
  });

  it('keeps synchronous sections visible while continue watching suspends', () => {
    mockSuspendContinueWatching = true;

    render(
      <HomeTabContent
        continueWatching={continueWatching}
        homeData={{
          hotMovies: [],
          hotTvShows: [],
          hotVarietyShows: [],
          bangumiCalendarData: [],
        }}
        loading={{
          criticalLoading: true,
          tertiaryLoading: true,
          tvLoading: true,
          varietyLoading: true,
        }}
      />,
    );

    expect(screen.getByTestId('skeleton-继续观看')).toBeTruthy();
    expect(screen.getByTestId('热门电影')).toBeTruthy();
    expect(screen.getByTestId('热门剧集')).toBeTruthy();
    expect(screen.getByTestId('新番放送')).toBeTruthy();
    expect(screen.getByTestId('热门综艺')).toBeTruthy();
  });

  it('waits for playback records before prioritizing popular movie posters', () => {
    const movie: DoubanItem = {
      id: '1',
      poster: 'https://example.com/movie.jpg',
      rate: '8.0',
      title: '热门电影 1',
      year: '2026',
    };
    const loadingContinueWatching = {
      ...continueWatching,
      loading: true,
    };
    const homeData = {
      hotMovies: [movie],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [],
    };
    const loading = {
      criticalLoading: false,
      tertiaryLoading: false,
      tvLoading: false,
      varietyLoading: false,
    };
    const { rerender } = render(
      <HomeTabContent
        continueWatching={loadingContinueWatching}
        homeData={homeData}
        loading={loading}
      />,
    );

    expect(mockVideoCard.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ priority: false, title: '热门电影 1' }),
    );

    rerender(
      <HomeTabContent
        continueWatching={continueWatching}
        homeData={homeData}
        loading={loading}
      />,
    );

    expect(mockVideoCard.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ priority: true, title: '热门电影 1' }),
    );
  });
});
