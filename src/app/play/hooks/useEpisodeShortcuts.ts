import { useEffect, useRef } from 'react';

/**
 * 统一注册剧集播放的快捷键，并保证始终使用最新的处理函数。
 */
export const useEpisodeKeyboardShortcuts = (
  handler: (event: KeyboardEvent) => void
) => {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handlerRef.current(event);
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);
};
