/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockResolveRequestUser = jest.fn();
const mockGetAdultApiSites = jest.fn();
const mockGetAvailableApiSites = jest.fn();
const mockCheckGuestRateLimit = jest.fn();
const mockGetGuestSource = jest.fn();
const mockFetchSourceCategories = jest.fn();
const mockFetchSourceVideoList = jest.fn();

jest.mock('@/lib/auth', () => ({
  resolveRequestUser: (...args: unknown[]) => mockResolveRequestUser(...args),
}));

jest.mock('@/lib/config', () => ({
  getAdultApiSites: (...args: unknown[]) => mockGetAdultApiSites(...args),
  getAvailableApiSites: (...args: unknown[]) =>
    mockGetAvailableApiSites(...args),
}));

jest.mock('@/lib/guest-source', () => ({
  checkGuestRateLimit: (...args: unknown[]) => mockCheckGuestRateLimit(...args),
  getGuestSource: (...args: unknown[]) => mockGetGuestSource(...args),
}));

jest.mock('@/lib/source-browser.server', () => ({
  fetchSourceCategories: (...args: unknown[]) =>
    mockFetchSourceCategories(...args),
  fetchSourceVideoList: (...args: unknown[]) =>
    mockFetchSourceVideoList(...args),
}));

const ADULT_SITE = {
  key: 'jp98.vip',
  name: '黄果',
  api: 'https://jp98.vip/api.php/provide/vod/',
};

const GUEST_SITE = {
  key: 'iqiyizyapi.com',
  name: '爱奇艺',
  api: 'https://iqiyizyapi.com/api.php/provide/vod/',
};

describe('/api/source-browser/sites', () => {
  let GET: typeof import('./route').GET;

  beforeAll(async () => {
    ({ GET } = await import('./route'));
  });

  beforeEach(() => {
    mockResolveRequestUser.mockReset();
    mockGetAdultApiSites.mockReset();
    mockGetAvailableApiSites.mockReset();
    mockCheckGuestRateLimit.mockReset().mockReturnValue(null);
    mockGetGuestSource.mockReset();
    mockFetchSourceCategories.mockReset();
    mockFetchSourceVideoList.mockReset();
  });

  it('bundles categories and default AI短剧 page 1 for logged-in adult module', async () => {
    mockResolveRequestUser.mockResolvedValue({ username: 'alice' });
    mockGetAdultApiSites.mockResolvedValue([ADULT_SITE]);
    mockFetchSourceCategories.mockResolvedValue([
      { type_id: 20, type_name: '国产' },
      { type_id: 57, type_name: 'AI短剧' },
    ]);
    mockFetchSourceVideoList.mockResolvedValue({
      items: [{ id: '1', title: '测试短剧', poster: '', year: '2026' }],
      meta: { page: 1, pagecount: 2, total: 20, limit: 20 },
    });

    const req = new NextRequest(
      'http://localhost/api/source-browser/sites?group=adult&includeCategories=1&includeList=1',
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetAdultApiSites).toHaveBeenCalledWith('alice');
    expect(mockFetchSourceCategories).toHaveBeenCalledWith(ADULT_SITE);
    expect(mockFetchSourceVideoList).toHaveBeenCalledWith(ADULT_SITE, '57', 1);
    expect(body).toEqual({
      sources: [ADULT_SITE],
      initialCategories: [
        { type_id: 20, type_name: '国产' },
        { type_id: 57, type_name: 'AI短剧' },
      ],
      initialCategory: 57,
      initialList: {
        items: [{ id: '1', title: '测试短剧', poster: '', year: '2026' }],
        meta: { page: 1, pagecount: 2, total: 20, limit: 20 },
      },
    });
  });

  it('still returns sources and categories if initialList prefetch fails', async () => {
    mockResolveRequestUser.mockResolvedValue({ username: 'alice' });
    mockGetAdultApiSites.mockResolvedValue([ADULT_SITE]);
    mockFetchSourceCategories.mockResolvedValue([
      { type_id: 57, type_name: 'AI短剧' },
    ]);
    mockFetchSourceVideoList.mockRejectedValue(new Error('upstream timeout'));

    const req = new NextRequest(
      'http://localhost/api/source-browser/sites?group=adult&includeCategories=1&includeList=1',
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      sources: [ADULT_SITE],
      initialCategories: [{ type_id: 57, type_name: 'AI短剧' }],
      initialCategory: 57,
    });
  });

  it('restricts guests to guest source even when group=adult is passed', async () => {
    mockResolveRequestUser.mockResolvedValue(null);
    mockGetGuestSource.mockResolvedValue(GUEST_SITE);
    mockFetchSourceCategories.mockResolvedValue([
      { type_id: 1, type_name: '电影' },
    ]);

    const req = new NextRequest(
      'http://localhost/api/source-browser/sites?group=adult&includeCategories=1',
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetAdultApiSites).not.toHaveBeenCalled();
    expect(body.sources).toEqual([GUEST_SITE]);
    expect(body.initialCategories).toEqual([{ type_id: 1, type_name: '电影' }]);
    expect(body.initialCategory).toBe(1);
  });
});

export {};
