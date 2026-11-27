import type { SearchResult } from '@/lib/types';

import { parseSpeedToKBps } from './helpers';
import { smartCache } from './smartCache';

type SourceIdentity = Pick<SearchResult, 'source' | 'id'>;

type SourceFailoverResult = {
  sources: SearchResult[];
  nextSource: SearchResult | null;
};

function isSameSource(source: SourceIdentity, current: SourceIdentity) {
  return source.source === current.source && source.id === current.id;
}

/**
 * 基于历史测速与可靠性为备用源评分：
 * 无历史数据时返回 0（完全保持原顺序，避免无证据重排）；
 * 仅有历史失败记录的域名返回负分，使未测过的候选源优先于已知故障源。
 */
export function scoreFailoverCandidate(
  source: SearchResult,
  episodeIndex?: number,
): number {
  const targetUrl =
    (typeof episodeIndex === 'number' && episodeIndex >= 0
      ? source.episodes?.[episodeIndex]
      : undefined) || source.episodes?.[0];
  if (!targetUrl) return 0;

  const reliability = smartCache.getReliability(targetUrl);
  const cached = smartCache.get(targetUrl);
  if (!reliability && !cached) return 0;

  let score = 0;
  if (reliability && reliability.totalCount > 0) {
    if (reliability.successCount === 0) {
      score -= 40;
    } else {
      const successRate = reliability.successCount / reliability.totalCount;
      score += successRate * 60 + reliability.stability * 20;
      if (reliability.avgResponseTime > 0) {
        score += Math.max(0, 20 - reliability.avgResponseTime / 100);
      }
    }
  }
  if (cached?.success) {
    const kbps = parseSpeedToKBps(cached.loadSpeed);
    score += Math.min(30, kbps / 256);
  }
  return score;
}

export function markSourceFailedAndFindNext(
  sources: SearchResult[],
  current: SourceIdentity,
  options: {
    failedUrl?: string;
    episodeIndex?: number;
    scoreCandidate?: (source: SearchResult, episodeIndex?: number) => number;
  } = {},
): SourceFailoverResult {
  const {
    failedUrl,
    episodeIndex,
    scoreCandidate = scoreFailoverCandidate,
  } = options;

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

  const candidates = updatedSources.filter(
    (source) => !source.failed && !isSameSource(source, current),
  );
  if (candidates.length === 0) {
    return { sources: updatedSources, nextSource: null };
  }

  let bestCandidate = candidates[0];
  let bestScore = scoreCandidate(bestCandidate, episodeIndex);
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const score = scoreCandidate(candidate, episodeIndex);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return { sources: updatedSources, nextSource: bestCandidate };
}
