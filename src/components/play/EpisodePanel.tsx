import dynamic from 'next/dynamic';
import { Suspense } from 'react';

import type { SearchResult } from '@/lib/types';

import type { EpisodeVideoInfo } from '@/app/play/types';

const EpisodeSelector = dynamic(() => import('@/components/EpisodeSelector'), {
  ssr: false,
});

interface EpisodePanelProps {
  detail: SearchResult | null;
  currentEpisodeIndex: number;
  totalEpisodes: number;
  onEpisodeChange: (episodeNumber: number) => void;
  isCollapsed: boolean;
  // 换源相关
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
  precomputedVideoInfo?: Map<string, EpisodeVideoInfo>;
}

export default function EpisodePanel({
  detail,
  currentEpisodeIndex,
  totalEpisodes,
  onEpisodeChange,
  isCollapsed,
  onSourceChange,
  currentSource,
  currentId,
  videoTitle,
  availableSources,
  onLoadSources,
  sourceSearchLoading,
  sourceSearchError,
  precomputedVideoInfo,
}: EpisodePanelProps) {
  return (
    <div className='flex flex-col h-full min-h-0'>
      {!isCollapsed && (
        <div className='flex-1 min-h-0 overflow-hidden transition-all duration-300 ease-in-out'>
          <Suspense fallback={<div>加载中...</div>}>
            <EpisodeSelector
              totalEpisodes={totalEpisodes}
              episodes_titles={detail?.episodes_titles || []}
              value={currentEpisodeIndex + 1}
              onChange={onEpisodeChange}
              onSourceChange={onSourceChange}
              currentSource={currentSource}
              currentId={currentId}
              videoTitle={videoTitle}
              availableSources={availableSources}
              onLoadSources={onLoadSources}
              sourceSearchLoading={sourceSearchLoading}
              sourceSearchError={sourceSearchError}
              precomputedVideoInfo={precomputedVideoInfo}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
