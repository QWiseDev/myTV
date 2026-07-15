import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { PlayRecord } from '@/lib/types';

import ContinueWatching from './ContinueWatching';

jest.mock('@/components/HomeSectionHeader', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
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

jest.mock('@/components/VideoCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

function createPlayRecords(count: number): Record<string, PlayRecord> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `source+video-${index + 1}`,
      {
        cover: `https://example.com/${index + 1}.jpg`,
        index: 1,
        play_time: 10,
        save_time: count - index,
        search_title: `影片 ${index + 1}`,
        source_name: '测试源',
        title: `影片 ${index + 1}`,
        total_episodes: 12,
        total_time: 100,
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

describe('ContinueWatching', () => {
  beforeEach(() => {
    defaultProps.onLoadMore.mockClear();
    defaultProps.onRetry.mockClear();
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

  it('keeps the animated row structure when a second page is appended', () => {
    const { rerender } = render(
      <ContinueWatching
        {...defaultProps}
        playRecords={createPlayRecords(12)}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe('true');

    rerender(
      <ContinueWatching
        {...defaultProps}
        playRecords={createPlayRecords(13)}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe('true');
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
