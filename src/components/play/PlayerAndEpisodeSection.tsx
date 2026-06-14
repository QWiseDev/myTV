'use client';

import dynamic from 'next/dynamic';
import { ComponentProps, RefObject, useState } from 'react';

import { SearchResult } from '@/lib/types';

import PlayerContainer from '@/components/play/PlayerContainer';

const EpisodePanel = dynamic(() => import('@/components/play/EpisodePanel'), {
  ssr: false,
  loading: () => <div className='h-20 bg-gray-800 animate-pulse rounded-lg' />,
});

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
}

/**
 * 负责渲染播放器区域与选集面板，附带收起/展开交互
 */
export default function PlayerAndEpisodeSection({
  playerProps,
  episodePanelProps,
  playerRef,
}: PlayerAndEpisodeSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className='space-y-4'>
      <div
        className={`grid gap-4 transition-all duration-300 ease-in-out ${
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
          <EpisodePanel {...episodePanelProps} isCollapsed={isCollapsed} />
        )}
      </div>
    </div>
  );
}
