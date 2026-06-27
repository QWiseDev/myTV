import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockRouterPush = jest.fn();
const mockDeleteFavorite = jest.fn();
const mockDeletePlayRecord = jest.fn();
const mockIsFavorited = jest.fn();
const mockSaveFavorite = jest.fn();
const mockSubscribeToDataUpdates = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (
    props: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
      fill?: boolean;
      priority?: boolean;
      src: string | { src: string };
      unoptimized?: boolean;
    },
  ) => {
    const { src, ...imageProps } = props;
    delete imageProps.fill;
    delete imageProps.priority;
    delete imageProps.unoptimized;

    return React.createElement('img', {
      ...imageProps,
      src: typeof src === 'string' ? src : src.src,
    });
  },
}));

jest.mock('@/lib/db.client', () => ({
  deleteFavorite: mockDeleteFavorite,
  deletePlayRecord: mockDeletePlayRecord,
  generateStorageKey: (source: string, id: string) => `${source}+${id}`,
  isFavorited: mockIsFavorited,
  saveFavorite: mockSaveFavorite,
  subscribeToDataUpdates: mockSubscribeToDataUpdates,
}));

let VideoCard: typeof import('./VideoCard').default;

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
};

type FavoriteUpdateHandler = (favorites: Record<string, unknown>) => void;

const bangumiPoster = 'http://lain.bgm.tv/pic/cover/l/27/ff/377130_wDU1x.jpg';

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function openActionSheet() {
  fireEvent.contextMenu(screen.getAllByText('测试影片')[0]);
}

function renderSourceBackedCard() {
  return render(
    <VideoCard
      from='playrecord'
      id='video-a'
      poster='https://cdn.example/poster.jpg'
      source='source-a'
      source_name='测试源'
      title='测试影片'
    />,
  );
}

describe('VideoCard behavior', () => {
  let favoriteUpdateHandler: FavoriteUpdateHandler | undefined;
  let originalCancelIdleCallback: IdleWindow['cancelIdleCallback'];
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalRequestIdleCallback: IdleWindow['requestIdleCallback'];
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalScrollTo: typeof window.scrollTo;

  beforeAll(async () => {
    VideoCard = (await import('./VideoCard')).default;
  });

  beforeEach(() => {
    favoriteUpdateHandler = undefined;
    localStorage.clear();
    mockRouterPush.mockReset();
    mockDeleteFavorite.mockReset();
    mockDeletePlayRecord.mockReset();
    mockIsFavorited.mockReset();
    mockSaveFavorite.mockReset();
    mockSubscribeToDataUpdates.mockReset();
    mockSubscribeToDataUpdates.mockImplementation(
      (_event: string, handler: FavoriteUpdateHandler) => {
        favoriteUpdateHandler = handler;
        return jest.fn();
      },
    );

    originalCancelIdleCallback = (window as IdleWindow).cancelIdleCallback;
    originalRequestIdleCallback = (window as IdleWindow).requestIdleCallback;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalScrollTo = window.scrollTo;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    window.cancelAnimationFrame = jest.fn();
    window.scrollTo = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalCancelIdleCallback) {
      (window as IdleWindow).cancelIdleCallback = originalCancelIdleCallback;
    } else {
      Reflect.deleteProperty(window, 'cancelIdleCallback');
    }
    if (originalRequestIdleCallback) {
      (window as IdleWindow).requestIdleCallback = originalRequestIdleCallback;
    } else {
      Reflect.deleteProperty(window, 'requestIdleCallback');
    }
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.scrollTo = originalScrollTo;
  });

  it('falls back to the next poster URL after an image error', async () => {
    render(
      <VideoCard from='douban' poster={bangumiPoster} title='测试影片' />,
    );

    const image = screen.getByAltText('测试影片');
    expect(image.getAttribute('src')).toBe(
      `/api/image-proxy?url=${encodeURIComponent(bangumiPoster)}`,
    );

    fireEvent.error(image);

    await waitFor(() => {
      expect(image.getAttribute('src')).toBe('/logo.svg');
    });
  });

  it('resets image fallback after the image proxy config changes', async () => {
    render(
      <VideoCard from='douban' poster={bangumiPoster} title='测试影片' />,
    );

    const image = screen.getByAltText('测试影片');
    fireEvent.error(image);

    await waitFor(() => {
      expect(image.getAttribute('src')).toBe('/logo.svg');
    });

    act(() => {
      window.dispatchEvent(new Event('doubanImageProxyChanged'));
    });

    await waitFor(() => {
      expect(image.getAttribute('src')).toBe(
        `/api/image-proxy?url=${encodeURIComponent(bangumiPoster)}`,
      );
    });
  });

  it('marks the poster as loaded after the image load event', async () => {
    render(
      <VideoCard
        from='douban'
        poster='https://cdn.example/poster.jpg'
        title='测试影片'
      />,
    );

    const image = screen.getByAltText('测试影片');
    expect(image.className).toContain('opacity-0');

    fireEvent.load(image);

    await waitFor(() => {
      expect(image.className).toContain('opacity-100');
    });
  });

  it('loads favorite status after the fallback delay and follows favorite updates', async () => {
    jest.useFakeTimers();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    mockIsFavorited.mockResolvedValue(true);

    renderSourceBackedCard();

    expect(mockIsFavorited).not.toHaveBeenCalled();
    expect(mockSubscribeToDataUpdates).toHaveBeenCalledWith(
      'favoritesUpdated',
      expect.any(Function),
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
      await flushAsyncWork();
    });

    expect(mockIsFavorited).toHaveBeenCalledWith('source-a', 'video-a');

    openActionSheet();

    expect(await screen.findByText('取消收藏')).not.toBeNull();

    act(() => {
      favoriteUpdateHandler?.({});
    });

    await waitFor(() => {
      expect(screen.getByText('添加收藏')).not.toBeNull();
    });
  });

  it('cancels the delayed favorite status check after unmount', async () => {
    jest.useFakeTimers();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    mockIsFavorited.mockResolvedValue(true);

    const { unmount } = renderSourceBackedCard();
    unmount();

    await act(async () => {
      jest.advanceTimersByTime(400);
      await flushAsyncWork();
    });

    expect(mockIsFavorited).not.toHaveBeenCalled();
  });

  it('checks search favorite status when opening the action sheet', async () => {
    let resolveFavoriteStatus: (favorited: boolean) => void = () => undefined;
    mockIsFavorited.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveFavoriteStatus = resolve;
      }),
    );

    render(
      <VideoCard
        from='search'
        id='video-a'
        poster='https://cdn.example/poster.jpg'
        source='source-a'
        source_name='测试源'
        title='测试影片'
      />,
    );

    openActionSheet();

    expect(await screen.findByText('收藏加载中...')).not.toBeNull();

    await waitFor(() => {
      expect(mockIsFavorited).toHaveBeenCalledWith('source-a', 'video-a');
    });

    await act(async () => {
      resolveFavoriteStatus(true);
      await flushAsyncWork();
    });

    expect(await screen.findByText('取消收藏')).not.toBeNull();
  });

  it('deduplicates aggregate sources in the action sheet', async () => {
    render(
      <VideoCard
        from='search'
        isAggregate
        poster='https://cdn.example/poster.jpg'
        source_names={['源 A', '源 A', '源 B']}
        title='测试影片'
      />,
    );

    openActionSheet();

    expect(await screen.findByText('共 2 个播放源')).not.toBeNull();
    expect(screen.getAllByText('源 A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('源 B').length).toBeGreaterThan(0);
  });
});
