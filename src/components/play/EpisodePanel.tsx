import type { SearchResult } from '@/lib/types';

import EpisodeSelector from '@/components/EpisodeSelector';

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
  switchingSourceKey?: string | null;
  isSourceSwitching?: boolean;
  /** 访客（未登录）禁用换源 */
  disableSourceSwitch?: boolean;
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
  switchingSourceKey,
  isSourceSwitching,
  disableSourceSwitch,
}: EpisodePanelProps) {
  return (
    <div className='flex flex-col h-full min-h-0'>
      {!isCollapsed && (
        <div className='flex-1 min-h-0 overflow-hidden transition-all duration-300 ease-in-out'>
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
            switchingSourceKey={switchingSourceKey}
            isSourceSwitching={isSourceSwitching}
            disableSourceSwitch={disableSourceSwitch}
          />
        </div>
      )}
    </div>
  );
}
