import { act, renderHook } from '@testing-library/react';

import { useBackToTopController } from './useBackToTopController';

describe('useBackToTopController', () => {
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalScrollTo: typeof document.body.scrollTo;
  let nextFrameId: number;
  let frameCallbacks: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalScrollTo = document.body.scrollTo;
    nextFrameId = 1;
    frameCallbacks = new Map();

    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId++;
      frameCallbacks.set(frameId, callback);
      return frameId;
    });
    window.cancelAnimationFrame = jest.fn((frameId: number) => {
      frameCallbacks.delete(frameId);
    });
    document.body.scrollTo = jest.fn();
    document.body.scrollTop = 0;
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    document.body.scrollTo = originalScrollTo;
    document.body.scrollTop = 0;
  });

  it('只在滚动时调度一次 RAF，并合并连续事件', () => {
    const setShowBackToTop = jest.fn();
    renderHook(() => useBackToTopController({ setShowBackToTop }));

    expect(setShowBackToTop).toHaveBeenCalledWith(false);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    document.body.scrollTop = 400;
    act(() => {
      document.body.dispatchEvent(new Event('scroll'));
      document.body.dispatchEvent(new Event('scroll'));
      document.body.dispatchEvent(new Event('scroll'));
    });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

    const callback = frameCallbacks.values().next().value;
    act(() => {
      callback?.(0);
    });

    expect(setShowBackToTop).toHaveBeenLastCalledWith(true);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('卸载时取消尚未执行的 RAF', () => {
    const { unmount } = renderHook(() =>
      useBackToTopController({ setShowBackToTop: jest.fn() }),
    );

    act(() => {
      document.body.dispatchEvent(new Event('scroll'));
    });

    unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('平滑滚动回页面顶部', () => {
    const { result } = renderHook(() =>
      useBackToTopController({ setShowBackToTop: jest.fn() }),
    );

    act(() => {
      result.current.scrollToTop();
    });

    expect(document.body.scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 0,
    });
  });
});
