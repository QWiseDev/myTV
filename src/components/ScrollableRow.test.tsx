import { act, cleanup, render, screen } from '@testing-library/react';

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

let mediaQueryMatches = false;
const mediaQueryListeners = new Set<(event: MediaQueryListEvent) => void>();
const addMediaQueryListener = jest.fn(
  (eventName: string, listener: (event: MediaQueryListEvent) => void) => {
    if (eventName === 'change') mediaQueryListeners.add(listener);
  },
);
const removeMediaQueryListener = jest.fn(
  (eventName: string, listener: (event: MediaQueryListEvent) => void) => {
    if (eventName === 'change') mediaQueryListeners.delete(listener);
  },
);
const mediaQueryList = {
  addEventListener: addMediaQueryListener,
  addListener: jest.fn(),
  dispatchEvent: jest.fn(),
  get matches() {
    return mediaQueryMatches;
  },
  media: '(min-width: 640px)',
  onchange: null,
  removeEventListener: removeMediaQueryListener,
  removeListener: jest.fn(),
} as unknown as MediaQueryList;

function changeMediaQueryMatches(matches: boolean) {
  mediaQueryMatches = matches;
  const event = {
    matches,
    media: mediaQueryList.media,
  } as MediaQueryListEvent;
  mediaQueryListeners.forEach((listener) => listener(event));
}

function setScrollMetrics(
  element: Element,
  metrics: { clientWidth: number; scrollLeft: number; scrollWidth: number },
) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: metrics.clientWidth },
    scrollLeft: {
      configurable: true,
      value: metrics.scrollLeft,
      writable: true,
    },
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
  });
}

describe('ScrollableRow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mediaQueryMatches = false;
    mediaQueryListeners.clear();
    addMediaQueryListener.mockClear();
    removeMediaQueryListener.mockClear();
    window.matchMedia = jest.fn().mockReturnValue(mediaQueryList);
    global.ResizeObserver = ResizeObserverMock;
  });

  afterEach(() => {
    cleanup();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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

  it('names both scroll controls and reveals them for keyboard focus', () => {
    mediaQueryMatches = true;
    const { container } = render(
      <ScrollableRow enableAnimation={false}>
        <div>第一项</div>
        <div>第二项</div>
      </ScrollableRow>,
    );
    const horizontalRow = container.querySelector('.overflow-x-auto');
    if (!horizontalRow) throw new Error('横向滚动容器未渲染');
    setScrollMetrics(horizontalRow, {
      clientWidth: 200,
      scrollLeft: 100,
      scrollWidth: 1000,
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    const leftButton = screen.getByRole('button', { name: '向左滚动' });
    const rightButton = screen.getByRole('button', { name: '向右滚动' });
    const leftControl = leftButton.parentElement?.parentElement;
    const rightControl = rightButton.parentElement?.parentElement;

    expect(leftControl?.className).toContain('focus-within:opacity-100');
    expect(rightControl?.className).toContain('focus-within:opacity-100');
    leftButton.focus();
    expect(document.activeElement).toBe(leftButton);
  });

  it('rechecks overflow when the desktop media query starts matching', () => {
    const { container, unmount } = render(
      <ScrollableRow enableAnimation={false}>
        <div>第一项</div>
        <div>第二项</div>
      </ScrollableRow>,
    );
    const horizontalRow = container.querySelector('.overflow-x-auto');
    if (!horizontalRow) throw new Error('横向滚动容器未渲染');
    setScrollMetrics(horizontalRow, {
      clientWidth: 200,
      scrollLeft: 0,
      scrollWidth: 1000,
    });

    expect(screen.queryByRole('button', { name: '向右滚动' })).toBeNull();

    act(() => {
      changeMediaQueryMatches(true);
      jest.runOnlyPendingTimers();
    });

    expect(screen.getByRole('button', { name: '向右滚动' })).toBeTruthy();
    expect(addMediaQueryListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    unmount();
    expect(removeMediaQueryListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    expect(mediaQueryListeners.size).toBe(0);
  });
});
