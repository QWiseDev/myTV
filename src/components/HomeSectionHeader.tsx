import { type LucideIcon, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { HOME_SECTION_LINK_CLASS } from '@/lib/constants/home';

import SectionTitle from './SectionTitle';

interface HomeSectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  /** 「查看更多」目标路径 */
  linkHref?: string;
  linkLabel?: string;
  /** 自定义右侧操作（如清空按钮），优先级高于 linkHref */
  action?: ReactNode;
}

/**
 * 首页区块标题栏 — 统一 SectionTitle + 查看更多/操作区布局
 */
export default function HomeSectionHeader({
  title,
  icon,
  linkHref,
  linkLabel = '查看更多',
  action,
}: HomeSectionHeaderProps) {
  return (
    <div className='mb-4 flex items-center justify-between'>
      <SectionTitle title={title} icon={icon} />
      {action}
      {!action && linkHref ? (
        <Link href={linkHref} className={HOME_SECTION_LINK_CLASS}>
          {linkLabel}
          <ChevronRight className='w-4 h-4 ml-1' />
        </Link>
      ) : null}
    </div>
  );
}
