import dynamic from 'next/dynamic';
import type { MutableRefObject } from 'react';
import { forwardRef, useEffect, useState } from 'react';

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
    // 触屏设备没有悬停，控件常显；鼠标设备按爱奇艺交互：悬停播放器才显示
    const [isCoarsePointer] = useState(
      () =>
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(pointer: coarse)')?.matches,
    );
    const [isHovered, setIsHovered] = useState(false);
    const showOverlay = isCoarsePointer || isHovered;

    // 底部进度条跟随悬停：播放中移开鼠标即隐藏，暂停/悬停时显示
    useEffect(() => {
      if (isCoarsePointer) return;
      let attempts = 0;
      let timer: ReturnType<typeof setInterval> | null = null;
      const attach = () => {
        const art = artPlayerRef.current as
          | (ArtPlayerLike & {
              controls?: { show: boolean };
              playing?: boolean;
              on?: (event: string, cb: () => void) => void;
              off?: (event: string, cb: () => void) => void;
            })
          | null;
        const controls = art?.controls;
        if (!art || !controls) return false;
        const apply = () => {
          controls.show = isHovered || !art.playing;
        };
        apply();
        const onPlay = () => {
          if (!isHovered) controls.show = false;
        };
        const onPause = () => {
          controls.show = true;
        };
        art.on?.('video:play', onPlay);
        art.on?.('video:pause', onPause);
        return true;
      };
      timer = setInterval(() => {
        if (attach() || ++attempts > 20) {
          if (timer) clearInterval(timer);
        }
      }, 300);
      return () => {
        if (timer) clearInterval(timer);
      };
    }, [isHovered, isCoarsePointer, artPlayerRef]);

    return (
      <div className='transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30 h-full'>
        {/* 高度参考爱奇艺剧场模式：小屏 16:9，lg 起铺满导航栏以下的视口 */}
        <div
          className='relative w-full h-[350px] md:aspect-video md:h-auto lg:aspect-auto lg:h-full'
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 播放器 */}
          <div
            ref={ref}
            className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
          ></div>

          {/* 顶部信息栏：悬停时显示 剧集名称 + 集数（爱奇艺式） */}
          {detailTitle && (
            <div
              className={`absolute top-0 left-0 right-0 z-10 flex items-center bg-gradient-to-b from-black/70 via-black/35 to-transparent px-3 py-2.5 transition-opacity duration-300 pointer-events-none rounded-t-xl ${
                showOverlay ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <span className='text-sm lg:text-base font-semibold text-white/95 truncate drop-shadow'>
                {detailTitle}
              </span>
              <span className='ml-3 text-xs lg:text-sm text-white/70 whitespace-nowrap'>
                第{episodeIndex + 1}集
              </span>
            </div>
          )}

          {/* 控制按钮组 - 播放器内右上角（悬停播放器时显示） */}
          {currentSource && currentId && (
            <div
              className={`absolute top-3 right-3 z-10 flex flex-col gap-1.5 transition-opacity duration-300 ${
                showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
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

          {/* 选集面板收起把手（爱奇艺式）：贴播放器右边框垂直居中，
              半透明毛玻璃，跟随播放器悬停显隐（与底部进度条一致） */}
          {onToggleEpisodePanel && (
            <button
              onClick={onToggleEpisodePanel}
              title={
                isEpisodeSelectorCollapsed
                  ? '显示选集和换源面板'
                  : '收起选集和换源面板'
              }
              aria-label={
                isEpisodeSelectorCollapsed
                  ? '显示选集和换源面板'
                  : '收起选集和换源面板'
              }
              className={`group absolute right-0 top-1/2 z-20 flex h-[110px] w-10 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-[#262626]/60 text-white/85 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-300 hover:bg-[#262626]/85 hover:text-white active:scale-95 ${
                showOverlay ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <svg
                className={`h-5 w-5 transition-transform duration-300 ${
                  isEpisodeSelectorCollapsed ? 'rotate-180' : 'rotate-0'
                }`}
                fill='none'
                stroke='currentColor'
                strokeWidth={2.5}
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M9 18l6-6-6-6'
                />
              </svg>
              {/* 悬停时显示文字提示 */}
              <div className='pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-900/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100'>
                {isEpisodeSelectorCollapsed ? '显示面板' : '收起面板'}
              </div>
            </button>
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
