import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import type { UserMenuFavoriteRecord } from '@/lib/favorite-items';
import type { UserMenuSettingsSnapshot } from '@/lib/user-menu-settings';
import {
  type UserMenuWatchingUpdatesState,
  buildUserMenuWatchingUpdatesState,
} from '@/lib/user-menu-watching-updates';

import { UserMenuChangePasswordPanel } from './UserMenuChangePasswordPanel';
import { UserMenuDropdownPanel } from './UserMenuDropdownPanel';
import {
  UserMenuContinueWatchingPanel,
  UserMenuFavoritesPanel,
  UserMenuWatchingUpdatesPanel,
} from './UserMenuMediaPanels';
import { UserMenuPanelBackdrop } from './UserMenuPanelPrimitives';
import { UserMenuSettingsPanel } from './UserMenuSettingsPanel';

const mockVideoCard = jest.fn(({ title }: { title: string }) => (
  <div data-testid='video-card'>{title}</div>
));

jest.mock('../VideoCard', () => ({
  __esModule: true,
  default: (props: { title: string }) => mockVideoCard(props),
}));

const DEFAULT_SETTINGS: UserMenuSettingsSnapshot = {
  continueWatchingMaxProgress: 100,
  continueWatchingMinProgress: 5,
  defaultAggregateSearch: true,
  doubanDataSource: 'direct',
  doubanImageProxyType: 'direct',
  doubanImageProxyUrl: '',
  doubanProxyUrl: '',
  enableAutoNextEpisode: true,
  enableAutoSkip: false,
  enableContinueWatchingFilter: false,
  enableOptimization: false,
  fluidSearch: true,
  liveDirectConnect: false,
};

function createWatchingUpdatesState(): UserMenuWatchingUpdatesState {
  return buildUserMenuWatchingUpdatesState({
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
        newEpisodes: 2,
        source_name: '测试源',
        sourceKey: 'source',
        title: '更新剧集',
        totalEpisodes: 4,
        videoId: 'video',
        year: '2026',
      },
    ],
  });
}

function getSettingInput(title: string, selector: string): HTMLInputElement {
  const titleElement = screen.getByText(title);
  const directContainer = titleElement.parentElement;
  const input =
    directContainer?.querySelector<HTMLInputElement>(selector) ||
    directContainer?.parentElement?.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`找不到 ${title} 输入项`);

  return input;
}

describe('UserMenu presentation panels', () => {
  beforeEach(() => {
    mockVideoCard.mockClear();
  });

  it('keeps the shared backdrop close and scroll-prevention contract', () => {
    const onClick = jest.fn();
    const { container } = render(<UserMenuPanelBackdrop onClick={onClick} />);
    const backdrop = container.firstElementChild as HTMLElement;
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = jest.spyOn(wheelEvent, 'preventDefault');

    fireEvent(backdrop, wheelEvent);
    fireEvent.click(backdrop);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(backdrop).toHaveClass('bg-black/50', 'z-[1000]');
  });

  it('renders dropdown permissions, counts and action callbacks from props', () => {
    const onSettings = jest.fn();
    const onOpenVersionPanel = jest.fn();

    render(
      <UserMenuDropdownPanel
        currentRole='owner'
        favoritesCount={3}
        hasUnreadUpdates
        isAdminUser
        onAdminPanel={jest.fn()}
        onChangePassword={jest.fn()}
        onClose={jest.fn()}
        onContinueWatching={jest.fn()}
        onFavorites={jest.fn()}
        onLogout={jest.fn()}
        onOpenVersionPanel={onOpenVersionPanel}
        onPlayStats={jest.fn()}
        onReleaseCalendar={jest.fn()}
        onSettings={onSettings}
        onSourceTest={jest.fn()}
        onTVBoxConfig={jest.fn()}
        onWatchingUpdates={jest.fn()}
        playRecordsCount={2}
        showAdminPanel
        showChangePassword={false}
        showPlayStats
        showSourceTest
        showWatchingUpdates
        storageType='redis'
        totalUpdates={120}
        username='alice'
      />,
    );

    expect(screen.getByText('站长')).toBeInTheDocument();
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^继续观看/ })).toHaveTextContent(
      '2',
    );
    expect(screen.getByRole('button', { name: /^我的收藏/ })).toHaveTextContent(
      '3',
    );
    expect(
      screen.queryByRole('button', { name: '修改密码' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    const versionButton = screen.getByText(/^v/).closest('button');
    if (!versionButton) throw new Error('找不到版本入口');
    expect(versionButton.querySelector('.bg-green-400')).toBeInTheDocument();
    fireEvent.click(versionButton);

    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onOpenVersionPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps settings conditional fields and explicit callbacks', () => {
    const onReset = jest.fn();
    const onDataSourceChange = jest.fn();
    const onDataSourceDropdownOpenChange = jest.fn();
    const onAutoSkipChange = jest.fn();
    const onMaxProgressChange = jest.fn();

    render(
      <UserMenuSettingsPanel
        isDoubanDataSourceDropdownOpen
        isDoubanImageProxyDropdownOpen={false}
        onAutoNextEpisodeChange={jest.fn()}
        onAutoSkipChange={onAutoSkipChange}
        onClose={jest.fn()}
        onContinueWatchingFilterChange={jest.fn()}
        onContinueWatchingMaxProgressChange={onMaxProgressChange}
        onContinueWatchingMinProgressChange={jest.fn()}
        onDefaultAggregateSearchChange={jest.fn()}
        onDoubanDataSourceChange={onDataSourceChange}
        onDoubanDataSourceDropdownOpenChange={onDataSourceDropdownOpenChange}
        onDoubanImageProxyDropdownOpenChange={jest.fn()}
        onDoubanImageProxyTypeChange={jest.fn()}
        onDoubanImageProxyUrlChange={jest.fn()}
        onDoubanProxyUrlChange={jest.fn()}
        onFluidSearchChange={jest.fn()}
        onLiveDirectConnectChange={jest.fn()}
        onOptimizationChange={jest.fn()}
        onReset={onReset}
        settings={{
          ...DEFAULT_SETTINGS,
          doubanDataSource: 'custom',
          doubanImageProxyType: 'custom',
          enableContinueWatchingFilter: true,
        }}
      />,
    );

    expect(
      screen.getAllByPlaceholderText(
        '例如: https://proxy.example.com/fetch?url=',
      ),
    ).toHaveLength(2);
    expect(screen.getByText('进度范围设置')).toBeInTheDocument();
    expect(
      document.querySelector('[data-dropdown="douban-datasource"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-dropdown="douban-image-proxy"]'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    const dataSourceDropdown = document.querySelector<HTMLElement>(
      '[data-dropdown="douban-datasource"]',
    );
    if (!dataSourceDropdown) throw new Error('找不到豆瓣数据源下拉框');
    fireEvent.click(
      within(dataSourceDropdown).getAllByRole('button', {
        name: '自定义代理',
      })[1],
    );
    fireEvent.click(getSettingInput('启用自动跳过', 'input[type="checkbox"]'));
    fireEvent.change(getSettingInput('最大进度 (%)', 'input[type="number"]'), {
      target: { value: '' },
    });

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onDataSourceChange).toHaveBeenCalledWith('custom');
    expect(onDataSourceDropdownOpenChange).toHaveBeenCalledWith(false);
    expect(onAutoSkipChange).toHaveBeenCalledWith(true);
    expect(onMaxProgressChange).toHaveBeenCalledWith(100);
  });

  it('keeps the password panel controlled and callback-only', () => {
    const onClose = jest.fn();
    const onNewPasswordChange = jest.fn();
    const onConfirmPasswordChange = jest.fn();
    const onSubmit = jest.fn();

    render(
      <UserMenuChangePasswordPanel
        confirmPassword='old-confirm'
        error='服务端拒绝修改'
        isLoading={false}
        newPassword='old-password'
        onClose={onClose}
        onConfirmPasswordChange={onConfirmPasswordChange}
        onNewPasswordChange={onNewPasswordChange}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('服务端拒绝修改')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('请输入新密码'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByPlaceholderText('请再次输入新密码'), {
      target: { value: 'new-confirm' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onNewPasswordChange).toHaveBeenCalledWith('new-password');
    expect(onConfirmPasswordChange).toHaveBeenCalledWith('new-confirm');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders watching-update cards and badges without owning data loading', () => {
    const state = createWatchingUpdatesState();

    render(<UserMenuWatchingUpdatesPanel onClose={jest.fn()} state={state} />);

    expect(screen.getByText('1部有新集')).toBeInTheDocument();
    expect(screen.getByText('更新剧集')).toBeInTheDocument();
    expect(screen.getByText('+2集')).toBeInTheDocument();
    expect(mockVideoCard).toHaveBeenCalledWith(
      expect.objectContaining({
        currentEpisode: 2,
        from: 'playrecord',
        id: 'video',
        source: 'source',
      }),
    );
  });

  it('keeps continue-watching progress display and new-episode lookup', () => {
    const state = createWatchingUpdatesState();
    const { container } = render(
      <UserMenuContinueWatchingPanel
        enableProgressFilter
        maxProgress={95}
        minProgress={10}
        onClose={jest.fn()}
        records={[
          {
            cover: 'https://example.com/play.jpg',
            index: 2,
            key: 'source+video',
            play_time: 150,
            save_time: 1,
            search_title: '继续观看影片',
            source_name: '测试源',
            title: '继续观看影片',
            total_episodes: 4,
            total_time: 100,
            year: '2026',
          },
        ]}
        watchingUpdatesState={state}
      />,
    );

    expect(screen.getByText('继续观看影片')).toBeInTheDocument();
    expect(screen.getByText('+2集')).toBeInTheDocument();
    expect(screen.getByText('150%')).toBeInTheDocument();
    expect(
      container.querySelector<HTMLElement>('.bg-blue-500.h-1'),
    ).toHaveStyle({ width: '100%' });
  });

  it('renders favorite cards and the existing empty state', () => {
    const favorite: UserMenuFavoriteRecord = {
      cover: 'https://example.com/favorite.jpg',
      key: 'source+favorite',
      save_time: 1,
      search_title: '收藏影片',
      source_name: '测试源',
      title: '收藏影片',
      total_episodes: 1,
      year: '2026',
    };
    const { rerender } = render(
      <UserMenuFavoritesPanel favorites={[favorite]} onClose={jest.fn()} />,
    );

    expect(screen.getByText('收藏影片')).toBeInTheDocument();
    expect(mockVideoCard).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'favorite', id: 'favorite' }),
    );

    rerender(<UserMenuFavoritesPanel favorites={[]} onClose={jest.fn()} />);
    expect(screen.getByText('暂无收藏')).toBeInTheDocument();
  });
});
