import * as cheerio from 'cheerio';

import {
  getSetCookies,
  solvePowNonce,
  toCookieHeader,
} from './douban-challenge';

/**
 * 解析豆瓣验证页面，提取表单数据
 */
function parseVerificationPage(html: string): {
  tok: string;
  cha: string;
  red: string;
} | null {
  const $ = cheerio.load(html);
  const tok = $('#tok').val() as string;
  const cha = $('#cha').val() as string;
  const red = $('#red').val() as string;

  if (!tok || !cha || !red) {
    console.error('Failed to extract verification form data');
    return null;
  }

  return { tok, cha, red };
}

const DEFAULT_DOUBAN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://movie.douban.com/',
};

const DOUBAN_COOKIE_TTL_MS = 5 * 60_000;
let cachedDoubanCookie: { value: string; expireAt: number } | null = null;
let inflightCookiePromise: Promise<string> | null = null;

function readCachedDoubanCookie(): string | null {
  if (!cachedDoubanCookie || Date.now() >= cachedDoubanCookie.expireAt) {
    cachedDoubanCookie = null;
    return null;
  }
  return cachedDoubanCookie.value;
}

function writeCachedDoubanCookie(cookie: string): void {
  if (!cookie) return;
  cachedDoubanCookie = {
    value: cookie,
    expireAt: Date.now() + DOUBAN_COOKIE_TTL_MS,
  };
}

async function solveVerificationByLocation(
  location: string,
  signal?: AbortSignal,
): Promise<string> {
  if (inflightCookiePromise) {
    return inflightCookiePromise;
  }

  const task = (async () => {
    // Step 2: 获取验证页面
    const verifyResponse = await fetch(location, {
      headers: DEFAULT_DOUBAN_HEADERS,
      signal,
    });
    if (!verifyResponse.ok) {
      throw new Error(
        `Failed to fetch verification page: ${verifyResponse.status}`,
      );
    }

    const verifyHtml = await verifyResponse.text();

    // Step 3: 解析验证页面中的表单数据
    const formData = parseVerificationPage(verifyHtml);
    if (!formData) {
      throw new Error('Failed to parse verification page');
    }

    // Step 4: 计算工作量证明（复用 douban-challenge 的有上限实现，避免死循环）
    const sol = solvePowNonce(formData.cha, 4);

    // Step 5: 提交验证表单
    const formBody = new URLSearchParams({
      tok: formData.tok,
      cha: formData.cha,
      sol: sol.toString(),
      red: formData.red,
    });

    const submitResponse = await fetch('https://sec.douban.com/c', {
      method: 'POST',
      headers: {
        ...DEFAULT_DOUBAN_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
      redirect: 'manual',
      signal,
    });

    // Step 6: 提取 cookie（只保留 name=value，避免把 Path/Expires 等属性当成 cookie 回传）
    const cookie = toCookieHeader(getSetCookies(submitResponse));
    if (!cookie) {
      throw new Error('No cookie received after verification');
    }

    writeCachedDoubanCookie(cookie);
    return cookie;
  })().finally(() => {
    if (inflightCookiePromise === task) {
      inflightCookiePromise = null;
    }
  });

  inflightCookiePromise = task;
  return task;
}

/**
 * 使用验证逻辑的 fetch 请求
 * @param url 请求地址
 * @param options fetch 选项
 */
export async function fetchDoubanWithVerification(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const cachedCookie = readCachedDoubanCookie();
  const headers: Record<string, string> = {
    ...DEFAULT_DOUBAN_HEADERS,
    ...(options.headers as Record<string, string> | undefined),
    ...(cachedCookie ? { Cookie: cachedCookie } : {}),
  };

  try {
    // 先尝试直接访问（如有缓存验证 cookie 则带上）
    let response = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual',
    });

    // 如果被重定向到验证页面，直接复用已知 location 完成校验，不再重复请求一次 url
    if (response.status === 302) {
      const location = response.headers.get('location');
      if (location && location.includes('sec.douban.com')) {
        cachedDoubanCookie = null;
        const cookie = await solveVerificationByLocation(
          location,
          options.signal ?? undefined,
        );

        // 使用 cookie 重新请求
        response = await fetch(url, {
          ...options,
          headers: {
            ...headers,
            Cookie: cookie,
          },
        });
      }
    }

    return response;
  } catch (error) {
    console.error('Failed to fetch douban with verification:', error);
    throw error;
  }
}
