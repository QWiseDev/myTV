'use client';

import { MessageSquare, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ComponentProps, RefObject, useState } from 'react';

import { SearchResult } from '@/lib/types';

import DanmakuPanel from '@/components/play/DanmakuPanel';
import PlayerContainer from '@/components/play/PlayerContainer';
import type VideoDetailsPanelComponent from '@/components/play/VideoDetailsPanel';

const EpisodePanel = dynamic(() => import('@/components/play/EpisodePanel'), {
  ssr: false,
  loading: () => <div className='h-20 bg-gray-800 animate-pulse rounded-lg' />,
});

const VideoDetailsPanelDynamic = dynamic(
  () => import('@/components/play/VideoDetailsPanel'),
  { ssr: false },
);

type PlayerContainerBaseProps = Omit<
  ComponentProps<typeof PlayerContainer>,
  'isEpisodeSelectorCollapsed'
>;

interface EpisodePanelConfig {
  detail: SearchResult | null;
  currentEpisodeIndex: number;
  totalEpisodes: number;
  onEpisodeChange: (episodeNumber: number) => void;
  onSourceChange?: (
    newSource: string,
    newId: string,
    newTitle: string,
  ) => void | Promise<void>;
  currentSource?: string;
  currentId?: string;
  videoTitle?: string;
  availableSources?: SearchResult[];
  onLoadSources?: () => boolean | Promise<boolean>;
  sourceSearchLoading?: boolean;
  sourceSearchError?: string | null;
  /** 访客（未登录）禁用换源 */
  disableSourceSwitch?: boolean;
}

interface PlayerAndEpisodeSectionProps {
  playerProps: PlayerContainerBaseProps;
  episodePanelProps: EpisodePanelConfig;
  playerRef: RefObject<HTMLDivElement>;
  /** 「详情」覆盖面板内容：视频信息 + 收藏 + 网盘（原播放器下方区块） */
  infoProps: ComponentProps<typeof VideoDetailsPanelComponent>;
  /** 「详情」覆盖面板内容：弹幕管理 */
  danmakuProps: Omit<ComponentProps<typeof DanmakuPanel>, 'key'>;
}

/**
 * 负责渲染播放器区域与右侧信息面板（爱奇艺式锁视口布局）：
 * 面板顶部常显片名与信息行，「详情 >」展开详情覆盖面板，页面本身不滚动。
 */
export default function PlayerAndEpisodeSection({
  playerProps,
  episodePanelProps,
  playerRef,
  infoProps,
  danmakuProps,
}: PlayerAndEpisodeSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showInfoOverlay, setShowInfoOverlay] = useState(false);
  const [showDanmuModal, setShowDanmuModal] = useState(false);

  return (
    <div className='space-y-4 h-full flex flex-col'>
      <div
        className={`grid gap-4 flex-1 min-h-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-4'
        }`}
      >
        <div className={`${!isCollapsed ? 'md:col-span-3' : ''}`}>
          <PlayerContainer
            ref={playerRef}
            {...playerProps}
            isEpisodeSelectorCollapsed={isCollapsed}
            onToggleEpisodePanel={() => setIsCollapsed(!isCollapsed)}
          />
        </div>

        {!isCollapsed && (
          <div className='md:col-span-1 flex flex-col h-full min-h-0 overflow-hidden relative bg-gray-50 dark:bg-[#111111]'>
            {/* 常态：片名 + 信息行 + 选集 */}
            <div className='flex-1 min-h-0 flex flex-col'>
              {/* 片名 + 详情入口 */}
              <div className='px-4 pt-4 pb-1 flex-shrink-0'>
                <div className='flex items-center justify-between gap-2'>
                  <h2 className='text-xl font-bold text-gray-900 dark:text-gray-100 truncate'>
                    {infoProps.videoTitle}
                  </h2>
                  <div className='flex flex-shrink-0 items-center gap-3 whitespace-nowrap'>
                    <button
                      onClick={() => setShowDanmuModal(true)}
                      className='flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-green-500'
                      aria-label='打开弹幕管理'
                    >
                      <MessageSquare size={14} />
                      弹幕
                    </button>
                    <button
                      onClick={() => setShowInfoOverlay(true)}
                      className='text-xs text-gray-400 transition-colors hover:text-white'
                    >
                      详情 &gt;
                    </button>
                  </div>
                </div>
                <div className='mt-1 text-xs text-gray-500 dark:text-gray-400 truncate'>
                  {infoProps.videoYear}
                  {infoProps.detail?.class
                    ? ` | ${infoProps.detail.class}`
                    : ''}
                </div>
              </div>

              {/* 选集（选集/换源，内部滚动） */}
              <div className='flex-1 min-h-0 flex flex-col'>
                <EpisodePanel
                  {...episodePanelProps}
                  isCollapsed={isCollapsed}
                />
              </div>
            </div>

            {/* 详情覆盖面板（点击「详情 >」展开，× 关闭） */}
            <div
              className={`absolute inset-0 z-30 bg-gray-900 dark:bg-[#0d0d0d] transition-transform duration-300 ease-out ${
                showInfoOverlay ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className='flex items-center justify-between px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/60 flex-shrink-0'>
                <h3 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                  详情
                </h3>
                <button
                  onClick={() => setShowInfoOverlay(false)}
                  className='w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors'
                  aria-label='关闭详情'
                >
                  <svg
                    className='w-5 h-5'
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
              <div className='absolute inset-0 top-[52px] overflow-y-auto p-3'>
                <VideoDetailsPanelDynamic {...infoProps} />
              </div>
            </div>
          </div>
        )}

        {/* 弹幕管理弹窗 */}
        {showDanmuModal && (
          <div className='fixed inset-0 z-50 flex items-center justify-center'>
            <div
              className='absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm'
              onClick={() => setShowDanmuModal(false)}
            />
            <div className='relative w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-[#111111]'>
              <button
                onClick={() => setShowDanmuModal(false)}
                className='absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                aria-label='关闭弹幕管理'
              >
                <X size={16} />
              </button>
              <div className='p-3 pt-2'>
                <DanmakuPanel
                  key={`${danmakuProps.title}-${danmakuProps.episodeIndex}`}
                  {...danmakuProps}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
