import { render, screen } from '@testing-library/react';
import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';

import type { DoubanItem } from '@/lib/types';

import LazyVideoSection from './LazyVideoSection';

jest.mock('./HomeCardShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('./HomeSectionHeader', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

jest.mock('./ScrollableRow', () => ({
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

jest.mock('./SkeletonRow', () => ({
  __esModule: true,
  default: () => <div data-testid='skeleton-row' />,
}));

const movie: DoubanItem = {
  id: '1',
  poster: 'https://example.com/movie.jpg',
  rate: '8.0',
  title: '影片 1',
  year: '2026',
};

describe('LazyVideoSection', () => {
  it('disables row animation while loading skeletons', () => {
    render(
      <LazyVideoSection
        title='热门电影'
        icon={Clock}
        linkHref='/douban'
        data={[]}
        loading
        renderItem={() => null}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe(
      'false',
    );
  });

  it('preserves the configured animation setting after loading', () => {
    const { rerender } = render(
      <LazyVideoSection
        title='热门电影'
        icon={Clock}
        linkHref='/douban'
        data={[movie]}
        loading={false}
        renderItem={(item) => <div>{item.title}</div>}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe(
      'true',
    );

    rerender(
      <LazyVideoSection
        title='热门电影'
        icon={Clock}
        linkHref='/douban'
        data={[movie]}
        loading={false}
        renderItem={(item) => <div>{item.title}</div>}
        enableAnimation={false}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe(
      'false',
    );
  });
});
