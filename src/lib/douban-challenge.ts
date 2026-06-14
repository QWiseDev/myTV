import crypto from 'crypto';

/**
 * 判断是否为豆瓣反爬 Challenge 页面（PoW）。
 * 当前常见特征：包含 sha512/ process(cha) / "载入中 ..."
 */
export function isDoubanChallengePage(html: string): boolean {
  return (
    html.includes('sha512') &&
    html.includes('process(cha)') &&
    html.includes('载入中')
  );
}

function sha512Hex(input: string): string {
  return crypto.createHash('sha512').update(input).digest('hex');
}

function extractHiddenValue(html: string, id: string): string | null {
  const match = html.match(
    new RegExp(`id=["']${id}["'][^>]*value=["']([^"']+)["']`)
  );
  return match ? match[1] : null;
}

function getSetCookies(response: Response): string[] {
  const anyHeaders = response.headers as any;
  if (typeof anyHeaders.getSetCookie === 'function') {
    return anyHeaders.getSetCookie();
  }

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function toCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

function solvePowNonce(
  cha: string,
  difficulty = 4,
  maxIterations = 5_000_000
): number {
  const targetPrefix = '0'.repeat(difficulty);
  for (let nonce = 1; nonce <= maxIterations; nonce++) {
    if (sha512Hex(cha + nonce).startsWith(targetPrefix)) return nonce;
  }
  throw new Error(`PoW 解算失败（difficulty=${difficulty}，max=${maxIterations}）`);
}

export async function bypassDoubanPowChallenge(options: {
  challengeUrl: string;
  html: string;
  userAgent: string;
  timeoutMs?: number;
}): Promise<{ html: string }> {
  const timeoutMs = options.timeoutMs ?? 15000;

  const tok = extractHiddenValue(options.html, 'tok');
  const cha = extractHiddenValue(options.html, 'cha');
  const red = extractHiddenValue(options.html, 'red');
  if (!tok || !cha || !red) {
    throw new Error('Challenge 页面解析失败：缺少 tok/cha/red');
  }

  const sol = solvePowNonce(cha, 4);

  // Challenge 页面一般来自 https://sec.douban.com/c?... ，表单 action="/c"
  // 需要提交到 challengeUrl 的 origin 上的 /c，而不是 movie.douban.com。
  const submitUrl = new URL('/c', options.challengeUrl).toString();
  const submitOrigin = new URL(options.challengeUrl).origin;

  const body = new URLSearchParams({
    tok,
    cha,
    sol: String(sol),
    red,
  }).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    signal: controller.signal,
    redirect: 'manual',
    headers: {
      'User-Agent': options.userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: submitOrigin,
      Referer: options.challengeUrl,
    },
    body,
  });

  clearTimeout(timeoutId);

  const setCookies = getSetCookies(submitResponse);
  const cookieHeader = toCookieHeader(setCookies);
  const redirectUrl = submitResponse.headers.get('location') || red;

  // 用解算后下发的 Cookie 回源获取真实页面
  const fetchController = new AbortController();
  const fetchTimeoutId = setTimeout(() => fetchController.abort(), timeoutMs);

  const realResponse = await fetch(redirectUrl, {
    signal: fetchController.signal,
    headers: {
      'User-Agent': options.userAgent,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      Referer: 'https://movie.douban.com/',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });

  clearTimeout(fetchTimeoutId);

  if (!realResponse.ok) {
    throw new Error(`Challenge 绕过失败：HTTP ${realResponse.status}`);
  }

  const html = await realResponse.text();
  return { html };
}

