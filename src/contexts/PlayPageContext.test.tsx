import { render } from '@testing-library/react';

import { PlaybackDataProvider } from './PlayPageContext';

const mockRefreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
const mockUseContinueWatchingData = jest.fn();

jest.mock('@/hooks/useContinueWatchingData', () => ({
  useContinueWatchingData: (...args: unknown[]) =>
    mockUseContinueWatchingData(...args),
}));

jest.mock('@/hooks/useWatchingUpdatesSnapshot', () => ({
  useWatchingUpdatesSnapshot: () => ({
    loadingWatchingUpdates: false,
    refreshWatchingUpdates: mockRefreshWatchingUpdates,
    setWatchingUpdates: jest.fn(),
    watchingUpdates: {
      updatedSeries: [
        {
          hasNewEpisode: true,
          sourceKey: 'update-source',
          videoId: 'update-id',
        },
      ],
    },
  }),
}));

describe('PlaybackDataProvider', () => {
  beforeEach(() => {
    mockUseContinueWatchingData.mockReset();
    mockUseContinueWatchingData.mockReturnValue({
      hasMorePlayRecords: false,
      loadingMorePlayRecords: false,
      loadingPlayRecords: false,
      loadMorePlayRecords: jest.fn(),
      clearAll: jest.fn(),
      deleteRecord: jest.fn(),
      playRecords: {},
      playRecordsLoadError: null,
      retryPlayRecords: jest.fn(),
    });
  });

  it('把当前路由记录与追更记录一起纳入首屏请求', () => {
    render(
      <PlaybackDataProvider includePlayRecordKeys={['route-source+route-id']}>
        <div>content</div>
      </PlaybackDataProvider>,
    );

    expect(mockUseContinueWatchingData).toHaveBeenCalledWith([
      'route-source+route-id',
      'update-source+update-id',
    ]);
  });

  it('播放页传入 eager 时透传给 useContinueWatchingData', () => {
    render(
      <PlaybackDataProvider
        includePlayRecordKeys={['route-source+route-id']}
        eager
      >
        <div>content</div>
      </PlaybackDataProvider>,
    );

    expect(mockUseContinueWatchingData).toHaveBeenCalledWith(
      ['route-source+route-id', 'update-source+update-id'],
      { eager: true },
    );
  });
});
