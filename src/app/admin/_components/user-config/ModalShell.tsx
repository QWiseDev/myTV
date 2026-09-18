'use client';

/**
 * 用户管理弹窗通用外壳：遮罩层 + 容器 + 标题栏
 */

import type { ReactNode } from 'react';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 容器最大宽度：'4xl'（默认）或 '2xl' */
  maxWidth?: '4xl' | '2xl';
  /** 是否限制高度并内部滚动 */
  scrollable?: boolean;
}

export function ModalShell({
  title,
  onClose,
  children,
  maxWidth = '4xl',
  scrollable = true,
}: ModalShellProps) {
  return (
    <div
      className='fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4'
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl ${
          maxWidth === '4xl' ? 'max-w-4xl' : 'max-w-2xl'
        } w-full ${scrollable ? 'max-h-[80vh] overflow-y-auto' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-6'>
          <div className='flex items-center justify-between mb-6'>
            <h3 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
              {title}
            </h3>
            <button
              onClick={onClose}
              className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors'
            >
              <svg
                className='w-6 h-6'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M6 18L18 6M6 6l12 12'
                />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
