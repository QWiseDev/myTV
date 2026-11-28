import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';

import type { PlayRecord } from '@/lib/types';
import type { WatchingUpdatesCache } from '@/lib/watching-updates';

import ContinueWatching from './ContinueWatching';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (
    props: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
      fill?: boolean;
      priority?: boolean;
      unoptimized?: boolean;
      src: string | { src: string };
    },
  ) => {
    const { src, ...imageProps } = props;
    delete imageProps.fill;
    delete imageProps.priority;
    delete imageProps.unoptimized;
    return React.createElement('img', {
      ...imageProps,
      src: typeof src === 'string' ? src : src.src,
    });
  },
}));

jest.mock('@/components/ScrollableRow', () => ({
  __esModule: true,
  default: ({
    children,
    enableAnimation = true,
  }: {
    children: ReactNode;
    enableAnimation?: boolean;
  }) => (
    <div data-animation={String(enableAnimation)} data-testid='scrollable-row'>
      {children}
    </div>
  ),
}));

function createPlayRecords(count: number): Record<string, PlayRecord> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `source+video-${index + 1}`,
      {
        cover: `https://example.com/${index + 1}.jpg`,
        index: 2,
        play_time: 600,
        save_time: count - index,
        search_title: `影片 ${index + 1}`,
        source_name: '测试源',
        title: `影片 ${index + 1}`,
        total_episodes: 12,
        total_time: 1800,
        year: '2026',
      },
    ]),
  );
}

const defaultProps = {
  hasMore: true,
  loadError: null,
  loading: false,
  loadingMore: false,
  onClearAll: jest.fn(),
  onDeleteRecord: jest.fn(),
  onLoadMore: jest.fn().mockResolvedValue(undefined),
  onRetry: jest.fn().mockResolvedValue(undefined),
  watchingUpdates: null,
};

describe('ContinueWatching 16:9 workbench', () => {
  beforeEach(() => {
    defaultProps.onClearAll.mockClear();
    defaultProps.onDeleteRecord.mockClear();
    defaultProps.onLoadMore.mockClear();
    defaultProps.onRetry.mockClear();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: async () => null,
      } as unknown as Response),
    );
  });

  it('disables row animation while loading skeletons', () => {
    render(
      <ContinueWatching
        {...defaultProps}
        loading
        playRecords={createPlayRecords(1)}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe(
      'false',
    );
  });

  it('renders 16:9 cards with remaining watch time and supports single-record removal', () => {
    render(
      <ContinueWatching {...defaultProps} playRecords={createPlayRecords(2)} />,
    );

    expect(screen.getByText('影片 1')).toBeInTheDocument();
    expect(
      screen.getAllByText('第 2 集 · 剩余 20 分钟').length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole('button', { name: '删除 影片 1 的播放记录' }),
    );
    expect(defaultProps.onDeleteRecord).toHaveBeenCalledWith('source+video-1');
  });

  it('requires two-step confirmation before clearing all play records', () => {
    render(
      <ContinueWatching {...defaultProps} playRecords={createPlayRecords(2)} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(defaultProps.onClearAll).not.toHaveBeenCalled();

    // 先点取消不会清空
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(defaultProps.onClearAll).not.toHaveBeenCalled();

    // 再次点击清空并确认
    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    expect(defaultProps.onClearAll).toHaveBeenCalledTimes(1);
  });

  it('filters cards via interactive pills and keeps corner badges outside pointer hit testing', () => {
    const records = createPlayRecords(2);
    const watchingUpdates: WatchingUpdatesCache = {
      continueWatchingCount: 2,
      hasUpdates: true,
      timestamp: 1,
      updatedCount: 1,
      updatedSeries: [
        {
          title: '影片 1',
          source_name: '测试源',
          year: '2026',
          cover: 'https://example.com/1.jpg',
          sourceKey: 'source',
          videoId: 'video-1',
          currentEpisode: 2,
          totalEpisodes: 13,
          hasNewEpisode: true,
          hasContinueWatching: true,
          newEpisodes: 1,
        },
      ],
    };

    render(
      <ContinueWatching
        {...defaultProps}
        playRecords={records}
        watchingUpdates={watchingUpdates}
      />,
    );

    expect(screen.getByText('+1集').className).toContain('pointer-events-none');
    expect(screen.getByText('影片 2')).toBeInTheDocument();

    // 切换到「新剧集 1」筛选
    fireEvent.click(screen.getByRole('tab', { name: /新剧集 1/ }));
    expect(screen.getByText('影片 1')).toBeInTheDocument();
    expect(screen.queryByText('影片 2')).not.toBeInTheDocument();
  });

  it('keeps the next-page entry visible after the loaded records are deleted', () => {
    render(<ContinueWatching {...defaultProps} playRecords={{}} />);

    fireEvent.click(screen.getByRole('button', { name: '加载更多继续观看' }));

    expect(defaultProps.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('renders an immediate retry entry after the initial page fails', async () => {
    render(
      <ContinueWatching
        {...defaultProps}
        hasMore={false}
        loadError='initial'
        playRecords={{}}
      />,
    );

    expect(screen.getByText('加载失败')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重试加载继续观看' }));
      await Promise.resolve();
    });

    expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
    expect(defaultProps.onLoadMore).not.toHaveBeenCalled();
  });

  it('uses the existing cursor retry action after an append failure', () => {
    render(
      <ContinueWatching
        {...defaultProps}
        loadError='append'
        playRecords={createPlayRecords(1)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '重试加载继续观看' }));

    expect(defaultProps.onLoadMore).toHaveBeenCalledTimes(1);
    expect(defaultProps.onRetry).not.toHaveBeenCalled();
  });

  it('prioritizes a first-page retry after a silent refresh fails', async () => {
    render(
      <ContinueWatching
        {...defaultProps}
        hasMore={false}
        loadError='refresh'
        playRecords={createPlayRecords(1)}
      />,
    );

    expect(screen.getByText('刷新失败')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重试加载继续观看' }));
      await Promise.resolve();
    });

    expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
    expect(defaultProps.onLoadMore).not.toHaveBeenCalled();
  });
});
