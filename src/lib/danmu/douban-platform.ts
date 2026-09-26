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

// 请求限制器 - 防止被封IP
let lastDoubanRequestTime = 0;
const MIN_DOUBAN_REQUEST_INTERVAL = 1000; // 1秒最小间隔

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = 500, max = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// 从豆瓣页面提取平台视频链接
async function extractPlatformUrls(
  doubanId: string,
  episode?: string | null,
): Promise<PlatformUrl[]> {
  if (!doubanId) return [];

  try {
    // 请求限流：确保请求间隔 - 防止被封IP
    const now = Date.now();
    const timeSinceLastRequest = now - lastDoubanRequestTime;
    if (timeSinceLastRequest < MIN_DOUBAN_REQUEST_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_DOUBAN_REQUEST_INTERVAL - timeSinceLastRequest),
      );
    }
    lastDoubanRequestTime = Date.now();

    // 添加随机延时 - 防止被封IP
    await randomDelay(300, 1000);

    const target = `https://movie.douban.com/subject/${doubanId}/`;
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
      10000
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

    // 提取豆瓣跳转链接中的各种视频平台URL

    // 腾讯视频
    const doubanLinkMatches = html.match(
      /play_link:\s*"[^"]*v\.qq\.com[^"]*"/g,
    );
    if (doubanLinkMatches && doubanLinkMatches.length > 0) {

      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = doubanLinkMatches[0]; // 默认使用第一个
      if (episode && doubanLinkMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= doubanLinkMatches.length) {
          selectedMatch = doubanLinkMatches[episodeNum - 1];
        }
      }

      const urlMatch = selectedMatch.match(/https%3A%2F%2Fv\.qq\.com[^"&]*/);
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        urls.push({ platform: 'tencent', url: decodedUrl });
      }
    }

    // 爱奇艺
    const iqiyiMatches = html.match(/play_link:\s*"[^"]*iqiyi\.com[^"]*"/g);
    if (iqiyiMatches && iqiyiMatches.length > 0) {

      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = iqiyiMatches[0]; // 默认使用第一个
      if (episode && iqiyiMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= iqiyiMatches.length) {
          selectedMatch = iqiyiMatches[episodeNum - 1];
        }
      }

      const urlMatch = selectedMatch.match(
        /https?%3A%2F%2F[^"&]*iqiyi\.com[^"&]*/,
      );
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        urls.push({ platform: 'iqiyi', url: decodedUrl });
      }
    }

    // 优酷
    const youkuMatches = html.match(/play_link:\s*"[^"]*youku\.com[^"]*"/g);
    if (youkuMatches && youkuMatches.length > 0) {

      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = youkuMatches[0]; // 默认使用第一个
      if (episode && youkuMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= youkuMatches.length) {
          selectedMatch = youkuMatches[episodeNum - 1];
        }
      }

      const urlMatch = selectedMatch.match(
        /https?%3A%2F%2F[^"&]*youku\.com[^"&]*/,
      );
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        urls.push({ platform: 'youku', url: decodedUrl });
      }
    }

    // 直接提取腾讯视频链接
    const qqMatches = html.match(/https:\/\/v\.qq\.com\/x\/cover\/[^"'\s]+/g);
    if (qqMatches && qqMatches.length > 0) {
      urls.push({
        platform: 'tencent_direct',
        url: qqMatches[0].split('?')[0],
      });
    }

    // B站链接提取（直接链接）
    const biliMatches = html.match(
      /https:\/\/www\.bilibili\.com\/video\/[^"'\s]+/g,
    );
    if (biliMatches && biliMatches.length > 0) {
      urls.push({
        platform: 'bilibili',
        url: biliMatches[0].split('?')[0],
      });
    }

    // B站链接提取（豆瓣跳转链接）
    const biliDoubanMatches = html.match(
      /play_link:\s*"[^"]*bilibili\.com[^"]*"/g,
    );
    if (biliDoubanMatches && biliDoubanMatches.length > 0) {

      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = biliDoubanMatches[0]; // 默认使用第一个
      if (episode && biliDoubanMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= biliDoubanMatches.length) {
          selectedMatch = biliDoubanMatches[episodeNum - 1];
        }
      }

      const urlMatch = selectedMatch.match(
        /https?%3A%2F%2F[^"&]*bilibili\.com[^"&]*/,
      );
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        urls.push({ platform: 'bilibili_douban', url: decodedUrl });
      }
    }

    // 转换移动版链接为PC版链接（弹幕库API需要PC版）
    const convertedUrls = urls.map((urlObj) => {
      let convertedUrl = urlObj.url;

      // 优酷移动版转PC版
      if (convertedUrl.includes('m.youku.com/alipay_video/id_')) {
        convertedUrl = convertedUrl.replace(
          /https:\/\/m\.youku\.com\/alipay_video\/id_([^.]+)\.html/,
          'https://v.youku.com/v_show/id_$1.html',
        );
      }

      // 爱奇艺移动版转PC版
      if (convertedUrl.includes('m.iqiyi.com/')) {
        convertedUrl = convertedUrl.replace('m.iqiyi.com', 'www.iqiyi.com');
      }

      // 腾讯视频移动版转PC版
      if (convertedUrl.includes('m.v.qq.com/')) {
        convertedUrl = convertedUrl.replace('m.v.qq.com', 'v.qq.com');
      }

      // B站移动版转PC版
      if (convertedUrl.includes('m.bilibili.com/')) {
        convertedUrl = convertedUrl.replace(
          'm.bilibili.com',
          'www.bilibili.com',
        );
        // 移除豆瓣来源参数
        convertedUrl = convertedUrl.split('?')[0];
      }

      return { ...urlObj, url: convertedUrl };
    });

    return convertedUrls;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      console.error('❌ 豆瓣请求超时 (10秒):', doubanId);
    } else {
      console.error('❌ 提取平台链接失败:', error);
    }
    return [];
  }
}

export { extractPlatformUrls };
