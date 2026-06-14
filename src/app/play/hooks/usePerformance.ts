/**
 * 性能优化 Hooks
 * 提供节流、防抖等性能优化工具
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * 节流 Hook
 * 限制函数在指定时间内只执行一次
 *
 * @param callback 要节流的函数
 * @param delay 延迟时间（毫秒）
 * @returns 节流后的函数
 */
export function useThrottle<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
): T {
  const lastRun = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRun.current;

      if (timeSinceLastRun >= delay) {
        callback(...args);
        lastRun.current = now;
      } else {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          callback(...args);
          lastRun.current = Date.now();
        }, delay - timeSinceLastRun);
      }
    },
    [callback, delay],
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback;
}

/**
 * 防抖 Hook
 * 延迟执行函数，在延迟时间内如果再次调用则重新计时
 *
 * @param callback 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function useDebounce<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay],
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * 使用 RAF (requestAnimationFrame) 优化高频更新
 * 适合用于动画、滚动等场景
 *
 * @param callback 要执行的函数
 * @returns RAF 优化后的函数
 */
export function useRAF<T extends (...args: never[]) => unknown>(
  callback: T,
): T {
  const rafRef = useRef<number>();
  const latestArgs = useRef<Parameters<T>>();

  const rafCallback = useCallback(
    (...args: Parameters<T>) => {
      latestArgs.current = args;

      if (rafRef.current) {
        return;
      }

      rafRef.current = requestAnimationFrame(() => {
        callback(...(latestArgs.current as Parameters<T>));
        rafRef.current = undefined;
      });
    },
    [callback],
  ) as T;

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return rafCallback;
}
