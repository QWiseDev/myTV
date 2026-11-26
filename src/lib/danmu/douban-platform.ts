/* eslint-disable no-console */

import { fetchDoubanWithVerification } from '@/lib/douban-anti-crawler';
import {
  bypassDoubanPowChallenge,
  isDoubanChallengePage,
} from '@/lib/douban-challenge';
import { withAbortableTimeout } from '@/lib/promise-timeout';

import type { PlatformUrl } from './types';

// 用户代理池 - 防止被封IP
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// 请求限制器 - 防止被封IP（预约槽位，避免并发请求同时唤醒）
let lastDoubanRequestTime = 0;
const MIN_DOUBAN_REQUEST_INTERVAL = 1000; // 1秒最小间隔

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = 500, max = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function extractPlayLinkUrl(
  html: string,
  playLinkPattern: RegExp,
  encodedUrlPattern: RegExp,
  episodeNum: number | null,
): string | null {
  const matches = html.match(playLinkPattern);
  if (!matches || matches.length === 0) return null;

  let selectedMatch: string;
  if (episodeNum && episodeNum > 1) {
    // 豆瓣只有单条或不足目标集数时不得回退第 1 集，交由下游集数精确匹配兜底
    if (episodeNum > matches.length) {
      return null;
    }
    selectedMatch = matches[episodeNum - 1];
  } else {
    selectedMatch = matches[0];
  }

  const urlMatch = selectedMatch.match(encodedUrlPattern);
  if (!urlMatch) return null;
  return decodeURIComponent(urlMatch[0]).split('?')[0];
}

function convertMobileUrlToPc(url: string): string {
  let convertedUrl = url;

  if (convertedUrl.includes('m.youku.com/alipay_video/id_')) {
    convertedUrl = convertedUrl.replace(
      /https:\/\/m\.youku\.com\/alipay_video\/id_([^.]+)\.html/,
      'https://v.youku.com/v_show/id_$1.html',
    );
  }
  if (convertedUrl.includes('m.iqiyi.com/')) {
    convertedUrl = convertedUrl.replace('m.iqiyi.com', 'www.iqiyi.com');
  }
  if (convertedUrl.includes('m.v.qq.com/')) {
    convertedUrl = convertedUrl.replace('m.v.qq.com', 'v.qq.com');
  }
  if (convertedUrl.includes('m.bilibili.com/')) {
    convertedUrl = convertedUrl
      .replace('m.bilibili.com', 'www.bilibili.com')
      .split('?')[0];
  }
  if (convertedUrl.includes('m.mgtv.com/')) {
    convertedUrl = convertedUrl.replace('m.mgtv.com', 'www.mgtv.com');
  }

  return convertedUrl;
}

// 从豆瓣页面提取平台视频链接
async function extractPlatformUrls(
  doubanId: string,
  episode?: string | null,
): Promise<PlatformUrl[]> {
  const normalizedDoubanId = doubanId?.trim();
  if (!normalizedDoubanId || !/^\d{1,20}$/.test(normalizedDoubanId)) {
    return [];
  }

  const parsedEpisode = episode ? Number.parseInt(episode, 10) : Number.NaN;
  const episodeNum =
    Number.isFinite(parsedEpisode) && parsedEpisode > 0 ? parsedEpisode : null;

  try {
    // 请求限流：先预约时间槽再等待，确保并发请求间隔 >= 1s
    const now = Date.now();
    const scheduledAt = Math.max(
      now,
      lastDoubanRequestTime + MIN_DOUBAN_REQUEST_INTERVAL,
    );
    lastDoubanRequestTime = scheduledAt;
    if (scheduledAt > now) {
      await new Promise((resolve) => setTimeout(resolve, scheduledAt - now));
    }

    // 添加随机延时 - 防止被封IP
    await randomDelay(300, 1000);

    const target = `https://movie.douban.com/subject/${normalizedDoubanId}/`;
    const userAgent = getRandomUserAgent();
    const headers = {
      'User-Agent': userAgent,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
      // 随机添加Referer - 防止被封IP
      ...(Math.random() > 0.5 ? { Referer: 'https://www.douban.com/' } : {}),
    };

    const response = await withAbortableTimeout(
      (signal) => fetchDoubanWithVerification(target, { signal, headers }),
      10000,
    );

    if (!response.ok) {
      return [];
    }

    let html = await response.text();
    if (isDoubanChallengePage(html)) {
      const bypassed = await bypassDoubanPowChallenge({
        challengeUrl: response.url,
        html,
        userAgent,
        timeoutMs: 15000,
      });
      html = bypassed.html;
    }

    const urls: PlatformUrl[] = [];
    const playLinkSpecs: Array<{
      platform: string;
      linkRegex: RegExp;
      urlRegex: RegExp;
    }> = [
      {
        platform: 'tencent',
        linkRegex: /play_link:\s*"[^"]*v\.qq\.com[^"]*"/g,
        urlRegex: /https%3A%2F%2Fv\.qq\.com[^"&]*/,
      },
      {
        platform: 'iqiyi',
        linkRegex: /play_link:\s*"[^"]*iqiyi\.com[^"]*"/g,
        urlRegex: /https?%3A%2F%2F[^"&]*iqiyi\.com[^"&]*/,
      },
      {
        platform: 'youku',
        linkRegex: /play_link:\s*"[^"]*youku\.com[^"]*"/g,
        urlRegex: /https?%3A%2F%2F[^"&]*youku\.com[^"&]*/,
      },
      {
        platform: 'bilibili_douban',
        linkRegex: /play_link:\s*"[^"]*bilibili\.com[^"]*"/g,
        urlRegex: /https?%3A%2F%2F[^"&]*bilibili\.com[^"&]*/,
      },
      {
        platform: 'mgtv',
        linkRegex: /play_link:\s*"[^"]*mgtv\.com[^"]*"/g,
        urlRegex: /https?%3A%2F%2F[^"&]*mgtv\.com[^"&]*/,
      },
    ];

    for (const spec of playLinkSpecs) {
      const extracted = extractPlayLinkUrl(
        html,
        spec.linkRegex,
        spec.urlRegex,
        episodeNum,
      );
      if (extracted) {
        urls.push({ platform: spec.platform, url: extracted });
      }
    }

    // 页面直链（仅作单集/首集补充，避免第 N>1 集误拉取首集或相关推荐直链）
    if (!episodeNum || episodeNum === 1) {
      const directSpecs: Array<{ platform: string; regex: RegExp }> = [
        {
          platform: 'tencent_direct',
          regex: /https:\/\/v\.qq\.com\/x\/cover\/[^"'\s]+/g,
        },
        {
          platform: 'bilibili',
          regex: /https:\/\/www\.bilibili\.com\/video\/[^"'\s]+/g,
        },
        {
          platform: 'mgtv_direct',
          regex: /https:\/\/(?:www|w)\.mgtv\.com\/b\/[^"'\s]+/g,
        },
      ];
      for (const spec of directSpecs) {
        const matches = html.match(spec.regex);
        if (matches && matches.length > 0) {
          urls.push({
            platform: spec.platform,
            url: matches[0].split('?')[0],
          });
        }
      }
    }

    const seenUrls = new Set<string>();
    const convertedUrls: PlatformUrl[] = [];
    for (const urlObj of urls) {
      const convertedUrl = convertMobileUrlToPc(urlObj.url);
      if (!seenUrls.has(convertedUrl)) {
        seenUrls.add(convertedUrl);
        convertedUrls.push({ ...urlObj, url: convertedUrl });
      }
    }

    return convertedUrls;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      console.error('❌ 豆瓣请求超时 (10秒):', normalizedDoubanId);
    } else {
      console.error('❌ 提取平台链接失败:', error);
    }
    return [];
  }
}

export { extractPlatformUrls };
