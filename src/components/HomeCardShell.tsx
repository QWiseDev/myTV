import type { ReactNode } from 'react';

import {
  HOME_CARD_WIDTH_CLASS,
} from '@/lib/constants/home';

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
