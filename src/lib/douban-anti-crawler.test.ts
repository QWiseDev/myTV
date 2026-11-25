const MOVIE_URL = 'https://movie.douban.com/test';
const VERIFY_URL = 'https://sec.douban.com/c?tok=1';
const VERIFY_PAGE_HTML = `<!DOCTYPE html><html><body>
  <input type="hidden" id="tok" value="tok-1"/>
  <input type="hidden" id="cha" value="cha-1"/>
  <input type="hidden" id="red" value="https://movie.douban.com/test"/>
</body></html>`;
// 浏览器/undici 会把多条 Set-Cookie 合并成一条逗号串，这里刻意只给合并形态
const SET_COOKIE =
  'dbcl2="abc"; Path=/; HttpOnly, bid=xyz; Path=/; Domain=.douban.com';

function headerValue(init: RequestInit | undefined, name: string): string {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers[name] ?? '';
}

// 真实 cheerio 1.2 会内置加载 undici，jsdom 沙箱缺 TextDecoder/MessagePort，
// 且桥接宿主 realm 的 MessagePort 会让 jest worker 无法退出；这里只替换 HTML 解析环节
jest.mock('cheerio', () => ({
  load: (html: string) => (selector: string) => ({
    val: () => {
      const match = html.match(
        new RegExp(
          `id=["']${selector.replace('#', '')}["'][^>]*value=["']([^"']*)["']`,
        ),
      );
      return match?.[1];
    },
  }),
}));

describe('fetchDoubanWithVerification 反爬 cookie 复用', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;
  let fetchDoubanWithVerification: typeof import('./douban-anti-crawler').fetchDoubanWithVerification;

  beforeEach(async () => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    // cookie 缓存是模块级状态，重置模块保证用例互不影响
    jest.resetModules();
    ({ fetchDoubanWithVerification } = await import('./douban-anti-crawler'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockVerificationFlow(): void {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: VERIFY_URL },
        }),
      )
      .mockResolvedValueOnce(new Response(VERIFY_PAGE_HTML, { status: 200 }))
      .mockResolvedValueOnce(
        new Response('', {
          status: 200,
          headers: { 'set-cookie': SET_COOKIE },
        }),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
  }

  it('只把 name=value 回传为 Cookie 头，不带 Set-Cookie 属性', async () => {
    mockVerificationFlow();

    const response = await fetchDoubanWithVerification(MOVIE_URL);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // 第 2 次请求验证页，第 3 次提交验证表单
    expect(fetchMock.mock.calls[1][0]).toBe(VERIFY_URL);
    expect(fetchMock.mock.calls[2][0]).toBe('https://sec.douban.com/c');
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST' });

    const retryInit = fetchMock.mock.calls[3][1] as RequestInit;
    expect(headerValue(retryInit, 'Cookie')).toBe('dbcl2="abc"; bid=xyz');
  });

  it('后续请求复用缓存 cookie，不再走验证流程', async () => {
    mockVerificationFlow();
    await fetchDoubanWithVerification(MOVIE_URL);

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchDoubanWithVerification(MOVIE_URL);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(headerValue(init, 'Cookie')).toBe('dbcl2="abc"; bid=xyz');
  });
});

export {};
