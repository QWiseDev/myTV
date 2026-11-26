import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { clearBrowserAuthCookies } from '@/lib/login-modal';

import PageLayout from './PageLayout';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('./HeaderSearchPanel', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/lib/watching-updates', () => ({
  getCachedWatchingUpdates: () => null,
  getDetailedWatchingUpdates: () => null,
  subscribeToWatchingUpdatesEvent: () => () => undefined,
}));

function clearTestCookies() {
  document.cookie = 'user_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  document.cookie = 'auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

describe('PageLayout guest mode & auth cookie sync', () => {
  beforeEach(() => {
    clearTestCookies();
    localStorage.clear();
  });

  afterEach(() => {
    clearTestCookies();
  });

  it('hides SideNav, search, favorites, and user dropdown in guest mode even with stale cookie', () => {
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({
        username: 'qiuwei',
        role: 'owner',
        signature: 'legacy-sig',
        timestamp: Date.now(),
      }),
    )}; path=/`;

    const { container } = render(
      <PageLayout activePath='/' guest>
        <div>访客内容</div>
      </PageLayout>,
    );

    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.queryByTitle('收藏夹')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'User Menu' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();

    const header = container.querySelector('header');
    expect(header?.className).not.toContain('md:left-44');
  });

  it('treats expired timestamp cookie as logged out on non-guest routes like /play', () => {
    const expiredTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({
        username: 'qiuwei',
        role: 'owner',
        signature: 'old-sig',
        timestamp: expiredTs,
      }),
    )}; path=/`;

    const { container } = render(
      <PageLayout activePath='/play'>
        <div>播放内容</div>
      </PageLayout>,
    );

    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'User Menu' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('immediately hides logged-in chrome and user menu when clearBrowserAuthCookies runs', () => {
    document.cookie = `user_auth=${encodeURIComponent(
      JSON.stringify({
        username: 'qiuwei',
        role: 'owner',
        signature: 'valid-sig',
        timestamp: Date.now(),
      }),
    )}; path=/`;

    const { container } = render(
      <PageLayout activePath='/'>
        <div>首页内容</div>
      </PageLayout>,
    );

    expect(container.querySelector('aside')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'User Menu' }),
    ).toBeInTheDocument();

    act(() => {
      clearBrowserAuthCookies();
    });

    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'User Menu' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });
});
