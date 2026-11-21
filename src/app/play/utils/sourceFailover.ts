import type { SearchResult } from '@/lib/types';

type SourceIdentity = Pick<SearchResult, 'source' | 'id'>;

type SourceFailoverResult = {
  sources: SearchResult[];
  nextSource: SearchResult | null;
};

function isSameSource(source: SourceIdentity, current: SourceIdentity) {
  return source.source === current.source && source.id === current.id;
}

export function markSourceFailedAndFindNext(
  sources: SearchResult[],
  current: SourceIdentity,
  options: { failedUrl?: string; episodeIndex?: number } = {},
): SourceFailoverResult {
  const { failedUrl, episodeIndex } = options;

  const updatedSources = sources.map((source) => {
    if (isSameSource(source, current)) {
      return { ...source, failed: true };
    }
    // 不同聚合站可能指向同一个 CDN（同集播放地址完全相同）：
    // 与失败源同地址的源一并标记，避免自动换源时在同一条坏链上逐个试错
    if (
      failedUrl &&
      typeof episodeIndex === 'number' &&
      episodeIndex >= 0 &&
      source.episodes?.[episodeIndex] === failedUrl
    ) {
      return { ...source, failed: true };
    }
    return source;
  });

  const nextSource =
    updatedSources.find(
      (source) => !source.failed && !isSameSource(source, current),
    ) ?? null;

  return { sources: updatedSources, nextSource };
}
