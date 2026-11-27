import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({
    children,
    guest,
  }: {
    children: React.ReactNode;
    guest?: boolean;
  }) => (
    <div data-testid='page-layout' data-guest={String(Boolean(guest))}>
      {children}
    </div>
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
    document.cookie =
      'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
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

  it('forces guest layout and clears residual auth cookies on mount', async () => {
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({ username: 'qiuwei', role: 'owner' }),
    )}; path=/`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sources: [] }),
    }) as unknown as typeof fetch;

    const GuestHome = (await import('./GuestHome')).default;
    render(
      <GuestHome
        initialData={{
          source: {
            key: 'iqiyizyapi.com',
            name: '爱奇艺',
            api: 'https://iqiyizyapi.com/api.php/provide/vod/',
          },
          categories: [{ type_id: 1, type_name: '电影' }],
          initialCategory: 1,
          initialList: {
            items: [],
            meta: { page: 1, pagecount: 1, total: 0, limit: 20 },
          },
        }}
      />,
    );

    expect(screen.getByTestId('page-layout')).toHaveAttribute(
      'data-guest',
      'true',
    );
    await waitFor(() => {
      expect(document.cookie).not.toContain('user_auth=');
    });
  });

  it('supports numeric type_id 0 and preserves existing items when loading next page fails', async () => {
    const observerHolder: {
      cb: ((entries: IntersectionObserverEntry[]) => void) | null;
    } = { cb: null };
    global.IntersectionObserver = jest.fn((cb) => {
      observerHolder.cb = cb;
      return {
        observe: jest.fn(),
        disconnect: jest.fn(),
        unobserve: jest.fn(),
      };
    }) as unknown as typeof IntersectionObserver;

    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('type_id=0&page=1')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'z1',
                title: '零分类影片',
                poster: '',
                year: '2026',
                type_name: '全部',
              },
            ],
            meta: { page: 1, pagecount: 2, total: 2, limit: 20 },
          }),
        };
      }
      if (url.includes('type_id=0&page=2')) {
        return { ok: false };
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
          categories: [{ type_id: 0, type_name: '全部' }],
          initialCategory: 0,
        }}
      />,
    );

    expect(await screen.findByText('零分类影片')).toBeInTheDocument();

    // 触发第二页加载失败：应保留第一页条目并给出重试按钮
    await act(async () => {
      observerHolder.cb?.([
        { isIntersecting: true } as IntersectionObserverEntry,
      ]);
    });

    expect(await screen.findByText(/点击重试/)).toBeInTheDocument();
    expect(screen.getByText('零分类影片')).toBeInTheDocument();
  });
});
