/** @jest-environment node */

const mockFetch = jest.fn();
jest.mock('@/lib/config', () => ({ getCacheTime: async () => 300 }));
jest.mock('@/lib/douban-anti-crawler', () => ({
  fetchDoubanWithVerification: mockFetch,
}));
jest.mock('@/lib/douban-challenge', () => ({
  isDoubanChallengePage: () => false,
  bypassDoubanPowChallenge: jest.fn(),
}));
jest.mock('@/lib/douban-comments-parser', () => ({
  parseDoubanCommentsPage: () => ({
    comments: [],
    hasMore: false,
    nextStart: null,
  }),
}));

const primitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
);
let GET: typeof import('./route').GET;

beforeAll(async () => {
  global.Request = primitives.Request;
  global.Response = primitives.Response;
  global.Headers = primitives.Headers;
  ({ GET } = await import('./route'));
});
beforeEach(() => mockFetch.mockReset());

it.each([
  'id=..%2F1',
  'id=1&limit=NaN',
  'id=1&start=Infinity',
  'id=1&sort=invalid',
])('拒绝非法短评参数 %s', async (query) => {
  const response = await GET(
    new Request(`http://localhost/api/douban/comments?${query}`),
  );
  expect(response.status).toBe(400);
  expect(mockFetch).not.toHaveBeenCalled();
});

export {};
