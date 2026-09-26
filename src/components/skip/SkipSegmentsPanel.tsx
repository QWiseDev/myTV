'use client';

import type { MutableRefObject } from 'react';

import type { SkipSegment } from '@/lib/db.client';

import { formatTime } from './skipTimeFormat';

interface SkipSegmentsPanelProps {
  segments: SkipSegment[];
  onDeleteSegment: (index: number) => void;
  onOpenSettings: () => void;
  panelRef: MutableRefObject<HTMLDivElement | null>;
  position: { x: number; y: number };
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
}

/**
 * 管理已有跳过片段的可拖动面板。从 SkipController 拆出，行为保持一致。
 */
export function SkipSegmentsPanel({
  segments,
  onDeleteSegment,
  onOpenSettings,
  panelRef,
  position,
  isDragging,
  onMouseDown,
  onTouchStart,
}: SkipSegmentsPanelProps) {
  return (
    <div
      ref={panelRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default',
        userSelect: isDragging ? 'none' : 'auto',
      }}
      className='z-[9998] max-w-sm bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 animate-fade-in'
    >
      <div className='p-3'>
        <h4 className='drag-handle font-medium mb-2 text-gray-900 dark:text-gray-100 text-sm flex items-center cursor-move select-none'>
          <svg
            className='w-4 h-4 mr-1'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M13 5l7 7-7 7M5 5l7 7-7 7'
            />
          </svg>
          跳过配置
          <span className='ml-auto text-xs text-gray-500 dark:text-gray-400'>
            可拖动
          </span>
        </h4>
        <div className='space-y-1'>
          {segments.map((segment, index) => (
            <div
              key={index}
              className='flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs'
            >
              <span className='text-gray-800 dark:text-gray-200 flex-1 mr-2'>
                <span className='font-medium'>
                  {segment.type === 'opening' ? '🎬片头' : '🎭片尾'}
                </span>
                <br />
                <span className='text-gray-600 dark:text-gray-400'>
                  {formatTime(segment.start)} - {formatTime(segment.end)}
                </span>
                {segment.autoSkip && (
                  <span className='ml-1 px-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded text-xs'>
                    自动
                  </span>
                )}
              </span>
              <button
                onClick={() => onDeleteSegment(index)}
                className='px-1.5 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-colors flex-shrink-0'
                title='删除'
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className='mt-2 pt-2 border-t border-gray-200 dark:border-gray-600'>
          <button
            onClick={onOpenSettings}
            className='w-full px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded text-xs transition-colors'
          >
            修改配置
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
