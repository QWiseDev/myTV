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
    <div className='md:col-span-1 flex flex-col h-full'>
      {!isCollapsed && (
        <div className='h-full max-h-[350px] md:max-h-[450px] lg:max-h-[520px] xl:max-h-[600px] 2xl:max-h-[700px] overflow-hidden transition-all duration-300 ease-in-out'>
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
