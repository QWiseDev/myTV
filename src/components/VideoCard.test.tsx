import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';

const mockDeleteFavorite = jest.fn();
const mockDeletePlayRecord = jest.fn();
const mockIsFavorited = jest.fn();
const mockSaveFavorite = jest.fn();
const mockSubscribeToDataUpdates = jest.fn();
const mockMobileActionSheetExited = jest.fn();
const mockMobileActionSheetUnmount = jest.fn();
const mockNavigateVideoCardPlayUrl = jest.fn();

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
    const { src, unoptimized, ...imageProps } = props;
    delete imageProps.fill;
    delete imageProps.priority;

    return React.createElement('img', {
      ...imageProps,
      'data-unoptimized': String(Boolean(unoptimized)),
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

jest.mock('@/lib/video-card-utils', () => ({
  ...jest.requireActual('@/lib/video-card-utils'),
  navigateVideoCardPlayUrl: mockNavigateVideoCardPlayUrl,
}));

jest.mock('./MobileActionSheet', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react');
  const actualModule = jest.requireActual<typeof import('./MobileActionSheet')>(
    './MobileActionSheet',
  );

  const TrackedMobileActionSheet = (
    props: React.ComponentProps<typeof actualModule.default>,
  ) => {
    actualReact.useEffect(
      () => () => {
        mockMobileActionSheetUnmount();
      },
      [],
    );

    const handleExited = actualReact.useCallback(() => {
      mockMobileActionSheetExited();
      props.onExited();
    }, [props.onExited]);

    return actualReact.createElement(actualModule.default, {
      ...props,
      onExited: handleExited,
    });
  };

  return {
    __esModule: true,
    default: TrackedMobileActionSheet,
  };
});

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
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
  let favoriteUpdateUnsubscribe: jest.Mock;
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
    favoriteUpdateUnsubscribe = jest.fn();
    localStorage.clear();
    mockDeleteFavorite.mockReset();
    mockDeletePlayRecord.mockReset();
    mockIsFavorited.mockReset();
    mockMobileActionSheetExited.mockReset();
    mockMobileActionSheetUnmount.mockReset();
    mockNavigateVideoCardPlayUrl.mockReset();
    mockSaveFavorite.mockReset();
    mockSubscribeToDataUpdates.mockReset();
    mockSubscribeToDataUpdates.mockImplementation(
      (_event: string, handler: FavoriteUpdateHandler) => {
        favoriteUpdateHandler = handler;
        return favoriteUpdateUnsubscribe;
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
    render(<VideoCard from='douban' poster={bangumiPoster} title='测试影片' />);

    const image = screen.getByAltText('测试影片');
    expect(image.getAttribute('src')).toBe(
      `/api/image-proxy?url=${encodeURIComponent(bangumiPoster)}`,
    );

    fireEvent.error(image);

    await waitFor(() => {
      expect(image.getAttribute('src')).toBe('/logo.svg');
    });
  });

  it('falls back from a regular external poster to the local placeholder', async () => {
    render(
      <VideoCard
        from='douban'
        poster='https://cdn.example/poster.jpg'
        title='测试影片'
      />,
    );

    const image = screen.getByAltText('测试影片');
    fireEvent.error(image);

    await waitFor(() => {
      expect(image.getAttribute('src')).toBe('/logo.svg');
    });
  });

  it('reuses the current poster fallback in the action sheet', async () => {
    render(<VideoCard from='douban' poster={bangumiPoster} title='测试影片' />);

    const cardImage = screen.getByAltText('测试影片');
    fireEvent.error(cardImage);

    await waitFor(() => {
      expect(cardImage.getAttribute('src')).toBe('/logo.svg');
    });

    openActionSheet();

    const actionSheetImage = screen
      .getAllByAltText('测试影片')
      .find((image) => image !== cardImage);
    expect(actionSheetImage?.getAttribute('src')).toBe('/logo.svg');
    expect(actionSheetImage?.getAttribute('sizes')).toBe('48px');
    expect(actionSheetImage?.getAttribute('data-unoptimized')).toBe('false');
  });

  it('keeps external action sheet posters unoptimized', () => {
    render(
      <VideoCard
        from='douban'
        poster='https://cdn.example/poster.jpg'
        title='测试影片'
      />,
    );

    const cardImage = screen.getByAltText('测试影片');
    openActionSheet();

    const actionSheetImage = screen
      .getAllByAltText('测试影片')
      .find((image) => image !== cardImage);
    expect(actionSheetImage?.getAttribute('sizes')).toBe('48px');
    expect(actionSheetImage?.getAttribute('data-unoptimized')).toBe('true');
  });

  it('resets image fallback after the image proxy config changes', async () => {
    render(<VideoCard from='douban' poster={bangumiPoster} title='测试影片' />);

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

  it('shares image proxy listeners across multiple cards', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <>
        <VideoCard from='douban' poster={bangumiPoster} title='影片 A' />
        <VideoCard from='douban' poster={bangumiPoster} title='影片 B' />
        <VideoCard from='douban' poster={bangumiPoster} title='影片 C' />
      </>,
    );

    expect(
      addEventListenerSpy.mock.calls.filter(
        ([eventName]) => eventName === 'doubanImageProxyChanged',
      ),
    ).toHaveLength(1);
    expect(
      addEventListenerSpy.mock.calls.filter(
        ([eventName]) => eventName === 'storage',
      ),
    ).toHaveLength(1);

    unmount();

    expect(
      removeEventListenerSpy.mock.calls.filter(
        ([eventName]) => eventName === 'doubanImageProxyChanged',
      ),
    ).toHaveLength(1);
    expect(
      removeEventListenerSpy.mock.calls.filter(
        ([eventName]) => eventName === 'storage',
      ),
    ).toHaveLength(1);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('shares one favorite update subscription across source-backed cards', async () => {
    const renderCards = (showFirst: boolean) => (
      <>
        {showFirst && (
          <VideoCard
            key='card-a'
            from='playrecord'
            id='video-a'
            source='source-a'
            title='影片 A'
          />
        )}
        <VideoCard
          key='card-b'
          from='playrecord'
          id='video-b'
          source='source-b'
          title='影片 B'
        />
      </>
    );
    const { rerender, unmount } = render(renderCards(true));

    expect(mockSubscribeToDataUpdates).toHaveBeenCalledTimes(1);

    act(() => {
      favoriteUpdateHandler?.({
        'source-a+video-a': { title: '影片 A' },
        'source-b+video-b': { title: '影片 B' },
      });
    });
    fireEvent.contextMenu(screen.getAllByText('影片 A')[0]);
    fireEvent.contextMenu(screen.getAllByText('影片 B')[0]);

    expect(await screen.findAllByText('取消收藏')).toHaveLength(2);

    rerender(renderCards(false));
    expect(favoriteUpdateUnsubscribe).not.toHaveBeenCalled();

    unmount();
    expect(favoriteUpdateUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not mount action sheet timers before the first open', () => {
    jest.useFakeTimers();

    render(<VideoCard from='douban' poster={bangumiPoster} title='测试影片' />);

    expect(jest.getTimerCount()).toBe(0);
  });

  it('activates the named playback link exactly once', () => {
    renderSourceBackedCard();

    const playLink = screen.getByRole('link', { name: '播放 测试影片' });
    expect(playLink.getAttribute('href')).toBe(
      '/play?source=source-a&id=video-a&title=%E6%B5%8B%E8%AF%95%E5%BD%B1%E7%89%87',
    );
    playLink.focus();
    expect(document.activeElement).toBe(playLink);
    fireEvent.click(playLink);
    expect(mockNavigateVideoCardPlayUrl).toHaveBeenCalledTimes(1);
    expect(mockNavigateVideoCardPlayUrl).toHaveBeenCalledWith(
      '/play?source=source-a&id=video-a&title=%E6%B5%8B%E8%AF%95%E5%BD%B1%E7%89%87',
    );

    mockNavigateVideoCardPlayUrl.mockClear();
    fireEvent.click(playLink, { detail: 0 });
    expect(mockNavigateVideoCardPlayUrl).toHaveBeenCalledTimes(1);

    const favoriteButton = screen.getByRole('button', {
      name: '收藏 测试影片',
    });
    expect(favoriteButton.getAttribute('aria-pressed')).toBe('false');
    expect(
      screen.getByRole('button', { name: '删除 测试影片 的播放记录' }),
    ).not.toBeNull();
  });

  it('preserves native modified-link behavior without triggering card navigation', () => {
    const { container } = renderSourceBackedCard();

    const playLink = screen.getByRole('link', { name: '播放 测试影片' });
    const defaultPreventedByComponent: boolean[] = [];
    const preventJsdomNavigation = (event: MouseEvent) => {
      defaultPreventedByComponent.push(event.defaultPrevented);
      event.preventDefault();
    };
    container.addEventListener('click', preventJsdomNavigation);

    fireEvent.click(playLink, { ctrlKey: true });
    fireEvent.click(playLink, { metaKey: true });

    container.removeEventListener('click', preventJsdomNavigation);

    expect(defaultPreventedByComponent).toEqual([false, false]);
    expect(mockNavigateVideoCardPlayUrl).not.toHaveBeenCalled();
  });

  it('keeps hover-only controls outside pointer hit testing while hidden', () => {
    render(
      <>
        <VideoCard
          from='playrecord'
          id='video-a'
          source='source-a'
          title='播放记录影片'
        />
        <VideoCard from='douban' douban_id={100} title='豆瓣影片' />
      </>,
    );

    const favoriteButton = screen.getByRole('button', {
      name: '收藏 播放记录影片',
    });
    expect(favoriteButton.parentElement?.className).toContain(
      'pointer-events-none',
    );
    expect(favoriteButton.parentElement?.className).toContain(
      'sm:group-hover:pointer-events-auto',
    );
    expect(favoriteButton.parentElement?.className).toContain(
      'group-focus-within:pointer-events-auto',
    );

    const subjectLink = screen.getByRole('link', { name: '打开豆瓣详情' });
    expect(subjectLink.className).toContain('pointer-events-none');
    expect(subjectLink.className).toContain(
      'sm:group-hover:pointer-events-auto',
    );
    expect(subjectLink.className).toContain('focus:pointer-events-auto');
  });

  it('runs the shimmer only while the card is hovered or focused', () => {
    const { container } = renderSourceBackedCard();
    const shimmer = Array.from(
      container.querySelectorAll<HTMLDivElement>('div'),
    ).find((element) => element.style.backgroundSize === '200% 100%');

    expect(shimmer).toBeTruthy();
    expect(shimmer?.style.animation).toBe('');
    expect(shimmer?.className).toContain(
      'motion-safe:animate-[card-shimmer_2.5s_ease-in-out_infinite]',
    );
    expect(shimmer?.className).toContain(
      'motion-safe:[animation-play-state:paused]',
    );
    expect(shimmer?.className).toContain(
      'motion-safe:group-hover:[animation-play-state:running]',
    );
    expect(shimmer?.className).toContain(
      'motion-safe:group-focus-within:[animation-play-state:running]',
    );
    expect(shimmer?.className).toContain('motion-reduce:transition-none');
  });

  it('keeps elevated visual badges inside the pointer playback boundary', () => {
    const { container } = render(
      <VideoCard
        episodes={10}
        from='playrecord'
        id='video-a'
        isAggregate
        source='source-a'
        source_names={['源 A', '源 B']}
        title='测试影片'
      />,
    );

    const episodeBadge = screen.getByText('10集').parentElement;
    const sourceIndicator = screen.getByRole('link', {
      name: '2 个播放源，播放 测试影片',
    });
    const playLink = screen.getByRole('link', { name: '播放 测试影片' });
    expect(episodeBadge?.className).toContain('pointer-events-none');
    expect(sourceIndicator?.className).toContain('pointer-events-none');
    expect(sourceIndicator?.className).toContain(
      'sm:group-hover:pointer-events-auto',
    );
    expect(sourceIndicator.getAttribute('href')).toBe(
      playLink.getAttribute('href'),
    );

    fireEvent.click(screen.getByText('10集'));

    expect(mockNavigateVideoCardPlayUrl).toHaveBeenCalledTimes(1);

    mockNavigateVideoCardPlayUrl.mockReset();
    const defaultPreventedByComponent: boolean[] = [];
    const preventJsdomNavigation = (event: MouseEvent) => {
      defaultPreventedByComponent.push(event.defaultPrevented);
      event.preventDefault();
    };
    container.addEventListener('click', preventJsdomNavigation);
    fireEvent.click(sourceIndicator, { metaKey: true });
    container.removeEventListener('click', preventJsdomNavigation);

    expect(defaultPreventedByComponent).toEqual([false]);
    expect(mockNavigateVideoCardPlayUrl).not.toHaveBeenCalled();
  });

  it('deduplicates a pending favorite mutation', async () => {
    const favoriteMutation = createDeferred<void>();
    mockSaveFavorite.mockReturnValue(favoriteMutation.promise);
    renderSourceBackedCard();
    const favoriteButton = screen.getByRole('button', {
      name: '收藏 测试影片',
    });

    fireEvent.click(favoriteButton);
    fireEvent.click(favoriteButton);
    expect(mockSaveFavorite).toHaveBeenCalledTimes(1);

    await act(async () => {
      favoriteMutation.resolve();
      await flushAsyncWork();
    });
  });

  it('deduplicates pending favorite mutations across identity round trips', async () => {
    const firstMutation = createDeferred<void>();
    const secondMutation = createDeferred<void>();
    mockSaveFavorite
      .mockReturnValueOnce(firstMutation.promise)
      .mockReturnValueOnce(secondMutation.promise);
    const renderCard = (id: string, title: string) => (
      <VideoCard
        from='playrecord'
        id={id}
        source='source-a'
        title={title}
      />
    );
    const { rerender } = render(renderCard('video-a', '影片 A'));

    fireEvent.click(screen.getByRole('button', { name: '收藏 影片 A' }));
    rerender(renderCard('video-b', '影片 B'));
    fireEvent.click(screen.getByRole('button', { name: '收藏 影片 B' }));
    rerender(renderCard('video-a', '影片 A'));
    fireEvent.click(screen.getByRole('button', { name: '收藏 影片 A' }));

    expect(mockSaveFavorite).toHaveBeenCalledTimes(2);
    expect(mockSaveFavorite).toHaveBeenNthCalledWith(
      1,
      'source-a',
      'video-a',
      expect.objectContaining({ title: '影片 A' }),
    );
    expect(mockSaveFavorite).toHaveBeenNthCalledWith(
      2,
      'source-a',
      'video-b',
      expect.objectContaining({ title: '影片 B' }),
    );

    await act(async () => {
      secondMutation.resolve();
      await flushAsyncWork();
    });
    expect(
      screen.getByRole('button', { name: '收藏 影片 A' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false');

    await act(async () => {
      firstMutation.resolve();
      await flushAsyncWork();
    });
    expect(
      screen.getByRole('button', { name: '取消收藏 影片 A' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
  });

  it('deduplicates a pending play-record deletion', async () => {
    const deleteMutation = createDeferred<void>();
    const onDelete = jest.fn(() => deleteMutation.promise);
    render(
      <VideoCard
        from='playrecord'
        id='video-a'
        onDelete={onDelete}
        source='source-a'
        title='测试影片'
      />,
    );
    const deleteButton = screen.getByRole('button', {
      name: '删除 测试影片 的播放记录',
    });

    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);

    await act(async () => {
      deleteMutation.resolve();
      await flushAsyncWork();
    });
  });

  it('deduplicates pending deletions across identity round trips', async () => {
    const firstMutation = createDeferred<void>();
    const secondMutation = createDeferred<void>();
    const firstDelete = jest.fn(() => firstMutation.promise);
    const secondDelete = jest.fn(() => secondMutation.promise);
    const renderCard = (
      id: string,
      title: string,
      onDelete: () => Promise<void>,
    ) => (
      <VideoCard
        from='playrecord'
        id={id}
        onDelete={onDelete}
        source='source-a'
        title={title}
      />
    );
    const { rerender } = render(renderCard('video-a', '影片 A', firstDelete));

    fireEvent.click(
      screen.getByRole('button', { name: '删除 影片 A 的播放记录' }),
    );
    rerender(renderCard('video-b', '影片 B', secondDelete));
    fireEvent.click(
      screen.getByRole('button', { name: '删除 影片 B 的播放记录' }),
    );
    rerender(renderCard('video-a', '影片 A', firstDelete));
    fireEvent.click(
      screen.getByRole('button', { name: '删除 影片 A 的播放记录' }),
    );

    expect(firstDelete).toHaveBeenCalledTimes(1);
    expect(secondDelete).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstMutation.resolve();
      secondMutation.resolve();
      await flushAsyncWork();
    });
  });

  it('unmounts the action sheet after its closing animation', () => {
    jest.useFakeTimers();
    const initialBodyPosition = document.body.style.position;

    render(<VideoCard from='douban' poster={bangumiPoster} title='测试影片' />);
    openActionSheet();

    expect(screen.getByText('选择操作')).not.toBeNull();
    expect(document.body.style.position).toBe('fixed');

    fireEvent.keyDown(document, { key: 'Escape' });

    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(screen.getByText('选择操作')).not.toBeNull();
    expect(mockMobileActionSheetUnmount).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText('选择操作')).toBeNull();
    expect(mockMobileActionSheetExited).toHaveBeenCalledTimes(1);
    expect(mockMobileActionSheetUnmount).toHaveBeenCalledTimes(1);
    expect(document.body.style.position).toBe(initialBodyPosition);
  });

  it('cancels action sheet unmount when reopened during closing', () => {
    jest.useFakeTimers();

    render(<VideoCard from='douban' poster={bangumiPoster} title='测试影片' />);
    openActionSheet();
    fireEvent.keyDown(document, { key: 'Escape' });

    act(() => {
      jest.advanceTimersByTime(100);
    });
    openActionSheet();

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByText('选择操作')).not.toBeNull();
    expect(mockMobileActionSheetExited).not.toHaveBeenCalled();
    expect(mockMobileActionSheetUnmount).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByText('选择操作')).toBeNull();
    expect(mockMobileActionSheetExited).toHaveBeenCalledTimes(1);
    expect(mockMobileActionSheetUnmount).toHaveBeenCalledTimes(1);
  });

  it('clears the pending action sheet exit when the card unmounts', () => {
    jest.useFakeTimers();

    const { unmount } = render(
      <VideoCard from='douban' poster={bangumiPoster} title='测试影片' />,
    );
    openActionSheet();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(mockMobileActionSheetUnmount).toHaveBeenCalledTimes(1);
    expect(mockMobileActionSheetExited).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockMobileActionSheetExited).not.toHaveBeenCalled();
    expect(mockMobileActionSheetUnmount).toHaveBeenCalledTimes(1);
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

  it('does not let an older favorite query overwrite a newer update event', async () => {
    jest.useFakeTimers();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    let resolveFavoriteStatus: (favorited: boolean) => void = () => undefined;
    mockIsFavorited.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveFavoriteStatus = resolve;
      }),
    );

    renderSourceBackedCard();
    await act(async () => {
      jest.advanceTimersByTime(400);
      await flushAsyncWork();
    });
    expect(mockIsFavorited).toHaveBeenCalledWith('source-a', 'video-a');

    act(() => {
      favoriteUpdateHandler?.({
        'source-a+video-a': { title: '测试影片' },
      });
    });
    openActionSheet();
    expect(await screen.findByText('取消收藏')).not.toBeNull();

    await act(async () => {
      resolveFavoriteStatus(false);
      await flushAsyncWork();
    });

    expect(screen.getByText('取消收藏')).not.toBeNull();
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

  it('consumes a desktop favorite failure at the card event boundary', async () => {
    mockSaveFavorite.mockRejectedValue(new Error('favorite failed'));
    const { container } = renderSourceBackedCard();
    const favoriteButton = container.querySelector('.lucide-heart');

    expect(favoriteButton).not.toBeNull();

    await act(async () => {
      fireEvent.click(favoriteButton as SVGElement);
      await flushAsyncWork();
    });

    expect(mockSaveFavorite).toHaveBeenCalledTimes(1);
  });

  it('consumes a desktop favorite removal failure', async () => {
    mockDeleteFavorite.mockRejectedValue(new Error('favorite removal failed'));
    const { container } = renderSourceBackedCard();

    act(() => {
      favoriteUpdateHandler?.({
        'source-a+video-a': { title: '测试影片' },
      });
    });

    const favoriteButton = container.querySelector('.lucide-heart');
    expect(favoriteButton).not.toBeNull();

    await act(async () => {
      fireEvent.click(favoriteButton as SVGElement);
      await flushAsyncWork();
    });

    expect(mockDeleteFavorite).toHaveBeenCalledWith('source-a', 'video-a');
  });

  it('consumes a desktop play-record deletion failure', async () => {
    mockDeletePlayRecord.mockRejectedValue(new Error('delete failed'));
    const { container } = renderSourceBackedCard();
    const deleteButton = container.querySelector('.lucide-trash-2');

    expect(deleteButton).not.toBeNull();

    await act(async () => {
      fireEvent.click(deleteButton as SVGElement);
      await flushAsyncWork();
    });

    expect(mockDeletePlayRecord).toHaveBeenCalledWith('source-a', 'video-a');
  });

  it('consumes a custom play-record deletion failure without falling back', async () => {
    const onDelete = jest
      .fn()
      .mockRejectedValue(new Error('custom delete failed'));
    const { container } = render(
      <VideoCard
        from='playrecord'
        id='video-a'
        onDelete={onDelete}
        source='source-a'
        title='测试影片'
      />,
    );
    const deleteButton = container.querySelector('.lucide-trash-2');

    expect(deleteButton).not.toBeNull();

    await act(async () => {
      fireEvent.click(deleteButton as SVGElement);
      await flushAsyncWork();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(mockDeletePlayRecord).not.toHaveBeenCalled();
  });

  it('consumes a mobile favorite failure before closing the action sheet', async () => {
    mockSaveFavorite.mockRejectedValue(new Error('mobile favorite failed'));
    renderSourceBackedCard();
    openActionSheet();

    const favoriteAction = await screen.findByRole('button', {
      name: '添加收藏',
    });

    await act(async () => {
      fireEvent.click(favoriteAction);
      await flushAsyncWork();
    });

    expect(mockSaveFavorite).toHaveBeenCalledTimes(1);
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

  it('applies aggregate prop updates without an extra mirrored-state commit', async () => {
    const commits: string[] = [];
    const renderCard = (
      episodes: number,
      sourceNames: string[],
      doubanId: number,
    ) => (
      <React.Profiler
        id='aggregate-video-card'
        onRender={(_id, phase) => commits.push(phase)}
      >
        <VideoCard
          from='search'
          isAggregate
          poster='https://cdn.example/poster.jpg'
          source_names={sourceNames}
          title='测试影片'
          episodes={episodes}
          douban_id={doubanId}
        />
      </React.Profiler>
    );
    const { container, rerender } = render(renderCard(1, ['源 A'], 100));

    commits.length = 0;
    rerender(renderCard(12, ['源 A', '源 B'], 200));

    await waitFor(() => {
      expect(screen.getByText('12集')).not.toBeNull();
      expect(
        container.querySelector(
          'a[href="https://movie.douban.com/subject/200"]',
        ),
      ).not.toBeNull();
    });
    expect(commits).toHaveLength(1);

    openActionSheet();
    expect(await screen.findByText('共 2 个播放源')).not.toBeNull();
  });
});
