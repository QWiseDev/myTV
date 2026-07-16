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

function touchStart(target: Element) {
  fireEvent.touchStart(target, {
    touches: [{ clientX: 10, clientY: 10 }],
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
});
