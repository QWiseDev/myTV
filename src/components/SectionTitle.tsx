import { LucideIcon } from 'lucide-react';
import React from 'react';

interface SectionTitleProps {
  title: string;
  icon?: LucideIcon;
}

/**
 * 首页板块标题 - 暖色统一精致风格
 * 图标置于淡米色圆角描边容器内，统一品牌暖橙色，hover 时微浮起并加深描边
 */
export default function SectionTitle({ title, icon: Icon }: SectionTitleProps) {
  return (
    <div className='relative inline-flex group'>
      <div className='flex items-center gap-2.5'>
        {/* 图标容器：淡米色圆角描边 + 暖色图标，悬浮时微浮起 */}
        {Icon && (
          <div className='relative flex items-center justify-center w-8 h-8 rounded-lg bg-[#faf9f5] dark:bg-[#232220] ring-1 ring-[#e8e6dc] dark:ring-[#3d3934] shadow-sm text-[#b85c38] dark:text-[#e09a7a] transition-all duration-300 group-hover:scale-105 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:shadow-[#b85c38]/15 group-hover:ring-[#b85c38]/30 dark:group-hover:ring-[#e09a7a]/40 dark:group-hover:text-[#f0b195]'>
            <Icon size={18} strokeWidth={2.25} />
          </div>
        )}

        <h2 className='text-lg sm:text-xl font-semibold tracking-normal text-[#141413] transition-colors duration-300 group-hover:text-[#b85c38] dark:text-[#f8f6f0] dark:group-hover:text-[#f0b195] font-display'>
          {title}
        </h2>
      </div>

      {/* 悬浮展开的暖色渐变下划线 */}
      <div className='absolute -bottom-1.5 left-0 h-0.5 w-0 rounded-full bg-gradient-to-r from-[#b85c38] to-[#d97757] transition-all duration-500 ease-out group-hover:w-full' />
    </div>
  );
}
