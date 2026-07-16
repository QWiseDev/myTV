import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import React from 'react';

import { useLongPress } from './useLongPress';

function LongPressHarness({
  children,
  onClick,
  onLongPress,
}: {
  children?: React.ReactNode;
  onClick: () => void;
  onLongPress: () => void;
}) {
  const handlers = useLongPress({
    longPressDelay: 500,
    onClick,
    onLongPress,
  });

  return (
    <div data-testid='long-press-target' {...handlers}>
      {children}
    </div>
  );
}

function createTouch(identifier: number, clientX = 10, clientY = 10) {
  return { clientX, clientY, identifier };
}

function touchStart(target: Element, identifier = 1) {
  const touch = createTouch(identifier);
  fireEvent.touchStart(target, {
    changedTouches: [touch],
    touches: [touch],
  });
}

describe('useLongPress', () => {
  let originalVibrate: typeof navigator.vibrate;

  beforeEach(() => {
    jest.useFakeTimers();
    originalVibrate = navigator.vibrate;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: originalVibrate,
    });
  });

  it('cancels the pending gesture on touchcancel and allows the next gesture', () => {
    const onClick = jest.fn();
    const onLongPress = jest.fn();
    render(<LongPressHarness onClick={onClick} onLongPress={onLongPress} />);
    const target = screen.getByTestId('long-press-target');

    touchStart(target);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    fireEvent.touchCancel(target);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    touchStart(target);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('clears the pending timer when the component unmounts', () => {
    const onLongPress = jest.fn();
    const { unmount } = render(
      <LongPressHarness onClick={jest.fn()} onLongPress={onLongPress} />,
    );

    touchStart(screen.getByTestId('long-press-target'));
    unmount();
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not start a card gesture from a nested interactive element', () => {
    const onClick = jest.fn();
    const onLongPress = jest.fn();
    render(
      <LongPressHarness onClick={onClick} onLongPress={onLongPress}>
        <button type='button'>
          <svg data-testid='nested-icon' />
        </button>
      </LongPressHarness>,
    );

    const icon = screen.getByTestId('nested-icon');
    touchStart(icon);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    fireEvent.touchEnd(icon);

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not start a gesture when multiple touches are already present', () => {
    const onClick = jest.fn();
    const onLongPress = jest.fn();
    render(<LongPressHarness onClick={onClick} onLongPress={onLongPress} />);
    const target = screen.getByTestId('long-press-target');
    const firstTouch = createTouch(1);
    const secondTouch = createTouch(2, 20, 20);

    fireEvent.touchStart(target, {
      changedTouches: [firstTouch, secondTouch],
      touches: [firstTouch, secondTouch],
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    fireEvent.touchEnd(target, {
      changedTouches: [firstTouch],
      touches: [secondTouch],
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('cancels the gesture when a second touch joins', () => {
    const onClick = jest.fn();
    const onLongPress = jest.fn();
    render(
      <>
        <LongPressHarness onClick={onClick} onLongPress={onLongPress} />
        <div data-testid='outside-touch-target' />
      </>,
    );
    const target = screen.getByTestId('long-press-target');
    const secondTouchTarget = screen.getByTestId('outside-touch-target');
    const firstTouch = createTouch(1);
    const secondTouch = createTouch(2, 20, 20);

    touchStart(target);
    fireEvent.touchStart(secondTouchTarget, {
      changedTouches: [secondTouch],
      touches: [firstTouch, secondTouch],
    });
    fireEvent.touchEnd(secondTouchTarget, {
      changedTouches: [secondTouch],
      touches: [firstTouch],
    });
    fireEvent.touchEnd(target, {
      changedTouches: [firstTouch],
      touches: [],
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('allows the next tap when the external touch ends after the active touch', () => {
    const onClick = jest.fn();
    const onLongPress = jest.fn();
    render(
      <>
        <LongPressHarness onClick={onClick} onLongPress={onLongPress} />
        <div data-testid='outside-touch-target' />
      </>,
    );
    const target = screen.getByTestId('long-press-target');
    const outsideTarget = screen.getByTestId('outside-touch-target');
    const firstTouch = createTouch(1);
    const secondTouch = createTouch(2, 20, 20);

    touchStart(target);
    fireEvent.touchStart(outsideTarget, {
      changedTouches: [secondTouch],
      touches: [firstTouch, secondTouch],
    });
    fireEvent.touchEnd(target, {
      changedTouches: [firstTouch],
      touches: [secondTouch],
    });
    fireEvent.touchEnd(outsideTarget, {
      changedTouches: [secondTouch],
      touches: [],
    });

    touchStart(target, 3);
    fireEvent.touchEnd(target, {
      changedTouches: [createTouch(3)],
      touches: [],
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('cancels the gesture when the active touch is missing', () => {
    const onClick = jest.fn();
    const onLongPress = jest.fn();
    render(<LongPressHarness onClick={onClick} onLongPress={onLongPress} />);
    const target = screen.getByTestId('long-press-target');
    const replacementTouch = createTouch(2);

    touchStart(target);
    fireEvent.touchMove(target, {
      changedTouches: [replacementTouch],
      touches: [replacementTouch],
    });
    fireEvent.touchEnd(target, {
      changedTouches: [replacementTouch],
      touches: [],
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores the end of a non-active touch', () => {
    const onClick = jest.fn();
    const onLongPress = jest.fn();
    render(<LongPressHarness onClick={onClick} onLongPress={onLongPress} />);
    const target = screen.getByTestId('long-press-target');
    const activeTouch = createTouch(1);
    const otherTouch = createTouch(2, 20, 20);

    touchStart(target);
    fireEvent.touchEnd(target, {
      changedTouches: [otherTouch],
      touches: [activeTouch],
    });

    expect(onClick).not.toHaveBeenCalled();

    fireEvent.touchEnd(target, {
      changedTouches: [activeTouch],
      touches: [],
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
