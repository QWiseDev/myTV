import { render, screen } from '@testing-library/react';

import type { HomeContinueWatchingState } from './HomeTabContent';
import HomeTabContent from './HomeTabContent';

let mockSuspendContinueWatching = false;
const mockNeverResolve = new Promise<void>(() => undefined);

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
  default: () => <div>视频卡片</div>,
}));

jest.mock('./BangumiSection', () => ({
  __esModule: true,
  default: () => <div data-testid='新番放送'>新番放送</div>,
}));

jest.mock('./LazyVideoSection', () => ({
  __esModule: true,
  default: ({ loading, title }: { loading: boolean; title: string }) => (
    <div data-testid={title}>{String(loading)}</div>
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
  onDeleteRecord: jest.fn(),
  onClearAll: jest.fn(),
  onLoadMore: jest.fn().mockResolvedValue(undefined),
};

describe('HomeTabContent', () => {
  beforeEach(() => {
    mockSuspendContinueWatching = false;
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
});
