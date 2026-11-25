import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockPush = jest.fn();
let mockGroupParam: string | null = 'adult';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'group' ? mockGroupParam : null),
    toString: () => (mockGroupParam ? `group=${mockGroupParam}` : ''),
  }),
  usePathname: () => '/source-browser',
}));

jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='page-layout'>{children}</div>
  ),
}));

jest.mock('@/hooks/useSourceBrowserAnalytics', () => ({
  useSourceBrowserAnalytics: () => ({
    handleSourceListLoad: jest.fn(),
    handleSourceError: jest.fn(),
    handleSourceClick: jest.fn(),
    handleFilterChange: jest.fn(),
    handleSearch: jest.fn(),
  }),
}));

describe('SourceBrowserPage initial bundle & cache', () => {
  const originalFetch = global.fetch;
  const originalIntersectionObserver = global.IntersectionObserver;

  beforeEach(() => {
    mockGroupParam = 'adult';
    mockPush.mockReset();
    global.IntersectionObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
      unobserve: jest.fn(),
    })) as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.IntersectionObserver = originalIntersectionObserver;
    jest.restoreAllMocks();
  });

  it('loads adult module in a single sites request when categories and list are bundled', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sources: [
          {
            key: 'jp98.vip',
            name: '黄果',
            api: 'https://jp98.vip/api.php/provide/vod/',
          },
        ],
        initialCategories: [
          { type_id: 20, type_name: '国产' },
          { type_id: 57, type_name: 'AI短剧' },
        ],
        initialCategory: 57,
        initialList: {
          items: [
            {
              id: 'v1',
              title: '预加载短剧',
              poster: '',
              year: '2026',
              type_name: 'AI短剧',
              remarks: '更新至01集',
            },
          ],
          meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
        },
      }),
    });
    global.fetch = fetchMock;

    const SourceBrowserPage = (await import('./page')).default;
    render(<SourceBrowserPage />);

    expect(await screen.findByText('预加载短剧')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI短剧' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/source-browser/sites?group=adult&includeCategories=1&includeList=1',
    );
  });

  it('falls back to /list when initialList is omitted and caches category page 1 in session', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.startsWith('/api/source-browser/sites')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sources: [
              {
                key: 'jp98.vip',
                name: '黄果',
                api: 'https://jp98.vip/api.php/provide/vod/',
              },
            ],
            initialCategories: [
              { type_id: 20, type_name: '国产' },
              { type_id: 57, type_name: 'AI短剧' },
            ],
            initialCategory: 57,
          }),
        };
      }
      if (
        url.includes('/api/source-browser/list') &&
        url.includes('type_id=57')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 'v57',
                title: 'AI短剧回退条目',
                poster: '',
                year: '2026',
                type_name: 'AI短剧',
                remarks: 'HD',
              },
            ],
            meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
          }),
        };
      }
      if (
        url.includes('/api/source-browser/list') &&
        url.includes('type_id=20')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 'v20',
                title: '国产列表条目',
                poster: '',
                year: '2026',
                type_name: '国产',
                remarks: 'HD',
              },
            ],
            meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const SourceBrowserPage = (await import('./page')).default;
    render(<SourceBrowserPage />);

    expect(await screen.findByText('AI短剧回退条目')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 切换到「国产」触发一次 /list?type_id=20
    fireEvent.click(screen.getByRole('button', { name: '国产' }));
    expect(await screen.findByText('国产列表条目')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 切回「AI短剧」应命中页内缓存，不再发网络请求
    fireEvent.click(screen.getByRole('button', { name: 'AI短剧' }));
    await waitFor(() => {
      expect(screen.getByText('AI短剧回退条目')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('navigates directly to the selected adult source without prefer=true when clicking play', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.startsWith('/api/source-browser/sites')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sources: [
              {
                key: 'jp98.vip',
                name: '黄果',
                api: 'https://jp98.vip/api.php/provide/vod/',
              },
            ],
            initialCategories: [{ type_id: 57, type_name: 'AI短剧' }],
            initialCategory: 57,
            initialList: {
              items: [
                {
                  id: '39394',
                  title: '《裙下之臣：逃出魔窟》',
                  poster: '',
                  year: '2026',
                  type_name: 'AI短剧',
                  remarks: '完结',
                },
              ],
              meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
            },
          }),
        };
      }
      if (url.startsWith('/api/detail')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: '39394',
            source: 'jp98.vip',
            source_name: '黄果',
            title: '《裙下之臣：逃出魔窟》',
            year: '2026',
            episodes: ['https://jp98.vip/1.m3u8'],
            episodes_titles: ['第1集'],
            adult: true,
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const SourceBrowserPage = (await import('./page')).default;
    render(<SourceBrowserPage />);

    const cardTitle = await screen.findByText('《裙下之臣：逃出魔窟》');
    fireEvent.click(cardTitle);

    const playButton = await screen.findByRole('button', { name: '立即播放' });
    fireEvent.click(playButton);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedUrl = String(mockPush.mock.calls[0][0]);
    const parsed = new URL(pushedUrl, 'https://example.com');
    expect(parsed.pathname).toBe('/play');
    expect(parsed.searchParams.get('source')).toBe('jp98.vip');
    expect(parsed.searchParams.get('id')).toBe('39394');
    expect(parsed.searchParams.get('title')).toBe('《裙下之臣：逃出魔窟》');
    expect(parsed.searchParams.get('year')).toBe('2026');
    expect(parsed.searchParams.has('prefer')).toBe(false);
  });
});
