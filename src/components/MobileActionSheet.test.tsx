import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import React from 'react';

import type { MobileAction } from '@/hooks/useMobileActions';

import MobileActionSheet from './MobileActionSheet';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement('img', props),
}));

function createAction(
  id: string,
  label: string,
  onClick = jest.fn(),
): MobileAction {
  return {
    id,
    label,
    icon: <span aria-hidden='true' />,
    onClick,
  };
}

function renderSheet({
  actions = [createAction('play', '播放')],
  isOpen = true,
  onClose = jest.fn(),
  onExited = jest.fn(),
}: {
  actions?: MobileAction[];
  isOpen?: boolean;
  onClose?: jest.Mock;
  onExited?: jest.Mock;
} = {}) {
  const props = {
    actions,
    isOpen,
    onClose,
    onExited,
    sources: ['源 A', '源 B', '源 C'],
    isAggregate: true,
    title: '测试影片',
  };

  const view = render(<MobileActionSheet {...props} />);
  return {
    ...view,
    rerenderSheet(nextIsOpen: boolean) {
      view.rerender(<MobileActionSheet {...props} isOpen={nextIsOpen} />);
    },
  };
}

describe('MobileActionSheet', () => {
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalScrollTo: typeof window.scrollTo;

  beforeEach(() => {
    jest.useFakeTimers();
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalScrollTo = window.scrollTo;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    window.cancelAnimationFrame = jest.fn();
    window.scrollTo = jest.fn();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.scrollTo = originalScrollTo;
    document.querySelectorAll('[data-test-opener]').forEach((element) => {
      element.remove();
    });
  });

  it('exposes modal semantics and one viewport-bounded scroll region', () => {
    renderSheet();

    const dialog = screen.getByRole('dialog', { name: '测试影片' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.style.maxHeight).toContain('100dvh');
    expect(dialog.parentElement?.style.touchAction).not.toBe('none');
    expect(dialog.querySelectorAll('.overflow-y-auto')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '关闭操作菜单' })).not.toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '播放' }),
    );
  });

  it('keeps keyboard focus inside the open dialog', () => {
    renderSheet({
      actions: [
        createAction('play', '播放'),
        createAction('favorite', '添加收藏'),
      ],
    });

    const closeButton = screen.getByRole('button', {
      name: '关闭操作菜单',
    });
    const lastAction = screen.getByRole('button', { name: '添加收藏' });

    lastAction.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastAction);
  });

  it('runs at most one action while the current sheet is closing', () => {
    const action = jest.fn();
    const onClose = jest.fn();
    renderSheet({
      actions: [createAction('favorite', '添加收藏', action)],
      onClose,
    });

    const favoriteAction = screen.getByRole('button', {
      name: '添加收藏',
    });
    fireEvent.click(favoriteAction);
    fireEvent.click(favoriteAction);

    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus only after the exit animation completes', () => {
    const opener = document.createElement('button');
    opener.dataset.testOpener = 'true';
    document.body.appendChild(opener);
    opener.focus();
    const onExited = jest.fn();

    const { rerenderSheet } = renderSheet({ onExited });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '播放' }),
    );

    rerenderSheet(false);
    const dialog = screen.getByRole('dialog', { name: '测试影片' });
    expect(document.activeElement).toBe(dialog);

    const tabEvent = createEvent.keyDown(document, {
      key: 'Tab',
      cancelable: true,
    });
    fireEvent(document, tabEvent);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);

    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(document.activeElement).toBe(dialog);
    expect(onExited).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.activeElement).toBe(opener);
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('cancels StrictMode scroll restoration while the sheet remains open', () => {
    let animationId = 0;
    const animationCallbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      animationId += 1;
      animationCallbacks.set(animationId, callback);
      return animationId;
    });
    window.cancelAnimationFrame = jest.fn((id: number) => {
      animationCallbacks.delete(id);
    });

    const flushAnimationFrame = () => {
      const callbacks = Array.from(animationCallbacks.entries());
      animationCallbacks.clear();
      callbacks.forEach(([, callback]) => callback(0));
    };

    render(
      <React.StrictMode>
        <MobileActionSheet
          actions={[createAction('play', '播放')]}
          isOpen
          onClose={jest.fn()}
          onExited={jest.fn()}
          title='测试影片'
        />
      </React.StrictMode>,
    );

    act(() => {
      flushAnimationFrame();
      flushAnimationFrame();
    });

    expect(document.body.style.position).toBe('fixed');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
