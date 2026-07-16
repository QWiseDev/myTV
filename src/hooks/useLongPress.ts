import { useCallback, useEffect, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  longPressDelay?: number;
  moveThreshold?: number;
}

interface TouchPosition {
  x: number;
  y: number;
}

export const useLongPress = ({
  onLongPress,
  onClick,
  longPressDelay = 500,
  moveThreshold = 10,
}: UseLongPressOptions) => {
  const isLongPress = useRef(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const startPosition = useRef<TouchPosition | null>(null);
  const isActive = useRef(false); // 防止重复触发
  const activeTouchIdentifier = useRef<number | null>(null);
  const globalTouchStartListener = useRef<((event: TouchEvent) => void) | null>(
    null,
  );
  const suppressClick = useRef(false);

  const clearTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const detachGlobalTouchGuard = useCallback(() => {
    if (!globalTouchStartListener.current) return;

    document.removeEventListener(
      'touchstart',
      globalTouchStartListener.current,
      true,
    );
    globalTouchStartListener.current = null;
  }, []);

  const resetGesture = useCallback(() => {
    clearTimer();
    detachGlobalTouchGuard();
    isLongPress.current = false;
    startPosition.current = null;
    isActive.current = false;
    activeTouchIdentifier.current = null;
  }, [clearTimer, detachGlobalTouchGuard]);

  const cancelMultiTouchGesture = useCallback(() => {
    suppressClick.current = true;
    resetGesture();
  }, [resetGesture]);

  const handleStart = useCallback(
    (clientX: number, clientY: number, touchIdentifier: number) => {
      // 如果已经有活跃的手势，忽略新的开始
      if (isActive.current) {
        return;
      }

      isActive.current = true;
      isLongPress.current = false;
      startPosition.current = { x: clientX, y: clientY };
      activeTouchIdentifier.current = touchIdentifier;

      const handleAdditionalTouch = (event: TouchEvent) => {
        if (event.touches.length > 1) {
          cancelMultiTouchGesture();
        }
      };
      globalTouchStartListener.current = handleAdditionalTouch;
      document.addEventListener('touchstart', handleAdditionalTouch, {
        capture: true,
        passive: true,
      });

      pressTimer.current = setTimeout(() => {
        // 再次检查是否仍然活跃
        if (!isActive.current) return;

        pressTimer.current = null;
        isLongPress.current = true;

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        // 触发长按事件
        onLongPress();
      }, longPressDelay);
    },
    [cancelMultiTouchGesture, longPressDelay, onLongPress],
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!startPosition.current || !isActive.current) return;

      const distance = Math.sqrt(
        Math.pow(clientX - startPosition.current.x, 2) +
          Math.pow(clientY - startPosition.current.y, 2),
      );

      // 如果移动距离超过阈值，取消长按
      if (distance > moveThreshold) {
        resetGesture();
      }
    },
    [moveThreshold, resetGesture],
  );

  const handleEnd = useCallback(() => {
    if (!isActive.current) return;

    // 根据情况决定是否触发点击事件：
    // 1. 如果是长按，不触发点击
    // 2. 否则触发点击
    const shouldClick = !isLongPress.current && Boolean(onClick);

    resetGesture();
    if (shouldClick) {
      onClick?.();
    }
  }, [onClick, resetGesture]);

  useEffect(
    () => () => {
      suppressClick.current = false;
      resetGesture();
    },
    [resetGesture],
  );

  // 触摸事件处理器
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (suppressClick.current && e.touches.length === 1) {
        suppressClick.current = false;
      }

      if (e.touches.length !== 1) {
        cancelMultiTouchGesture();
        return;
      }

      const target = e.target as HTMLElement;
      const interactiveElement = target.closest(
        'button, a, input, select, textarea, [role="button"], [role="link"]',
      );
      if (interactiveElement && interactiveElement !== e.currentTarget) return;

      // 阻止默认的长按行为，但不阻止触摸开始事件
      const touch = e.touches[0];
      if (!touch) return;
      handleStart(touch.clientX, touch.clientY, touch.identifier);
    },
    [cancelMultiTouchGesture, handleStart],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isActive.current) return;

      if (e.touches.length !== 1) {
        cancelMultiTouchGesture();
        return;
      }

      const touch = Array.from(e.touches).find(
        ({ identifier }) => identifier === activeTouchIdentifier.current,
      );
      if (!touch) {
        cancelMultiTouchGesture();
        return;
      }

      handleMove(touch.clientX, touch.clientY);
    },
    [cancelMultiTouchGesture, handleMove],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
        if (e.touches.length === 0) {
          suppressClick.current = false;
        }
        return;
      }

      if (!isActive.current) return;

      const touchEnded = Array.from(e.changedTouches).some(
        ({ identifier }) => identifier === activeTouchIdentifier.current,
      );
      if (!touchEnded) {
        const activeTouchStillPresent = Array.from(e.touches).some(
          ({ identifier }) => identifier === activeTouchIdentifier.current,
        );
        if (!activeTouchStillPresent || e.touches.length !== 1) {
          cancelMultiTouchGesture();
        }
        return;
      }

      if (e.touches.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        cancelMultiTouchGesture();
        return;
      }

      // 始终阻止默认行为，避免任何系统长按菜单
      e.preventDefault();
      e.stopPropagation();
      handleEnd();
    },
    [cancelMultiTouchGesture, handleEnd],
  );

  const onTouchCancel = useCallback(() => {
    suppressClick.current = false;
    resetGesture();
  }, [resetGesture]);

  return {
    onTouchCancel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
};
