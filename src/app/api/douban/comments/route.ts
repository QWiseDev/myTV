import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { fetchDoubanWithVerification } from '@/lib/douban-anti-crawler';
import {
  bypassDoubanPowChallenge,
  isDoubanChallengePage,
} from '@/lib/douban-challenge';
import { parseDoubanCommentsPage } from '@/lib/douban-comments-parser';

// 用户代理池
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// 请求限制器
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2秒最小间隔

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = 1000, max = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export const runtime = 'nodejs';

// 强制动态渲染
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const start = Number(searchParams.get('start') || '0');
  const limit = Number(searchParams.get('limit') || '10');
  const sort = searchParams.get('sort') || 'new_score'; // new_score 或 time

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: '缺少必要参数: id' }, { status: 400 });
  }

  // 验证参数
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: 'limit 必须在 1-50 之间' },
      { status: 400 }
    );
  }

  if (!Number.isSafeInteger(start) || start < 0 || !['new_score', 'time'].includes(sort)) {
    return NextResponse.json({ error: 'start 不能小于 0' }, { status: 400 });
  }

  const target = `https://movie.douban.com/subject/${id}/comments?start=${start}&limit=${limit}&status=P&sort=${sort}`;

  try {
    // 请求限流：确保请求间隔
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      );
    }
    lastRequestTime = Date.now();

    // 添加随机延时
    await randomDelay(500, 1500);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const fetchOptions = {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        // 随机添加Referer
        ...(Math.random() > 0.5
          ? { Referer: 'https://movie.douban.com/' }
          : {}),
      },
    };

    const response = await fetchDoubanWithVerification(target, fetchOptions).finally(
      () => clearTimeout(timeoutId),
    );

    if (!response.ok) {
      if (response.status === 404) {
        const cacheTime = Math.min(await getCacheTime(), 600);
        return NextResponse.json(
          {
            code: 200,
            message: '暂无短评',
            data: {
              comments: [],
              start,
              limit,
              count: 0,
              hasMore: false,
              nextStart: null,
            },
          },
          {
            headers: {
              'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
              'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
              'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
              'Netlify-Vary': 'query',
            },
          }
        );
      }
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    let html = await response.text();
    // 豆瓣会将请求 302 到 sec.douban.com 的 PoW 页面，直接解析会得到空数据
    if (isDoubanChallengePage(html)) {
      const bypassed = await bypassDoubanPowChallenge({
        challengeUrl: response.url,
        html,
        userAgent: fetchOptions.headers['User-Agent'] ?? '',
        timeoutMs: 15000,
      });
      html = bypassed.html;
    }

    // 解析短评列表
    if (isDoubanChallengePage(html)) {
      return NextResponse.json({ error: '豆瓣暂时要求验证，请稍后重试' }, { status: 503 });
    }
    const { comments, hasMore, nextStart } = parseDoubanCommentsPage(html);

    const cacheTime = await getCacheTime();
    return NextResponse.json(
      {
        code: 200,
        message: '获取成功',
        data: {
          comments,
          start,
          limit,
          count: comments.length,
          hasMore,
          nextStart,
        },
      },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: '获取豆瓣短评失败，请稍后重试' },
      { status: 500 }
    );
  }
}
