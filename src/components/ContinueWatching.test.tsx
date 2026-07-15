import { render, screen } from '@testing-library/react';
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
  loading: false,
  loadingMore: false,
  onClearAll: jest.fn(),
  onDeleteRecord: jest.fn(),
  onLoadMore: jest.fn().mockResolvedValue(undefined),
  watchingUpdates: null,
};

describe('ContinueWatching', () => {
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
});
