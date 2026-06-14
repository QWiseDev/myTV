import type { SearchResult } from '@/lib/types';

export type SourceIdentity = Pick<SearchResult, 'source' | 'id'>;

export type SourceDetailFetcher = (
  source: string,
  id: string
) => Promise<SearchResult | null | undefined>;

export function buildSourceKey(source: SourceIdentity): string {
  return `${String(source.source)}-${String(source.id)}`;
}

export function isSameSource(
  source: SourceIdentity,
  target: SourceIdentity
): boolean {
  return source.source === target.source && source.id === target.id;
}

export function findSourceByIdentity<T extends SourceIdentity>(
  sources: T[],
  target: SourceIdentity
): T | undefined {
  return sources.find((source) => isSameSource(source, target));
}

export function dedupeSources<T extends SourceIdentity>(sources: T[]): T[] {
  return Array.from(
    sources.reduce((sourceMap, source) => {
      sourceMap.set(buildSourceKey(source), source);
      return sourceMap;
    }, new Map<string, T>())
  ).map(([, source]) => source);
}

export function hasValidDoubanId(
  detail: Pick<SearchResult, 'douban_id'> | null | undefined
): boolean {
  return typeof detail?.douban_id === 'number' && detail.douban_id > 0;
}

export function resolveDoubanId(
  detail: Pick<SearchResult, 'douban_id'> | null | undefined,
  fallback: number | null | undefined
): number {
  const detailDoubanId = detail?.douban_id;
  if (typeof detailDoubanId === 'number' && detailDoubanId > 0) {
    return detailDoubanId;
  }
  if (typeof fallback === 'number' && fallback > 0) {
    return fallback;
  }
  return 0;
}

export function replaceSourceDetail<T extends SearchResult>(
  sources: T[],
  detail: T
): T[] {
  return sources.map((source) =>
    isSameSource(source, detail) ? detail : source
  );
}

export async function hydrateSourceDetail<T extends SearchResult>(
  detail: T,
  fetchDetail: SourceDetailFetcher,
  options: {
    onError?: (error: unknown) => void;
  } = {}
): Promise<T> {
  if (hasValidDoubanId(detail)) {
    return detail;
  }

  try {
    const hydrated = await fetchDetail(detail.source, detail.id);
    return hydrated ? ({ ...detail, ...hydrated } as T) : detail;
  } catch (error) {
    options.onError?.(error);
    return detail;
  }
}
