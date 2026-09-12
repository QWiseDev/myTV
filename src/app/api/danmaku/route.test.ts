/** @jest-environment node */

const mockGetConfig = jest.fn();
jest.mock('@/lib/config', () => ({ getConfig: mockGetConfig }));
const primitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
);
let GET: typeof import('./route').GET;

beforeAll(async () => {
  global.Headers = primitives.Headers;
  global.Request = primitives.Request;
  global.Response = primitives.Response;
  ({ GET } = await import('./route'));
});
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      animes: [{ animeId: 1, animeTitle: '测试' }],
    }),
  });
  mockGetConfig.mockReset().mockResolvedValue({
    DanmuConfig: { apiBaseUrl: 'https://danmu.example' },
  });
});

it.each([
  'action=unknown',
  'action=episodes&id=..%2Fsecret',
  'action=search&keyword=',
])('拒绝无效参数 %s', async (query) => {
  expect(
    (await GET(new Request(`http://localhost/api/danmaku?${query}`))).status,
  ).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('只能向管理员配置的地址转发并拒绝重定向', async () => {
  const response = await GET(
    new Request(
      'http://localhost/api/danmaku?action=search&keyword=测试&url=https://evil.example',
    ),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    animes: [{ id: '1', title: '测试', episodeCount: 0 }],
  });
  expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain(
    'https://danmu.example/api/v2/search/anime?',
  );
  expect(global.fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ redirect: 'error' }),
  );
});

it('未配置服务时返回可操作提示', async () => {
  mockGetConfig.mockResolvedValue({});
  const response = await GET(
    new Request('http://localhost/api/danmaku?action=search&keyword=test'),
  );
  expect(response.status).toBe(503);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('不将上游业务错误当作空数据或回显敏感信息', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ success: false, errorMessage: 'secret-token' }),
  });
  const response = await GET(
    new Request('http://localhost/api/danmaku?action=comment&id=1'),
  );
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('secret-token');
});

export {};
