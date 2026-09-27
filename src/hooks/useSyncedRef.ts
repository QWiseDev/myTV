'use client';

import { useEffect, useRef } from 'react';

/**
 * 将一个值镜像到 ref：初始即为该值，随后每次渲染提交后同步为最新值。
 *
 * 等价于手写的
 *   const ref = useRef(value);
 *   useEffect(() => { ref.current = value; }, [value]);
 * 模式，用于在仅挂载一次的事件监听器/定时器闭包中读取最新状态。
 * 消费方在渲染期读取 ref.current 仍是上一次提交的值（与手写一致）。
 */
export function useSyncedRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
