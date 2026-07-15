import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { BangumiCalendarData } from '@/lib/bangumi.client';

import BangumiSection from './BangumiSection';

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
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid='scrollable-row'>{children}</div>
  ),
}));

jest.mock('./SkeletonRow', () => ({
  __esModule: true,
  default: () => <div data-testid='skeleton-row' />,
}));

jest.mock('./VideoCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => (
    <div data-testid='video-card'>{title}</div>
  ),
}));

function createCalendar(
  weekday: string,
  itemCount: number,
  titlePrefix = '动画',
): BangumiCalendarData[] {
  return [
    {
      weekday: { en: weekday },
      items: Array.from({ length: itemCount }, (_, index) => ({
        id: index + 1,
        name: `${titlePrefix} ${index + 1}`,
        images: { medium: `https://example.com/${index + 1}.jpg` },
      })),
    },
  ];
}

describe('BangumiSection', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the data loading skeleton without rendering cards', async () => {
    render(
      <BangumiSection
        bangumiCalendarData={[]}
        loading
        loadError={false}
        onRetry={jest.fn()}
      />,
    );

    expect(await screen.findByTestId('skeleton-row')).toBeTruthy();
    expect(screen.queryByTestId('video-card')).toBeNull();
  });

  it('renders at most twelve cards for the current weekday', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T17:00:00.000Z'));

    render(
      <BangumiSection
        bangumiCalendarData={createCalendar('Thu', 13)}
        loading={false}
        loadError={false}
        onRetry={jest.fn()}
      />,
    );

    expect(await screen.findAllByTestId('video-card')).toHaveLength(12);
    expect(screen.getByText('动画 1')).toBeTruthy();
    expect(screen.queryByText('动画 13')).toBeNull();
  });

  it('uses the Shanghai weekday when the server runtime is still on the previous UTC day', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T17:00:00.000Z'));
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(3);
    const calendar = [
      ...createCalendar('Wed', 1, 'UTC 周三'),
      ...createCalendar('Thu', 1, '上海周四'),
    ];

    render(
      <BangumiSection
        bangumiCalendarData={calendar}
        loading={false}
        loadError={false}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText('上海周四 1')).toBeTruthy();
    expect(screen.queryByText('UTC 周三 1')).toBeNull();
  });

  it('reselects the weekday when the component rerenders after midnight', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T17:00:00.000Z'));
    const calendar = [
      ...createCalendar('Thu', 1, '周四'),
      ...createCalendar('Fri', 1, '周五'),
    ];
    const { rerender } = render(
      <BangumiSection
        bangumiCalendarData={calendar}
        loading={false}
        loadError={false}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText('周四 1')).toBeTruthy();

    jest.setSystemTime(new Date('2026-07-16T17:00:00.000Z'));
    rerender(
      <BangumiSection
        bangumiCalendarData={calendar}
        loading={false}
        loadError={false}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText('周五 1')).toBeTruthy();
    expect(screen.queryByText('周四 1')).toBeNull();
  });

  it('keeps stale cards visible and retries a failed refresh', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T17:00:00.000Z'));
    const onRetry = jest.fn();

    render(
      <BangumiSection
        bangumiCalendarData={createCalendar('Thu', 1)}
        loading={false}
        loadError
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('动画 1')).toBeTruthy();
    expect(screen.getByText('刷新失败，当前显示已有内容')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重试加载新番放送' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an actionable failure when no calendar data is available', () => {
    const onRetry = jest.fn();

    render(
      <BangumiSection
        bangumiCalendarData={[]}
        loading={false}
        loadError
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('新番放送加载失败，请稍后重试')).toBeTruthy();
    expect(screen.queryByTestId('scrollable-row')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '重试加载新番放送' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not cover stale cards with skeletons while retrying', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T17:00:00.000Z'));

    render(
      <BangumiSection
        bangumiCalendarData={createCalendar('Thu', 1)}
        loading
        loadError={false}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText('动画 1')).toBeTruthy();
    expect(screen.getByText('正在重试，当前显示已有内容')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-row')).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: '重试加载新番放送',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
