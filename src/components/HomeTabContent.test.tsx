import { render, screen } from '@testing-library/react';

import type { HomeErrorState, HomeSectionKey } from '@/lib/home-data-client';
import type { DoubanItem } from '@/lib/types';

import type { HomeContinueWatchingState } from './HomeTabContent';
import HomeTabContent from './HomeTabContent';

let mockSuspendContinueWatching = false;
const mockNeverResolve = new Promise<void>(() => undefined);
const mockVideoCard = jest.fn(({ title }: { title: string }) => (
  <div>{title}</div>
));
const mockBangumiSection = jest.fn(
  (_props: { loadError: boolean; onRetry: () => Promise<void> }) => (
    <div data-testid='新番放送'>新番放送</div>
  ),
);
const mockLazyVideoSection = jest.fn(
  ({
    data,
    loading,
    renderItem,
    title,
  }: {
    data: DoubanItem[];
    loading: boolean;
    loadError: boolean;
    onRetry: () => Promise<void>;
    renderItem: (item: DoubanItem, index: number) => React.ReactNode;
    title: string;
  }) => (
    <div data-testid={title}>
      {String(loading)}
      {data[0] ? renderItem(data[0], 0) : null}
    </div>
  ),
);

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
  default: (props: { loadError: boolean; onRetry: () => Promise<void> }) =>
    mockBangumiSection(props),
}));

jest.mock('./LazyVideoSection', () => ({
  __esModule: true,
  default: (props: Parameters<typeof mockLazyVideoSection>[0]) =>
    mockLazyVideoSection(props),
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
const noErrors: HomeErrorState = {
  critical: false,
  tertiary: false,
  tv: false,
  variety: false,
};
const retrySection = jest.fn<Promise<void>, [HomeSectionKey]>(() =>
  Promise.resolve(),
);

describe('HomeTabContent', () => {
  beforeEach(() => {
    mockSuspendContinueWatching = false;
    mockBangumiSection.mockClear();
    mockLazyVideoSection.mockClear();
    mockVideoCard.mockClear();
    retrySection.mockClear();
  });

  it('passes independent loading state to TV and variety sections', async () => {
    render(
      <HomeTabContent
        continueWatching={continueWatching}
        errors={noErrors}
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
        retrySection={retrySection}
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
        errors={noErrors}
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
        retrySection={retrySection}
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
        errors={noErrors}
        homeData={homeData}
        loading={loading}
        retrySection={retrySection}
      />,
    );

    expect(mockVideoCard.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ priority: false, title: '热门电影 1' }),
    );

    rerender(
      <HomeTabContent
        continueWatching={continueWatching}
        errors={noErrors}
        homeData={homeData}
        loading={loading}
        retrySection={retrySection}
      />,
    );

    expect(mockVideoCard.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ priority: true, title: '热门电影 1' }),
    );
  });

  it('maps section errors and retry actions to their data sources', async () => {
    render(
      <HomeTabContent
        continueWatching={continueWatching}
        errors={{
          critical: true,
          tertiary: true,
          tv: false,
          variety: true,
        }}
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
          varietyLoading: false,
        }}
        retrySection={retrySection}
      />,
    );

    const sectionProps = Object.fromEntries(
      mockLazyVideoSection.mock.calls.map(([props]) => [props.title, props]),
    );
    const bangumiCall = mockBangumiSection.mock.calls[0];
    if (!bangumiCall) {
      throw new Error('新番放送区块未渲染');
    }
    const [bangumiProps] = bangumiCall;

    expect(sectionProps['热门电影'].loadError).toBe(true);
    expect(sectionProps['热门剧集'].loadError).toBe(false);
    expect(sectionProps['热门综艺'].loadError).toBe(true);
    expect(bangumiProps.loadError).toBe(true);

    await sectionProps['热门电影'].onRetry();
    await sectionProps['热门剧集'].onRetry();
    await sectionProps['热门综艺'].onRetry();
    await bangumiProps.onRetry();

    expect(retrySection.mock.calls).toEqual([
      ['critical'],
      ['tv'],
      ['variety'],
      ['tertiary'],
    ]);
  });
});
