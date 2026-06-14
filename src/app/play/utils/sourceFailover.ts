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
  current: SourceIdentity
): SourceFailoverResult {
  const updatedSources = sources.map((source) =>
    isSameSource(source, current) ? { ...source, failed: true } : source
  );

  const nextSource =
    updatedSources.find(
      (source) => !source.failed && !isSameSource(source, current)
    ) ?? null;

  return { sources: updatedSources, nextSource };
}
