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

    let running = true;
    let lastCheck = 0;
    const throttleInterval = 200; // ✅ 限制检查频率为 200ms（5Hz），降低 CPU 占用
    
    const checkScrollPosition = () => {
      if (!running) return;
      
      const now = Date.now();
      if (now - lastCheck >= throttleInterval) {
        lastCheck = now;
        setShowBackToTop(getScrollTop() > 300);
      }
      
      requestAnimationFrame(checkScrollPosition);
    };

    checkScrollPosition();

    // ✅ scroll 事件已经有节流，但可以进一步优化
    let scrollTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      if (scrollTimeout) return; // 防抖：已有待执行的更新
      
      scrollTimeout = setTimeout(() => {
        setShowBackToTop(getScrollTop() > 300);
        scrollTimeout = null;
      }, 100); // 100ms 防抖
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      running = false;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      document.body.removeEventListener('scroll', handleScroll);
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
