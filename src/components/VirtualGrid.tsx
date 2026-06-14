import { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualGridProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  gap: number;
  columns: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

export function VirtualGrid<T>({
  items,
  itemHeight,
  containerHeight,
  gap,
  columns,
  renderItem,
  overscan = 3,
}: VirtualGridProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const rowHeight = itemHeight + gap;
  const totalRows = Math.ceil(items.length / columns);
  const totalHeight = totalRows * rowHeight;

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  );

  const visibleItems = items.slice(
    startRow * columns,
    endRow * columns
  );

  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto flex-1 content-start pb-4"
      style={{ height: containerHeight }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startRow * rowHeight,
            left: 0,
            right: 0,
          }}
          className="flex flex-wrap gap-3"
        >
          {visibleItems.map((item, index) =>
            renderItem(item, startRow * columns + index)
          )}
        </div>
      </div>
    </div>
  );
}
