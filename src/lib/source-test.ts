/**
 * 源测速工具（自 src/components/SourceTestModule.tsx 原样外移，可单测）。
 *
 * 覆盖：CMS 搜索接口契约（/api/source-test）、搜索结果到可播放线路的
 * 解析、匹配率统计与播放地址自动检测。字段回退顺序与错误文案均为
 * 原有行为，调用方请勿"修复"。
 */

import { SearchResult } from '@/lib/types';

// API源信息接口
interface ApiSite {
  key: string;
  name: string;
  api: string;
  disabled?: boolean;
}

// 源测试结果接口
interface SourceTestResult {
  source: string;
  sourceName: string;
  status: 'pending' | 'testing' | 'success' | 'error' | 'timeout';
  results: SearchResult[];
  responseTime?: number;
  error?: string;
  disabled?: boolean;
  resultCount?: number;
  matchRate?: number;
  topMatches?: string[];
}

interface EpisodeEntry {
  title: string;
  url: string;
  episodeIndex: number;
}

interface ParsedEpisodeLine {
  lineIndex: number;
  label: string;
  episodes: EpisodeEntry[];
}

interface ParsedSearchResult {
  info: SearchResult;
  lines: ParsedEpisodeLine[];
}

// 计算匹配率与示例（供顶层 testSource 复用）
function computeMatchRate(results: SearchResult[], q: string) {
  const lowerQ = (q || '').toLowerCase();
  if (!results || results.length === 0) return 0;
  const hit = results.filter((r) =>
    (r.title || '').toLowerCase().includes(lowerQ)
  ).length;
  return hit / results.length;
}

function computeTopMatches(results: SearchResult[], q: string) {
  const lowerQ = (q || '').toLowerCase();
  const hit = results.filter((r) =>
    (r.title || '').toLowerCase().includes(lowerQ)
  );
  return hit.slice(0, 3).map((r) => r.title || '');
}

function inferLineLabel(rawLine: string, index: number) {
  const firstSegment = rawLine.split('#')[0] || '';
  const parts = firstSegment.split('$');
  let candidate = parts.length > 2 ? parts[0] : '';

  if (!candidate && parts.length === 2) {
    const maybeTitle = parts[0]?.trim();
    if (
      maybeTitle &&
      !/^第?\d+/.test(maybeTitle) &&
      !/^第?[一二三四五六七八九十]+/.test(maybeTitle)
    ) {
      candidate = maybeTitle;
    }
  }

  const sanitized = candidate.trim();
  if (
    !sanitized ||
    sanitized.length < 2 ||
    sanitized.includes('http') ||
    /^第?\d+/.test(sanitized)
  ) {
    return `线路${index + 1}`;
  }
  return sanitized.length > 16 ? `${sanitized.slice(0, 16)}…` : sanitized;
}

function parsePlayableLines(result: SearchResult): ParsedEpisodeLine[] {
  if (!result || !Array.isArray(result.episodes)) return [];

  return result.episodes
    .map((rawLine: string, lineIndex: number) => {
      if (!rawLine) return null;
      const fragments = rawLine
        .split('#')
        .map((fragment) => fragment.trim())
        .filter(Boolean);

      const episodes = fragments
        .map((fragment, episodeIndex) => {
          const lastDollar = fragment.lastIndexOf('$');
          let url = fragment.trim();
          let title = `第${episodeIndex + 1}集`;

          if (lastDollar > -1) {
            title = fragment.slice(0, lastDollar).trim() || title;
            url = fragment.slice(lastDollar + 1).trim();
          }

          if (!/^https?:\/\//i.test(url)) {
            return null;
          }

          return {
            title,
            url,
            episodeIndex,
          } as EpisodeEntry;
        })
        .filter(Boolean) as EpisodeEntry[];

      if (!episodes.length) return null;

      return {
        lineIndex,
        label: inferLineLabel(rawLine, lineIndex),
        episodes,
      } as ParsedEpisodeLine;
    })
    .filter(Boolean) as ParsedEpisodeLine[];
}

function parseSearchResultsForPlayback(
  results: SearchResult[]
): ParsedSearchResult[] {
  if (!Array.isArray(results)) return [];
  return results
    .map((info) => ({
      info,
      lines: parsePlayableLines(info),
    }))
    .filter((item) => item.lines.length > 0);
}

// 获取所有源信息（包括禁用的）
async function getAllApiSites(): Promise<ApiSite[]> {
  try {
    const response = await fetch('/api/source-test/sources');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.sources || [];
  } catch (error) {
    console.error('获取源配置失败:', error);
    // 如果无法获取配置，尝试通过搜索API获取可用源
    try {
      const response = await fetch('/api/search?q=测试');
      const data = await response.json();

      const sources: ApiSite[] = [];
      if (data.results) {
        data.results.forEach(
          (result: { source?: string; source_name?: string }) => {
            if (result.source && !sources.find((s) => s.key === result.source)) {
              sources.push({
                key: result.source,
                name: result.source_name || result.source,
                api: '',
                disabled: false,
              });
            }
          }
        );
      }
      return sources;
    } catch (fallbackError) {
      console.error('获取源列表失败:', fallbackError);
      return [];
    }
  }
}

// CMS 采集接口返回的原始条目字段（vod_* 为苹果CMS字段，普通字段为兼容回退）
interface RawSearchItem {
  vod_id?: string | number;
  id?: string | number;
  vod_name?: string;
  title?: string;
  vod_pic?: string;
  poster?: string;
  vod_year?: string;
  year?: string;
  vod_play_url?: string;
  type_name?: string;
  type?: string;
  vod_content?: string;
  desc?: string;
  vod_douban_id?: number;
  douban_id?: number;
}

async function testSource(
  sourceKey: string,
  query: string
): Promise<SourceTestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(
      `/api/source-test?q=${encodeURIComponent(query)}&source=${sourceKey}`
    );
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        source: sourceKey,
        sourceName: sourceKey,
        status: response.status === 408 ? 'timeout' : 'error',
        results: [],
        responseTime,
        error:
          errorData.sourceError || errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    // 转换结果格式为 SearchResult
    const results: SearchResult[] = Array.isArray(data.results)
      ? data.results.map((item: RawSearchItem) => ({
          id: item.vod_id || item.id || '',
          title: item.vod_name || item.title || '未知标题',
          poster: item.vod_pic || item.poster || '',
          year: item.vod_year || item.year || '',
          episodes: item.vod_play_url ? item.vod_play_url.split('$$$') : [],
          episodes_titles: [],
          source: sourceKey,
          source_name: data.sourceName || sourceKey,
          class: item.type_name || item.type || '',
          desc: item.vod_content || item.desc || '',
          type_name: item.type_name || item.type || '',
          douban_id: item.vod_douban_id || item.douban_id,
        }))
      : [];

    return {
      source: sourceKey,
      sourceName: data.sourceName || sourceKey,
      status: 'success',
      results,
      responseTime,
      disabled: data.disabled,
      resultCount:
        typeof data.resultCount === 'number'
          ? data.resultCount
          : results.length,
      matchRate:
        typeof data.matchRate === 'number'
          ? data.matchRate
          : computeMatchRate(results, query),
      topMatches: Array.isArray(data.topMatches)
        ? data.topMatches
        : computeTopMatches(results, query),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      source: sourceKey,
      sourceName: sourceKey,
      status: 'error',
      results: [],
      responseTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// 自动测试单个源的视频播放功能
async function autoTestVideoPlayback(
  sourceKey: string,
  sourceName: string,
  results: SearchResult[]
): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    // 解析搜索结果中的播放地址
    const parsedResults = parseSearchResultsForPlayback(results);
    if (parsedResults.length === 0) {
      return {
        success: false,
        message: '未能从搜索结果中解析到可播放地址',
      };
    }

    // 选取第一个搜索结果的第一条线路的第一个视频
    const firstResult = parsedResults[0];
    const firstLine = firstResult.lines[0];
    const firstEpisode = firstLine.episodes[0];

    if (!firstEpisode || !firstEpisode.url) {
      return {
        success: false,
        message: '未找到有效的播放地址',
      };
    }

    // 简单测试视频地址格式
    const testUrl = firstEpisode.url;
    if (!/^https?:\/\//i.test(testUrl)) {
      return {
        success: false,
        message: '播放地址格式无效',
      };
    }

    return {
      success: true,
      url: testUrl,
      message: `可播放: ${firstResult.info.title} - ${firstLine.label} - ${firstEpisode.title}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `视频测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

export type {
  ApiSite,
  EpisodeEntry,
  ParsedEpisodeLine,
  ParsedSearchResult,
  SourceTestResult,
};

export {
  autoTestVideoPlayback,
  computeMatchRate,
  computeTopMatches,
  getAllApiSites,
  inferLineLabel,
  parsePlayableLines,
  parseSearchResultsForPlayback,
  testSource,
};
