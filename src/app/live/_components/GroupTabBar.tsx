import { type MutableRefObject, type RefObject, useEffect } from 'react';

import type { LiveChannel } from '../hooks/useLiveSources';

export interface GroupTabBarProps {
  groupedChannels: { [key: string]: LiveChannel[] };
  selectedGroup: string;
  isSwitchingSource: boolean;
  onGroupChange: (group: string) => void;
  groupContainerRef: RefObject<HTMLDivElement>;
  groupButtonRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}

/**
 * 直播页分组条：横向滚动的分组标签（含滚轮横向滚动与切换状态提示）。
 * 拆分自直播页原 JSX，事件回调原样透传；容器/按钮 refs 由页面持有，
 * 供滚动定位与 simulateGroupClick 使用。
 */
export function GroupTabBar({
  groupedChannels,
  selectedGroup,
  isSwitchingSource,
  onGroupChange,
  groupContainerRef,
  groupButtonRefs,
}: GroupTabBarProps) {
  useEffect(() => {
    const container = groupContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (container.scrollWidth > container.clientWidth) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [groupContainerRef]);

  return (
    <div className='flex items-center gap-4 mb-4 border-b border-gray-300 dark:border-gray-700 -mx-6 px-6 flex-shrink-0'>
      {/* 切换状态提示 */}
      {isSwitchingSource && (
        <div className='flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400'>
          <div className='w-2 h-2 bg-amber-500 rounded-full animate-pulse'></div>
          切换直播源中...
        </div>
      )}

      <div className='flex-1 overflow-x-auto' ref={groupContainerRef}>
        <div className='flex gap-4 min-w-max'>
          {Object.keys(groupedChannels).map((group, index) => (
            <button
              key={group}
              data-group={group}
              ref={(el) => {
                groupButtonRefs.current[index] = el;
              }}
              onClick={() => onGroupChange(group)}
              disabled={isSwitchingSource}
              className={`w-20 relative py-2 text-sm font-medium transition-colors flex-shrink-0 text-center overflow-hidden
             ${
               isSwitchingSource
                 ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                 : selectedGroup === group
                   ? 'text-green-500 dark:text-green-400'
                   : 'text-gray-700 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400'
             }
           `.trim()}
            >
              <div
                className='px-1 overflow-hidden whitespace-nowrap'
                title={group}
              >
                {group}
              </div>
              {selectedGroup === group && !isSwitchingSource && (
                <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 dark:bg-green-400' />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
