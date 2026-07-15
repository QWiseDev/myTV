import { render } from '@testing-library/react';

import ScrollableRow from './ScrollableRow';
import SkeletonRow from './SkeletonRow';

jest.mock('./AnimatedCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='animated-grid'>{children}</div>
  ),
}));

jest.mock('./SkeletonCard', () => ({
  __esModule: true,
  default: () => <div data-testid='skeleton-card' />,
}));

class ResizeObserverMock {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

describe('ScrollableRow skeleton composition', () => {
  beforeAll(() => {
    window.matchMedia = jest.fn().mockReturnValue({
      addEventListener: jest.fn(),
      addListener: jest.fn(),
      dispatchEvent: jest.fn(),
      matches: false,
      media: '',
      onchange: null,
      removeEventListener: jest.fn(),
      removeListener: jest.fn(),
    });
    global.ResizeObserver = ResizeObserverMock;
  });

  it('expands skeleton cards directly into the horizontal row when animation is disabled', () => {
    const { container } = render(
      <ScrollableRow enableAnimation={false}>
        <SkeletonRow count={3} />
      </ScrollableRow>,
    );

    const horizontalRow = container.querySelector('.overflow-x-auto');
    expect(horizontalRow).not.toBeNull();
    expect(horizontalRow?.children).toHaveLength(3);
  });
});
