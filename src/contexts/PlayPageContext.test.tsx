import { render } from '@testing-library/react';

import { PlaybackDataProvider } from './PlayPageContext';

const mockRefreshWatchingUpdates = jest.fn().mockResolvedValue(undefined);
const mockUsePlaybackRecords = jest.fn();

jest.mock('@/hooks/usePlaybackRecords', () => ({
  usePlaybackRecords: (...args: unknown[]) => mockUsePlaybackRecords(...args),
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
    mockUsePlaybackRecords.mockReset();
    mockUsePlaybackRecords.mockReturnValue({
      hasMorePlayRecords: false,
      loadingMorePlayRecords: false,
      loadingPlayRecords: false,
      loadMorePlayRecords: jest.fn(),
      markAllPlayRecordsDeleted: jest.fn(),
      markPlayRecordDeleted: jest.fn(),
      playRecords: {},
      playRecordsLoadError: null,
      refreshPlayRecords: jest.fn(),
      retryPlayRecords: jest.fn(),
      setPlayRecords: jest.fn(),
    });
  });

  it('把当前路由记录与追更记录一起纳入首屏请求', () => {
    render(
      <PlaybackDataProvider includePlayRecordKeys={['route-source+route-id']}>
        <div>content</div>
      </PlaybackDataProvider>,
    );

    expect(mockUsePlaybackRecords).toHaveBeenCalledWith(
      mockRefreshWatchingUpdates,
      ['route-source+route-id', 'update-source+update-id'],
    );
  });
});
