import { LucideIcon } from 'lucide-react';
import React from 'react';

interface SectionTitleProps {
  title: string;
  icon?: LucideIcon;
  iconColor?: string;
}

export default function SectionTitle({ title, icon: Icon }: SectionTitleProps) {
  return (
    <div className='relative inline-block group'>
      {/* 标题文本 */}
      <div className='flex items-center gap-2'>
        {/* 图标 */}
        {Icon && (
          <div className='text-[#b85c38] transition-transform duration-300 group-hover:scale-105 dark:text-[#e09a7a]'>
            <Icon size={24} strokeWidth={2.5} />
          </div>
        )}

        <h2 className='text-xl sm:text-2xl font-semibold tracking-normal text-[#141413] transition-all duration-300 dark:text-[#f8f6f0] font-display'>
          {title}
        </h2>
      </div>

      <div className='absolute -bottom-1 left-0 h-px w-0 rounded-full bg-[#b85c38] transition-all duration-500 ease-out group-hover:w-full dark:bg-[#e09a7a]' />
    </div>
  );
}
