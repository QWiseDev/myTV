import type { ReactNode } from 'react';

// 布局类需保留在 Tailwind content 扫描范围内，避免生产 CSS 被裁剪。
export const HOME_CARD_WIDTH_CLASS =
  'flex-shrink-0 min-w-[7.5rem] w-[7.5rem] sm:min-w-[11rem] sm:w-[11rem] md:min-w-[12.5rem] md:w-[12.5rem] lg:min-w-[13.75rem] lg:w-[13.75rem]';

interface HomeCardShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * 首页横向卡片外壳 — 统一海报卡宽度，避免各区块 class 重复
 */
export default function HomeCardShell({
  children,
  className = '',
}: HomeCardShellProps) {
  // flex-shrink-0 已在 HOME_CARD_WIDTH_CLASS 中，防止横滑行被挤压变窄
  const mergedClassName = className
    ? `${HOME_CARD_WIDTH_CLASS} ${className}`
    : HOME_CARD_WIDTH_CLASS;

  return <div className={mergedClassName}>{children}</div>;
}
