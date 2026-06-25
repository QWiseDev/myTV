import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

/**
 * 计算 SHA-512 哈希值
 */
function sha512(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

/**
 * 工作量证明算法 - 寻找满足难度要求的 nonce
 * @param data 要哈希的数据
 * @param difficulty 难度（前导零的数量）
 * @returns 满足条件的 nonce
 */
function proofOfWork(data: string, difficulty = 4): number {
  const targetSubStr = '0'.repeat(difficulty);

  for (let nonce = 1; ; nonce += 1) {
    const hash = sha512(data + nonce);
    if (hash.startsWith(targetSubStr)) {
      return nonce;
    }
  }
}

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

/**
 * 获取豆瓣访问 cookie（处理反爬验证）
 * @param url 要访问的豆瓣 URL
 * @returns cookie 字符串
 */
export async function getDoubanCookie(url: string): Promise<string> {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://movie.douban.com/',
  };

  try {
    // Step 1: 尝试直接访问
    const firstResponse = await fetch(url, {
      headers,
      redirect: 'manual',
    });

    if (firstResponse.status === 200) {
      // 直接访问成功，返回 cookie
      const cookies = firstResponse.headers.get('set-cookie');
      return cookies || '';
    }

    if (firstResponse.status === 302) {
      // 被重定向到验证页面
      const location = firstResponse.headers.get('location');
      if (!location || !location.includes('sec.douban.com')) {
        throw new Error('Unexpected redirect location');
      }


      // Step 2: 获取验证页面
      const verifyResponse = await fetch(location, { headers });
      if (!verifyResponse.ok) {
        throw new Error(
          `Failed to fetch verification page: ${verifyResponse.status}`
        );
      }

      const verifyHtml = await verifyResponse.text();

      // Step 3: 解析验证页面中的表单数据
      const formData = parseVerificationPage(verifyHtml);
      if (!formData) {
        throw new Error('Failed to parse verification page');
      }


      // Step 4: 计算工作量证明
      const sol = proofOfWork(formData.cha, 4);


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
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
        redirect: 'manual',
      });

      // Step 6: 提取 cookie
      const setCookieHeader = submitResponse.headers.get('set-cookie');
      if (!setCookieHeader) {
        throw new Error('No cookie received after verification');
      }

      return setCookieHeader;
    }

    throw new Error(`Unexpected response status: ${firstResponse.status}`);
  } catch (error) {
    console.error('Failed to get douban cookie:', error);
    throw error;
  }
}

/**
 * 使用验证逻辑的 fetch 请求
 * @param url 请求地址
 * @param options fetch 选项
 */
export async function fetchDoubanWithVerification(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://movie.douban.com/',
    ...options.headers,
  };

  try {
    // 先尝试直接访问
    let response = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual',
    });

    // 如果被重定向到验证页面
    if (response.status === 302) {
      const location = response.headers.get('location');
      if (location && location.includes('sec.douban.com')) {

        const cookie = await getDoubanCookie(url);

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
