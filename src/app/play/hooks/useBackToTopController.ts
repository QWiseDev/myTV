'use client';

import { useCallback, useEffect } from 'react';

interface UseBackToTopControllerOptions {
  setShowBackToTop: (visible: boolean) => void;
}

/**
 * 统一管理返回顶部按钮的可见性与滚动行为
 */
export function useBackToTopController({
  setShowBackToTop,
}: UseBackToTopControllerOptions) {
  useEffect(() => {
    const getScrollTop = () => document.body.scrollTop || 0;
    let frameId: number | null = null;

    const updateVisibility = () => {
      frameId = null;
      setShowBackToTop(getScrollTop() > 300);
    };

    const handleScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.body.removeEventListener('scroll', handleScroll);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [setShowBackToTop]);

  const scrollToTop = useCallback(() => {
    try {
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      console.warn('平滑滚动失败，使用兜底方案:', error);
      document.body.scrollTop = 0;
    }
  }, []);

  return { scrollToTop };
}
