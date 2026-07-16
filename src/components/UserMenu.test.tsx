import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';

import type { Favorite, PlayRecord } from '@/lib/types';

const mockPush = jest.fn();
const mockGetAuthInfoFromBrowserCookie = jest.fn();
const mockGetAllPlayRecords = jest.fn();
const mockGetCachedWatchingUpdates = jest.fn();
const mockGetDetailedWatchingUpdates = jest.fn();
const mockSubscribeToWatchingUpdatesEvent = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromBrowserCookie: mockGetAuthInfoFromBrowserCookie,
}));

jest.mock('@/lib/db.client', () => ({
  getAllPlayRecords: mockGetAllPlayRecords,
}));

jest.mock('@/lib/debug', () => ({
  debug: {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/lib/watching-updates', () => ({
  getCachedWatchingUpdates: mockGetCachedWatchingUpdates,
  getDetailedWatchingUpdates: mockGetDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent: mockSubscribeToWatchingUpdatesEvent,
}));

jest.mock('./VersionPanel', () => ({
  VersionPanel: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role='dialog'>
        <span>版本面板</span>
        <button onClick={onClose}>关闭版本面板</button>
      </div>
    ) : null,
}));

jest.mock('./VideoCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

type RuntimeConfigWindow = Window & {
  RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
};

const originalFetch = global.fetch;
const mockFetch = jest.fn();
let UserMenu: typeof import('./UserMenu').UserMenu;

function createPlayRecord(): PlayRecord {
  return {
    cover: 'https://example.com/play.jpg',
    index: 2,
    play_time: 240,
    save_time: 2000,
    search_title: '继续观看影片',
    source_name: '测试源',
    title: '继续观看影片',
    total_episodes: 12,
    total_time: 1200,
    year: '2026',
  };
}

function createFavorite(): Favorite {
  return {
    cover: 'https://example.com/favorite.jpg',
    save_time: 2000,
    search_title: '收藏影片',
    source_name: '测试源',
    title: '收藏影片',
    total_episodes: 1,
    year: '2026',
  };
}

function createWatchingUpdate() {
  return {
    continueWatchingCount: 0,
    hasUpdates: true,
    timestamp: 1,
    updatedCount: 1,
    updatedSeries: [
      {
        cover: 'https://example.com/update.jpg',
        currentEpisode: 2,
        hasContinueWatching: false,
        hasNewEpisode: true,
        newEpisodes: 1,
        source_name: '测试源',
        sourceKey: 'source',
        title: '更新剧集',
        totalEpisodes: 3,
        videoId: 'updated-video',
        year: '2026',
      },
    ],
  };
}

async function renderMenu({
  role = 'admin',
  storageType = 'redis',
}: {
  role?: 'owner' | 'admin' | 'user';
  storageType?: string;
} = {}) {
  (window as RuntimeConfigWindow).RUNTIME_CONFIG = {
    STORAGE_TYPE: storageType,
  };
  mockGetAuthInfoFromBrowserCookie.mockReturnValue({
    role,
    username: 'alice',
  });

  const renderResult = render(<UserMenu />);

  await waitFor(() => {
    expect(mockGetAuthInfoFromBrowserCookie).toHaveBeenCalledTimes(1);
  });

  return renderResult;
}

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'User Menu' }));
  await screen.findByText('alice');
}

function closePanelFromHeading(name: string) {
  const heading = screen.getByRole('heading', { name });
  const header = heading.parentElement;
  if (!header) throw new Error(`找不到 ${name} 面板标题栏`);

  fireEvent.click(within(header).getByRole('button'));
}

function getSettingCheckbox(title: string): HTMLInputElement {
  const settingTitle = screen.getByText(title);
  const settingRow = settingTitle.closest('.flex.items-center.justify-between');
  const checkbox = settingRow?.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!checkbox) throw new Error(`找不到 ${title} 开关`);

  return checkbox;
}

describe('UserMenu', () => {
  beforeAll(async () => {
    UserMenu = (await import('./UserMenu')).UserMenu;
  });

  beforeEach(() => {
    localStorage.clear();
    mockPush.mockReset();
    mockGetAuthInfoFromBrowserCookie.mockReset();
    mockGetAllPlayRecords.mockReset();
    mockGetCachedWatchingUpdates.mockReset().mockReturnValue(null);
    mockGetDetailedWatchingUpdates.mockReset().mockReturnValue(null);
    mockSubscribeToWatchingUpdatesEvent
      .mockReset()
      .mockImplementation(() => jest.fn());
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  afterEach(() => {
    delete (window as RuntimeConfigWindow).RUNTIME_CONFIG;
    global.fetch = originalFetch;
  });

  it('opens the menu in a portal and keeps owner-only visibility rules', async () => {
    const { container } = await renderMenu({ role: 'owner' });

    await openMenu();

    expect(within(container).queryByText('当前用户')).not.toBeInTheDocument();
    expect(screen.getByText('站长')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '管理面板' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '源检测' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '修改密码' }),
    ).not.toBeInTheDocument();

    const backdrop = document.querySelector('.fixed.inset-0.bg-transparent');
    if (!backdrop) throw new Error('找不到菜单遮罩');
    fireEvent.click(backdrop);

    expect(screen.queryByText('当前用户')).not.toBeInTheDocument();
  });

  it('hides server-only entries in localstorage mode', async () => {
    await renderMenu({ role: 'user', storageType: 'localstorage' });

    await openMenu();

    expect(screen.queryByText('更新提醒')).not.toBeInTheDocument();
    expect(screen.queryByText('继续观看')).not.toBeInTheDocument();
    expect(screen.queryByText('我的收藏')).not.toBeInTheDocument();
    expect(screen.queryByText('个人统计')).not.toBeInTheDocument();
    expect(screen.queryByText('修改密码')).not.toBeInTheDocument();
  });

  it('navigates from the menu and closes the portal', async () => {
    await renderMenu();
    await openMenu();

    fireEvent.click(screen.getByRole('button', { name: '播放统计' }));

    expect(mockPush).toHaveBeenCalledWith('/play-stats');
    expect(screen.queryByText('当前用户')).not.toBeInTheDocument();
  });

  it('keeps the menu open for the existing admin navigation path', async () => {
    await renderMenu({ role: 'owner' });
    await openMenu();

    fireEvent.click(screen.getByRole('button', { name: '管理面板' }));

    expect(mockPush).toHaveBeenCalledWith('/admin');
    expect(screen.getByText('当前用户')).toBeInTheDocument();
  });

  it('opens and closes the version panel from the menu footer', async () => {
    await renderMenu();
    await openMenu();

    const versionLabel = screen.getByText(/^v/);
    const versionButton = versionLabel.closest('button');
    if (!versionButton) throw new Error('找不到版本入口');
    fireEvent.click(versionButton);

    expect(screen.getByRole('dialog')).toHaveTextContent('版本面板');
    expect(screen.queryByText('当前用户')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭版本面板' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('locks page scrolling while settings are open and restores original styles', async () => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'scroll';
    await renderMenu();
    await openMenu();

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    await screen.findByRole('heading', { name: '本地设置' });
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '本地设置' }),
      ).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('auto');
      expect(document.documentElement.style.overflow).toBe('scroll');
    });
  });

  it('persists skip settings and dispatches the existing storage event', async () => {
    const storageEvent = jest.fn();
    window.addEventListener('localStorageChanged', storageEvent);
    await renderMenu();
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    await screen.findByRole('heading', { name: '本地设置' });

    fireEvent.click(getSettingCheckbox('启用自动跳过'));

    expect(localStorage.getItem('enableAutoSkip')).toBe('true');
    expect(storageEvent).toHaveBeenCalledTimes(1);
    window.removeEventListener('localStorageChanged', storageEvent);
  });

  it('restores persisted settings and dispatches the image proxy event', async () => {
    localStorage.setItem('enableAutoSkip', 'true');
    const proxyEvent = jest.fn();
    window.addEventListener('doubanImageProxyChanged', proxyEvent);
    await renderMenu();
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    await screen.findByRole('heading', { name: '本地设置' });

    expect(getSettingCheckbox('启用自动跳过').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));

    expect(getSettingCheckbox('启用自动跳过').checked).toBe(false);
    expect(localStorage.getItem('enableAutoSkip')).toBe('false');
    expect(proxyEvent).toHaveBeenCalledTimes(1);
    window.removeEventListener('doubanImageProxyChanged', proxyEvent);
  });

  it('shows the custom Douban proxy field only after selecting custom', async () => {
    await renderMenu();
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    await screen.findByRole('heading', { name: '本地设置' });

    expect(
      screen.queryByPlaceholderText(
        '例如: https://proxy.example.com/fetch?url=',
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: '直连（服务器直接请求豆瓣）',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '自定义代理' }));

    expect(
      screen.getByPlaceholderText('例如: https://proxy.example.com/fetch?url='),
    ).toBeInTheDocument();
    expect(localStorage.getItem('doubanDataSource')).toBe('custom');
  });

  it('loads continue-watching records only while its panel is active', async () => {
    mockGetAllPlayRecords.mockResolvedValue({
      'source+video': createPlayRecord(),
    });
    await renderMenu();

    expect(mockGetAllPlayRecords).not.toHaveBeenCalled();
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '继续观看' }));

    expect(await screen.findByText('继续观看影片')).toBeInTheDocument();
    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('playRecordsUpdated'));
    });
    await waitFor(() => {
      expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
    });

    closePanelFromHeading('继续观看');
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '继续观看' }),
      ).not.toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new Event('playRecordsUpdated'));
    });
    expect(mockGetAllPlayRecords).toHaveBeenCalledTimes(2);
  });

  it('loads favorites on demand and removes the refresh listener on close', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ 'source+favorite': createFavorite() }),
      ok: true,
    });
    await renderMenu();

    expect(mockFetch).not.toHaveBeenCalled();
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '我的收藏' }));

    expect(await screen.findByText('收藏影片')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/favorites');

    closePanelFromHeading('我的收藏');
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '我的收藏' }),
      ).not.toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new Event('favoritesUpdated'));
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('opens cached watching updates and records the viewed timestamp', async () => {
    const watchingUpdate = createWatchingUpdate();
    mockGetCachedWatchingUpdates.mockReturnValue(true);
    mockGetDetailedWatchingUpdates.mockReturnValue(watchingUpdate);
    await renderMenu();
    await openMenu();

    fireEvent.click(screen.getByRole('button', { name: /更新提醒/ }));

    expect(
      await screen.findByRole('heading', { name: '更新提醒' }),
    ).toBeInTheDocument();
    expect(screen.getByText('更新剧集')).toBeInTheDocument();
    expect(
      Number(localStorage.getItem('watchingUpdatesLastViewed')),
    ).toBeGreaterThan(0);
  });

  it('keeps password validation local when the confirmation does not match', async () => {
    await renderMenu({ role: 'user' });
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    fireEvent.change(screen.getByPlaceholderText('请输入新密码'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByPlaceholderText('请再次输入新密码'), {
      target: { value: 'different-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps the password panel open when the API rejects the change', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ error: '服务端拒绝修改' }),
      ok: false,
    });
    await renderMenu({ role: 'user' });
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    fireEvent.change(screen.getByPlaceholderText('请输入新密码'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByPlaceholderText('请再次输入新密码'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));

    expect(await screen.findByText('服务端拒绝修改')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '修改密码' }),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/change-password', {
      body: JSON.stringify({ newPassword: 'new-password' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  });
});
