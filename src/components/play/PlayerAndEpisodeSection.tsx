'use client';

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
  precomputedVideoInfo?: Map<
    string,
    { quality: string; loadSpeed: string; pingTime: number }
  >;
}

interface PlayerAndEpisodeSectionProps {
  playerProps: PlayerContainerBaseProps;
  episodePanelProps: EpisodePanelConfig;
  playerRef: RefObject<HTMLDivElement>;
  /** 右侧「详情」标签页：视频信息 + 收藏 + 网盘（原播放器下方区块） */
  infoProps: ComponentProps<typeof VideoDetailsPanelComponent>;
  /** 右侧「详情」标签页：弹幕管理（原播放器下方区块） */
  danmakuProps: Omit<ComponentProps<typeof DanmakuPanel>, 'key'>;
}

type RightTab = 'episodes' | 'info';

const TAB_STYLES = (active: boolean) =>
  `flex-1 py-3 px-4 text-center text-sm font-medium cursor-pointer transition-all duration-200 border-b-2 ${
    active
      ? 'text-green-400 border-green-400 bg-green-400/5'
      : 'text-gray-400 border-transparent hover:text-gray-200'
  }`;

/**
 * 负责渲染播放器区域与右侧面板（选集/详情双标签），爱奇艺式锁视口布局：
 * 播放器铺满上方，右侧信息框一栏到底，页面本身不滚动。
 */
export default function PlayerAndEpisodeSection({
  playerProps,
  episodePanelProps,
  playerRef,
  infoProps,
  danmakuProps,
}: PlayerAndEpisodeSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<RightTab>('episodes');

  return (
    <div className='space-y-4'>
      <div
        className={`grid gap-4 md:h-full transition-all duration-300 ease-in-out ${
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
          <div className='md:col-span-1 flex flex-col h-full min-h-0 rounded-xl border border-white/0 dark:border-white/30 overflow-hidden'>
            {/* Tab 切换：选集 / 详情 */}
            <div className='flex flex-shrink-0 border-b border-gray-200 dark:border-gray-700'>
              <button
                className={TAB_STYLES(activeTab === 'episodes')}
                onClick={() => setActiveTab('episodes')}
              >
                选集
              </button>
              <button
                className={TAB_STYLES(activeTab === 'info')}
                onClick={() => setActiveTab('info')}
              >
                详情
              </button>
            </div>

            {/* Tab 内容区：选集用内部滚动，详情整页滚动 */}
            <div className='flex-1 min-h-0 overflow-hidden'>
              {activeTab === 'episodes' ? (
                <EpisodePanel
                  {...episodePanelProps}
                  isCollapsed={isCollapsed}
                />
              ) : (
                <div className='h-full overflow-y-auto pb-4'>
                  <VideoDetailsPanelDynamic {...infoProps} />
                  <div className='px-2'>
                    <DanmakuPanel
                      key={`${danmakuProps.title}-${danmakuProps.episodeIndex}`}
                      {...danmakuProps}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
