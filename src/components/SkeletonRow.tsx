'use client';

import { SKELETON_CONFIG } from '@/lib/constants/home';

import HomeCardShell from './HomeCardShell';
import SkeletonCard from './SkeletonCard';

interface SkeletonRowProps {
  count?: number;
}

/**
 * 骨架屏行组件 - 用于内容加载时的占位显示
 * 减少首页重复代码，统一骨架屏样式
 */
export default function SkeletonRow({
  count = SKELETON_CONFIG.DEFAULT_COUNT,
}: SkeletonRowProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <HomeCardShell key={index}>
          <SkeletonCard />
        </HomeCardShell>
      ))}
    </>
  );
}
