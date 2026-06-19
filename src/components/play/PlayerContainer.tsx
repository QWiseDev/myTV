import dynamic from 'next/dynamic';
import type { MutableRefObject } from 'react';
import { forwardRef } from 'react';

import type { ArtPlayerLike } from '@/app/play/utils/danmakuRuntime';

const SkipController = dynamic(() => import('@/components/SkipController'), {
  ssr: false,
});

interface PlayerContainerProps {
  // 播放器状态
  isVideoLoading?: boolean;
  videoLoadingStage?: string;

  // 跳过设置
  currentSource?: string;
  currentId?: string;
  detailTitle?: string;
  episodeIndex: number;
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  duration: number;
  isSkipSettingOpen: boolean;
  onSkipSettingChange: (open: boolean) => void;
  onNextEpisode?: () => void;

  // 样式和控制
  isEpisodeSelectorCollapsed: boolean;
  onToggleEpisodePanel?: () => void;
}

const PlayerContainer = forwardRef<HTMLDivElement, PlayerContainerProps>(
  (
    {
      isVideoLoading,
      videoLoadingStage,
      currentSource,
      currentId,
      detailTitle,
      episodeIndex,
      artPlayerRef,
      duration,
      isSkipSettingOpen,
      onSkipSettingChange,
      onNextEpisode,
      isEpisodeSelectorCollapsed,
      onToggleEpisodePanel,
    },
    ref,
  ) => {
    return (
      <div className='transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30'>
        <div className='relative w-full h-[350px] md:h-[450px] lg:h-[520px] xl:h-[600px] 2xl:h-[700px]'>
          {/* 播放器 */}
          <div
            ref={ref}
            className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
          ></div>

          {/* 控制按钮组 - 播放器内右上角 */}
          {currentSource && currentId && (
            <div className='absolute top-3 right-3 z-10 flex flex-col gap-1.5'>
              {/* 选集和换源面板控制按钮 */}
              {onToggleEpisodePanel && (
                <button
                  onClick={onToggleEpisodePanel}
                  className='group relative flex items-center justify-center w-8 h-8 rounded-lg text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 bg-gradient-to-r from-blue-500/80 to-cyan-500/80 hover:from-blue-600/85 hover:to-cyan-600/85 backdrop-blur-sm border border-white/20'
                  title={
                    isEpisodeSelectorCollapsed
                      ? '显示选集和换源面板'
                      : '隐藏选集和换源面板'
                  }
                  style={{
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  }}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-all duration-300 ${isEpisodeSelectorCollapsed ? 'rotate-0' : 'rotate-180'}`}
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2.5}
                      d='M15 19l-7-7 7-7'
                    />
                  </svg>
                  {/* 悬停时显示文字提示 */}
                  <div className='absolute right-full mr-2 top-1/2 transform -translate-y-1/2 px-2 py-1 bg-gray-900/90 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none'>
                    {isEpisodeSelectorCollapsed ? '显示面板' : '隐藏面板'}
                  </div>
                </button>
              )}

              {/* 跳过设置按钮 */}
              <button
                onClick={() => onSkipSettingChange(true)}
                className='group flex items-center justify-center w-8 h-8 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-lg border border-white/25 hover:border-white/35 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95'
                title='跳过设置'
                style={{
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                }}
              >
                <svg
                  className='w-3.5 h-3.5 text-white/90 drop-shadow-sm group-hover:rotate-90 transition-all duration-300'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2.5}
                    d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'
                  />
                </svg>
                {/* 悬停时显示文字提示 */}
                <div className='absolute right-full mr-2 top-1/2 transform -translate-y-1/2 px-2 py-1 bg-gray-900/90 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none'>
                  跳过设置
                </div>
              </button>
            </div>
          )}

          {/* SkipController 组件 */}
          {currentSource && currentId && detailTitle && (
            <SkipController
              source={currentSource}
              id={currentId}
              title={detailTitle}
              episodeIndex={episodeIndex}
              artPlayerRef={artPlayerRef}
              duration={duration}
              isSettingMode={isSkipSettingOpen}
              onSettingModeChange={onSkipSettingChange}
              onNextEpisode={onNextEpisode}
            />
          )}

          {/* 换源加载蒙层 */}
          {isVideoLoading && (
            <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex items-center justify-center z-[500] transition-all duration-300'>
              <div className='text-center max-w-md mx-auto px-6'>
                {/* 动画影院图标 */}
                <div className='relative mb-8'>
                  <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                    <div className='text-white text-4xl'>🎬</div>
                    {/* 旋转光环 */}
                    <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                  </div>

                  {/* 浮动粒子效果 */}
                  <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                    <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                    <div
                      className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                      style={{ animationDelay: '0.5s' }}
                    ></div>
                    <div
                      className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                      style={{ animationDelay: '1s' }}
                    ></div>
                  </div>
                </div>

                {/* 换源消息 */}
                <div className='space-y-2'>
                  <p className='text-xl font-semibold text-white animate-pulse'>
                    {videoLoadingStage === 'sourceChanging'
                      ? '🔄 切换播放源...如果没播放请切换播放源'
                      : '🔄 视频加载中...如果没播放请切换播放源'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);

PlayerContainer.displayName = 'PlayerContainer';

export default PlayerContainer;
