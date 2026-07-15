import { fireEvent, render, screen } from '@testing-library/react';
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
        loadError={false}
        onRetry={jest.fn()}
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
        loadError={false}
        onRetry={jest.fn()}
        renderItem={(item) => <div>{item.title}</div>}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe('true');

    rerender(
      <LazyVideoSection
        title='热门电影'
        icon={Clock}
        linkHref='/douban'
        data={[movie]}
        loading={false}
        loadError={false}
        onRetry={jest.fn()}
        renderItem={(item) => <div>{item.title}</div>}
        enableAnimation={false}
      />,
    );

    expect(screen.getByTestId('scrollable-row').dataset.animation).toBe(
      'false',
    );
  });

  it('keeps stale cards visible and retries a failed refresh', () => {
    const onRetry = jest.fn();

    render(
      <LazyVideoSection
        title='热门电影'
        icon={Clock}
        linkHref='/douban'
        data={[movie]}
        loading={false}
        loadError
        onRetry={onRetry}
        renderItem={(item) => <div>{item.title}</div>}
      />,
    );

    expect(screen.getByText('影片 1')).toBeTruthy();
    expect(screen.getByText('刷新失败，当前显示已有内容')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重试加载热门电影' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an actionable failure instead of an empty row', () => {
    const onRetry = jest.fn();

    render(
      <LazyVideoSection
        title='热门电影'
        icon={Clock}
        linkHref='/douban'
        data={[]}
        loading={false}
        loadError
        onRetry={onRetry}
        renderItem={() => null}
      />,
    );

    expect(screen.getByText('热门电影加载失败，请稍后重试')).toBeTruthy();
    expect(screen.queryByTestId('scrollable-row')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '重试加载热门电影' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not cover stale cards with skeletons while retrying', () => {
    const onRetry = jest.fn();

    render(
      <LazyVideoSection
        title='热门电影'
        icon={Clock}
        linkHref='/douban'
        data={[movie]}
        loading
        loadError={false}
        onRetry={onRetry}
        renderItem={(item) => <div>{item.title}</div>}
      />,
    );

    expect(screen.getByText('影片 1')).toBeTruthy();
    expect(screen.getByText('正在重试，当前显示已有内容')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-row')).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: '重试加载热门电影',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
