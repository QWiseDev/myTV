import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='page-layout'>{children}</div>
  ),
}));

describe('GuestHome SSR initialData & caching', () => {
  const originalFetch = global.fetch;
  const originalIntersectionObserver = global.IntersectionObserver;

  beforeEach(() => {
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

  it('renders SSR initialData immediately with zero mount fetch and reuses category cache', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('type_id=2')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'tv1',
                title: '剧集条目',
                poster: '',
                year: '2026',
                type_name: '连续剧',
                remarks: '更新至02集',
              },
            ],
            meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const GuestHome = (await import('./GuestHome')).default;
    render(
      <GuestHome
        initialData={{
          source: {
            key: 'iqiyizyapi.com',
            name: '爱奇艺',
            api: 'https://iqiyizyapi.com/api.php/provide/vod/',
          },
          categories: [
            { type_id: 1, type_name: '电影' },
            { type_id: 2, type_name: '连续剧' },
          ],
          initialCategory: 1,
          initialList: {
            items: [
              {
                id: 'm1',
                title: 'SSR预热电影',
                poster: '',
                year: '2026',
                type_name: '电影',
                remarks: 'HD',
              },
            ],
            meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
          },
        }}
      />,
    );

    expect(screen.getByText('SSR预热电影')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    // 切换到「连续剧」触发一次 /list?type_id=2
    fireEvent.click(screen.getByRole('button', { name: '连续剧' }));
    expect(await screen.findByText('剧集条目')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 切回「电影」命中页内缓存，不再发请求
    fireEvent.click(screen.getByRole('button', { name: '电影' }));
    await waitFor(() => {
      expect(screen.getByText('SSR预热电影')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to bundled sites?includeCategories=1&includeList=1 when initialData is omitted', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [
          {
            key: 'iqiyizyapi.com',
            name: '爱奇艺',
            api: 'https://iqiyizyapi.com/api.php/provide/vod/',
          },
        ],
        initialCategories: [{ type_id: 1, type_name: '电影' }],
        initialCategory: 1,
        initialList: {
          items: [
            {
              id: 'm2',
              title: '兜底合并返回电影',
              poster: '',
              year: '2026',
              type_name: '电影',
              remarks: 'HD',
            },
          ],
          meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
        },
      }),
    });
    global.fetch = fetchMock;

    const GuestHome = (await import('./GuestHome')).default;
    render(<GuestHome />);

    expect(await screen.findByText('兜底合并返回电影')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/source-browser/sites?includeCategories=1&includeList=1',
    );
  });
});
