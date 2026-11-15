import { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualGridProps<T> {
  items: T[];
  itemHeight: number;
  gap: number;
  /** 固定列数（如爱奇艺的 5 列）；不传则按 minItemWidth 随容器宽度自适应 */
  columns?: number;
  /** 单个 item 的最小宽度（px），仅在未指定 columns 时用于自适应 */
  minItemWidth?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

/**
 * 虚拟滚动网格：只渲染可视区内的行。
 * 高度由父容器（flex-1 min-h-0）决定，不依赖固定数值。
 */
export function VirtualGrid<T>({
  items,
  itemHeight,
  gap,
  columns: columnsProp,
  minItemWidth,
  renderItem,
  overscan = 3,
}: VirtualGridProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 监听容器宽度变化，动态计算列数（无 ResizeObserver 的环境跳过）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setContainerWidth(container.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 容器宽度未测量到时（jsdom/首帧）用合理兜底值，真实浏览器由 ResizeObserver 校正
  const effectiveWidth = containerWidth || 400;
  const columns =
    columnsProp ??
    Math.max(1, Math.floor((effectiveWidth + gap) / ((minItemWidth ?? 64) + gap)));

  const rowHeight = itemHeight + gap;
  const totalRows = Math.ceil(items.length / columns);
  const totalHeight = totalRows * rowHeight;

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + (containerRef.current?.clientHeight || 600)) / rowHeight) +
      overscan,
  );

  const visibleItems = items.slice(startRow * columns, endRow * columns);

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
      className="overflow-y-auto flex-1 min-h-0 content-start pb-4"
      style={{ containerType: 'inline-size' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startRow * rowHeight,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: `${gap}px`,
          }}
        >
          {visibleItems.map((item, index) =>
            renderItem(item, startRow * columns + index)
          )}
        </div>
      </div>
    </div>
  );
}
