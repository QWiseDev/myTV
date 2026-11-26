/** @jest-environment node */

import type { NextRequest } from 'next/server';

import { sharedSelectionCacheKey } from '@/lib/danmaku';

const mockRequireUser = jest.fn();
const mockEnsureUserAccessOrResponse = jest.fn();
const mockGetCache = jest.fn();
const mockSetCache = jest.fn();
const mockDeleteCache = jest.fn();
const mockClearExpiredCache = jest.fn();

jest.mock('@/lib/auth', () => ({
  requireUser: mockRequireUser,
}));

jest.mock('@/lib/user-access', () => ({
  ensureUserAccessOrResponse: mockEnsureUserAccessOrResponse,
}));

jest.mock('@/lib/db', () => ({
  db: {
    getCache: mockGetCache,
    setCache: mockSetCache,
    deleteCache: mockDeleteCache,
    clearExpiredCache: mockClearExpiredCache,
  },
}));

const primitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
);

let POST: typeof import('./route').POST;

function createPostRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeAll(async () => {
  global.Headers = primitives.Headers;
  global.Request = primitives.Request;
  global.Response = primitives.Response;
  ({ POST } = await import('./route'));
});

beforeEach(() => {
  mockRequireUser.mockReset().mockResolvedValue({
    authInfo: { username: 'alice', timestamp: 123 },
  });
  mockEnsureUserAccessOrResponse.mockReset().mockResolvedValue({ ok: true });
  mockSetCache.mockReset().mockResolvedValue(undefined);
});

it('接受经过编码的含空格/通配符/超长片名共享弹幕选集 key 并限制最大 TTL', async () => {
  const complexTitle = `带空格 与 [中括号]?* 的超长片名 ${'长'.repeat(240)}`;
  const key = sharedSelectionCacheKey(`${complexTitle}:2026:9527`, 3);
  const response = await POST(
    createPostRequest({
      key,
      data: { episodeId: 'ep-4', title: '第4集' },
      expireSeconds: 99999999,
    }),
  );

  expect(response.status).toBe(200);
  expect(mockSetCache).toHaveBeenCalledWith(
    key,
    { episodeId: 'ep-4', title: '第4集' },
    7 * 24 * 60 * 60,
  );
});

it.each([
  ['缺少 episodeId', { title: '第1集' }],
  ['非法 episodeId', { episodeId: '../bad', title: '第1集' }],
  ['空白 title', { episodeId: 'ep-1', title: '   ' }],
  ['非对象载荷', ['not-an-object']],
])('拒绝无效的共享弹幕选集载荷 (%s)', async (_label, data) => {
  const key = sharedSelectionCacheKey('测试片:2026:1', 0);
  const response = await POST(createPostRequest({ key, data }));

  expect(response.status).toBe(400);
  expect(mockSetCache).not.toHaveBeenCalled();
});

it('拒绝超过 512KB 的缓存载荷', async () => {
  const response = await POST(
    createPostRequest({
      key: 'danmaku-oversized-key',
      data: { payload: 'x'.repeat(512 * 1024 + 10) },
    }),
  );

  expect(response.status).toBe(413);
  expect(mockSetCache).not.toHaveBeenCalled();
});
