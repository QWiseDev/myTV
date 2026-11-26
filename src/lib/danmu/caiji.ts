/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { withAbortableTimeout } from '@/lib/promise-timeout';

import { extractEpisodeNumber } from './episode-match';
import type { PlatformUrl } from './types';

const CAIJI_REQUEST_TIMEOUT_MS = 10000;
const CAIJI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function normalizeTitle(text: string): string {
  return text.replace(/[\s\p{P}]+/gu, '').toLowerCase();
}

function detectCaijiPlatform(url: string): string {
  if (url.includes('bilibili.com')) return 'bilibili_caiji';
  if (url.includes('v.qq.com') || url.includes('qq.com'))
    return 'tencent_caiji';
  if (url.includes('iqiyi.com')) return 'iqiyi_caiji';
  if (url.includes('youku.com') || url.includes('v.youku.com'))
    return 'youku_caiji';
  if (url.includes('mgtv.com') || url.includes('w.mgtv.com'))
    return 'mgtv_caiji';
  return 'unknown';
}

function matchesEpisodeEntry(label: string, episodeNum: number): boolean {
  const parsed = extractEpisodeNumber(label);
  if (parsed !== null) {
    return parsed === episodeNum;
  }
  const trimmed = label.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) === episodeNum;
  }
  const epMatch = trimmed.match(/^(?:EP?|第)?0*(\d+)$/i);
  return epMatch ? Number.parseInt(epMatch[1], 10) === episodeNum : false;
}

// 从caiji.cyou API搜索视频链接
async function searchFromCaijiAPI(
  title: string,
  episode?: string | null,
): Promise<PlatformUrl[]> {
  try {
    const searchTitles = [
      title, // 原始标题
      title.replace(/·/g, ''), // 移除中间点
      title.replace(/·/g, ' '), // 中间点替换为空格
      title.replace(/·/g, '-'), // 中间点替换为连字符
    ];

    const uniqueTitles = Array.from(new Set(searchTitles));
    const normalizedQuery = normalizeTitle(title);

    for (const searchTitle of uniqueTitles) {
      const searchUrl = `https://www.caiji.cyou/api.php/provide/vod/?wd=${encodeURIComponent(
        searchTitle,
      )}`;
      const response = await withAbortableTimeout(
        (signal) =>
          fetch(searchUrl, {
            signal,
            headers: CAIJI_HEADERS,
          }),
        CAIJI_REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        continue;
      }

      const data: any = await response.json();
      if (!data.list || !Array.isArray(data.list) || data.list.length === 0) {
        continue;
      }

      let bestMatch: any = null;
      let exactMatch: any = null;

      for (const result of data.list) {
        const vodName = String(result?.vod_name || '');
        if (!vodName) continue;

        if (vodName === searchTitle || vodName === title) {
          exactMatch = result;
          break;
        }

        const isUnwanted =
          vodName.includes('解说') ||
          vodName.includes('预告') ||
          vodName.includes('花絮') ||
          vodName.includes('动态漫') ||
          vodName.includes('之精彩');

        if (isUnwanted) {
          continue;
        }

        const normVod = normalizeTitle(vodName);
        const titleRelated =
          normalizedQuery &&
          (normVod.includes(normalizedQuery) ||
            normalizedQuery.includes(normVod));

        if (!bestMatch && titleRelated) {
          bestMatch = result;
        }
      }

      const selectedResult = exactMatch || bestMatch;

      if (selectedResult) {
        return await processSelectedResult(selectedResult, episode);
      }
    }

    return [];
  } catch (error) {
    console.error('❌ Caiji API搜索失败:', error);
    return [];
  }
}

// 处理选中的结果
async function processSelectedResult(
  selectedResult: any,
  episode?: string | null,
): Promise<PlatformUrl[]> {
  try {
    const detailUrl = `https://www.caiji.cyou/api.php/provide/vod/?ac=detail&ids=${encodeURIComponent(
      String(selectedResult.vod_id),
    )}`;

    const detailResponse = await withAbortableTimeout(
      (signal) =>
        fetch(detailUrl, {
          signal,
          headers: CAIJI_HEADERS,
        }),
      CAIJI_REQUEST_TIMEOUT_MS,
    );

    if (!detailResponse.ok) return [];

    const detailData: any = await detailResponse.json();
    if (!detailData.list || detailData.list.length === 0) return [];

    const videoInfo: any = detailData.list[0];
    if (!videoInfo.vod_play_url) return [];

    const parsedEpisode = episode ? Number.parseInt(episode, 10) : Number.NaN;
    const episodeNum =
      Number.isFinite(parsedEpisode) && parsedEpisode > 0
        ? parsedEpisode
        : null;

    const urls: PlatformUrl[] = [];
    const seenUrls = new Set<string>();
    const playGroups = String(videoInfo.vod_play_url).split('$$$');

    for (const group of playGroups) {
      const playUrls = group.split('#').filter(Boolean);
      if (playUrls.length === 0) continue;

      let targetEntry: string | undefined;
      if (episodeNum) {
        targetEntry = playUrls.find((entry) => {
          const [label] = entry.split('$');
          return label ? matchesEpisodeEntry(label, episodeNum) : false;
        });
      } else {
        targetEntry = playUrls[0];
      }

      if (!targetEntry) continue;

      const dollarIdx = targetEntry.indexOf('$');
      let targetUrl =
        dollarIdx >= 0 ? targetEntry.slice(dollarIdx + 1).trim() : '';
      if (!targetUrl) continue;

      if (targetUrl.endsWith('.htm')) {
        targetUrl = targetUrl.replace(/\.htm$/, '.html');
      }

      const platform = detectCaijiPlatform(targetUrl);
      if (platform === 'unknown' || seenUrls.has(targetUrl)) {
        continue;
      }

      seenUrls.add(targetUrl);
      urls.push({ platform, url: targetUrl });
    }

    return urls;
  } catch (error) {
    console.error('❌ Caiji API搜索失败:', error);
    return [];
  }
}

export { searchFromCaijiAPI };
