import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';

import type { SearchResult } from '@/lib/types';

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function MockGrid({
      cellComponent: CellComponent,
      cellProps,
    }: {
      cellComponent: ComponentType<Record<string, unknown>>;
      cellProps: Record<string, unknown>;
    }) {
      return (
        <CellComponent
          {...cellProps}
          ariaAttributes={{}}
          columnIndex={0}
          rowIndex={0}
          style={{}}
        />
      );
    },
}));

jest.mock('@/hooks/useResponsiveGrid', () => ({
  useResponsiveGrid: () => ({
    columnCount: 1,
    containerWidth: 800,
    itemHeight: 300,
    itemWidth: 200,
  }),
}));

jest.mock('@/components/VideoCard', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    __esModule: true,
    default: React.forwardRef(
      (
        {
          douban_id,
          episodes,
          source_names,
        }: {
          douban_id?: number;
          episodes?: number;
          source_names?: string[];
        },
        _ref,
      ) => (
        <div data-testid='video-card-stats'>
          {episodes}|{source_names?.join(',')}|{douban_id}
        </div>
      ),
    ),
  };
});

let VirtualSearchGrid: typeof import('./VirtualSearchGrid').VirtualSearchGrid;

function createResult(
  id: string,
  sourceName: string,
  episodeCount: number,
  doubanId: number,
): SearchResult {
  return {
    id,
    title: '测试影片',
    poster: 'https://cdn.example/poster.jpg',
    episodes: Array.from({ length: episodeCount }, (_, index) =>
      String(index + 1),
    ),
    episodes_titles: [],
    source: `source-${id}`,
    source_name: sourceName,
    year: '2026',
    douban_id: doubanId,
  };
}

function computeGroupStats(group: SearchResult[]) {
  return {
    episodes: Math.max(...group.map((item) => item.episodes.length)),
    source_names: group.map((item) => item.source_name),
    douban_id: group[group.length - 1]?.douban_id,
  };
}

describe('VirtualSearchGrid', () => {
  beforeAll(async () => {
    VirtualSearchGrid = (await import('./VirtualSearchGrid')).VirtualSearchGrid;
  });

  it('passes updated aggregate stats directly to the visible card', () => {
    const firstGroup = [createResult('a', '源 A', 1, 100)];
    const renderGrid = (group: SearchResult[]) => (
      <VirtualSearchGrid
        filteredResults={[]}
        filteredAggResults={[['group-a', group]]}
        viewMode='agg'
        searchQuery='测试影片'
        isLoading={false}
        computeGroupStats={computeGroupStats}
      />
    );
    const { rerender } = render(renderGrid(firstGroup));

    expect(screen.getByTestId('video-card-stats').textContent).toBe(
      '1|源 A|100',
    );

    rerender(renderGrid([...firstGroup, createResult('b', '源 B', 12, 200)]));

    expect(screen.getByTestId('video-card-stats').textContent).toBe(
      '12|源 A,源 B|200',
    );
  });
});
