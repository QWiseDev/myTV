import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { BangumiCalendarData } from '@/lib/bangumi.client';
import { WEEKDAY_NAMES } from '@/lib/constants/home';

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

function createCalendar(itemCount: number): BangumiCalendarData[] {
  return [
    {
      weekday: { en: WEEKDAY_NAMES[new Date().getDay()] },
      items: Array.from({ length: itemCount }, (_, index) => ({
        id: index + 1,
        name: `动画 ${index + 1}`,
        images: { medium: `https://example.com/${index + 1}.jpg` },
      })),
    },
  ];
}

describe('BangumiSection', () => {
  it('shows the data loading skeleton without rendering cards', async () => {
    render(<BangumiSection bangumiCalendarData={[]} loading />);

    expect(await screen.findByTestId('skeleton-row')).toBeTruthy();
    expect(screen.queryByTestId('video-card')).toBeNull();
  });

  it('renders at most twelve cards for the current weekday', async () => {
    render(
      <BangumiSection
        bangumiCalendarData={createCalendar(13)}
        loading={false}
      />,
    );

    expect(await screen.findAllByTestId('video-card')).toHaveLength(12);
    expect(screen.getByText('动画 1')).toBeTruthy();
    expect(screen.queryByText('动画 13')).toBeNull();
  });
});
