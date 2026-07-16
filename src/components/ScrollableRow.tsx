import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Children,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import AnimatedCardGrid from '@/components/AnimatedCardGrid';

const SCROLL_CONTROLS_MEDIA_QUERY = '(min-width: 640px)';

interface ScrollableRowProps {
  children: React.ReactNode;
  scrollDistance?: number;
  enableAnimation?: boolean;
}

function canUseScrollControls(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia(SCROLL_CONTROLS_MEDIA_QUERY).matches
  );
}

interface ScrollNavButtonProps {
  direction: 'left' | 'right';
  visible: boolean;
  isHovered: boolean;
  onClick: () => void;
}

function ScrollNavButton({
  direction,
  visible,
  isHovered,
  onClick,
}: ScrollNavButtonProps) {
  if (!visible) return null;

  const isLeft = direction === 'left';

  return (
    <div
      className={`hidden sm:flex absolute ${isLeft ? 'left-0' : 'right-0'} top-0 bottom-0 w-16 items-center justify-center z-[600] transition-opacity duration-200 focus-within:opacity-100 ${
        isHovered ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <div
        className='absolute inset-0 flex items-center justify-center'
        style={{
          top: '40%',
          bottom: '60%',
          ...(isLeft ? { left: '-4.5rem' } : { right: '-4.5rem' }),
          pointerEvents: 'auto',
        }}
      >
        <button
          type='button'
          aria-label={isLeft ? '向左滚动' : '向右滚动'}
          onClick={onClick}
          className='w-12 h-12 bg-white/95 rounded-full shadow-lg flex items-center justify-center hover:bg-white border border-gray-200 transition-transform hover:scale-105 dark:bg-gray-800/90 dark:hover:bg-gray-700 dark:border-gray-600'
        >
          {isLeft ? (
            <ChevronLeft className='w-6 h-6 text-gray-600 dark:text-gray-300' />
          ) : (
            <ChevronRight className='w-6 h-6 text-gray-600 dark:text-gray-300' />
          )}
        </button>
      </div>
    </div>
  );
}

function ScrollableRow({
  children,
  scrollDistance = 1000,
  enableAnimation = true,
}: ScrollableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const checkScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const checkScroll = useCallback(() => {
    if (!canUseScrollControls()) {
      setShowLeftScroll(false);
      setShowRightScroll(false);
      return;
    }

    if (containerRef.current) {
      const { scrollWidth, clientWidth, scrollLeft } = containerRef.current;

      // 计算是否需要左右滚动按钮
      const threshold = 1; // 容差值，避免浮点误差
      const canScrollRight =
        scrollWidth - (scrollLeft + clientWidth) > threshold;
      const canScrollLeft = scrollLeft > threshold;

      setShowRightScroll((prev) =>
        prev !== canScrollRight ? canScrollRight : prev,
      );
      setShowLeftScroll((prev) =>
        prev !== canScrollLeft ? canScrollLeft : prev,
      );
    }
  }, []);

  // 使用 useMemo 缓存 children 数量，减少不必要的 effect 触发
  const childrenCount = useMemo(() => Children.count(children), [children]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(SCROLL_CONTROLS_MEDIA_QUERY);

    const clearScheduledCheck = () => {
      if (checkScrollTimeoutRef.current) {
        clearTimeout(checkScrollTimeoutRef.current);
        checkScrollTimeoutRef.current = null;
      }
    };

    const scheduleCheck = () => {
      clearScheduledCheck();
      checkScrollTimeoutRef.current = setTimeout(checkScroll, 100);
    };

    const resizeObserver = new ResizeObserver(scheduleCheck);

    const syncScrollControls = () => {
      if (!mediaQuery.matches) {
        resizeObserver.disconnect();
        clearScheduledCheck();
        setShowLeftScroll(false);
        setShowRightScroll(false);
        return;
      }

      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      scheduleCheck();
    };

    mediaQuery.addEventListener('change', syncScrollControls);
    syncScrollControls();

    return () => {
      mediaQuery.removeEventListener('change', syncScrollControls);
      resizeObserver.disconnect();
      clearScheduledCheck();
    };
  }, [childrenCount, checkScroll]);

  const handleScrollBy = useCallback((distance: number) => {
    containerRef.current?.scrollBy({
      left: distance,
      behavior: 'smooth',
    });
  }, []);

  return (
    <div
      className='relative'
      onMouseEnter={() => {
        setIsHovered(true);
        if (canUseScrollControls()) {
          checkScroll();
        }
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={containerRef}
        className='flex space-x-4 sm:space-x-5 md:space-x-6 overflow-x-auto scrollbar-hide py-1 sm:py-2 pb-12 sm:pb-14 px-0'
        onScroll={checkScroll}
      >
        {enableAnimation ? (
          <AnimatedCardGrid className='flex space-x-4 sm:space-x-5 md:space-x-6'>
            {children}
          </AnimatedCardGrid>
        ) : (
          children
        )}
      </div>
      <ScrollNavButton
        direction='left'
        visible={showLeftScroll}
        isHovered={isHovered}
        onClick={() => handleScrollBy(-scrollDistance)}
      />
      <ScrollNavButton
        direction='right'
        visible={showRightScroll}
        isHovered={isHovered}
        onClick={() => handleScrollBy(scrollDistance)}
      />
    </div>
  );
}

export default memo(ScrollableRow);
