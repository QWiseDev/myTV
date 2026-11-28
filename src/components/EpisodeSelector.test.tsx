import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { SearchResult } from '@/lib/types';

import { probePlayableMediaUrl } from '@/app/play/utils/episodeSourceCheck';

import EpisodeSelector from './EpisodeSelector';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/play/utils/episodeSourceCheck', () => {
  const actual = jest.requireActual('@/app/play/utils/episodeSourceCheck');
  return {
    ...actual,
    probePlayableMediaUrl: jest.fn(),
  };
});

const mockProbePlayableMediaUrl = probePlayableMediaUrl as jest.MockedFunction<
  typeof probePlayableMediaUrl
>;

function createSource(
  source: string,
  id: string,
  episodes: string[],
): SearchResult {
  return {
    source,
    id,
    title: `${source}-${id}`,
    poster: '',
    episodes,
    episodes_titles: episodes.map((_, index) => `第${index + 1}集`),
    source_name: source,
    year: '2026',
  };
}

describe('EpisodeSelector', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    mockProbePlayableMediaUrl.mockReset();
    mockProbePlayableMediaUrl.mockResolvedValue({
      quality: '1080p',
      loadSpeed: '1.00 MB/s',
      pingTimeMs: 20,
    });
  });

  test('returning to the episode tab derives the page from the latest value', async () => {
    localStorage.setItem('enableOptimization', 'false');
    const { rerender } = render(
      <EpisodeSelector totalEpisodes={100} episodes_titles={[]} value={1} />,
    );

    fireEvent.click(screen.getByText('换源'));
    rerender(
      <EpisodeSelector totalEpisodes={100} episodes_titles={[]} value={75} />,
    );
    fireEvent.click(screen.getByText('选集'));

    expect(await screen.findByRole('button', { name: '75' })).not.toBeNull();
  });

  test('rechecks equal-length source replacements and each episode separately', async () => {
    localStorage.setItem('enableOptimization', 'true');
    const sourceA = createSource('source-a', 'a', [
      'https://a.example/1.m3u8',
      'https://a.example/2.m3u8',
    ]);
    const sourceB = createSource('source-b', 'b', [
      'https://b.example/1.m3u8',
      'https://b.example/2.m3u8',
    ]);

    const { rerender } = render(
      <EpisodeSelector
        totalEpisodes={2}
        episodes_titles={[]}
        value={1}
        availableSources={[sourceA]}
      />,
    );
    fireEvent.click(screen.getByText('换源'));

    await waitFor(() =>
      expect(mockProbePlayableMediaUrl).toHaveBeenCalledWith(
        'https://a.example/1.m3u8',
        expect.objectContaining({ timeoutMs: 10000 }),
      ),
    );

    rerender(
      <EpisodeSelector
        totalEpisodes={2}
        episodes_titles={[]}
        value={1}
        availableSources={[sourceB]}
      />,
    );
    await waitFor(() =>
      expect(mockProbePlayableMediaUrl).toHaveBeenCalledWith(
        'https://b.example/1.m3u8',
        expect.objectContaining({ timeoutMs: 10000 }),
      ),
    );

    rerender(
      <EpisodeSelector
        totalEpisodes={2}
        episodes_titles={[]}
        value={2}
        availableSources={[sourceB]}
      />,
    );
    await waitFor(() =>
      expect(mockProbePlayableMediaUrl).toHaveBeenCalledWith(
        'https://b.example/2.m3u8',
        expect.objectContaining({ timeoutMs: 10000 }),
      ),
    );
  });

  test('marks magnet sources as skipped without probing (unified with manual check)', async () => {
    localStorage.setItem('enableOptimization', 'true');
    const magnetSource = createSource('source-m', 'm', [
      'magnet:?xt=urn:btih:abc',
    ]);

    // 单集内容默认展示换源 tab
    render(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        availableSources={[magnetSource]}
      />,
    );

    const badges = await screen.findAllByText('磁力链接不支持检测');
    expect(badges.length).toBeGreaterThan(0);
    expect(mockProbePlayableMediaUrl).not.toHaveBeenCalled();
  });

  test('reuses fresh probe results instead of re-probing the same url', async () => {
    localStorage.setItem('enableOptimization', 'true');
    const sourceA = createSource('source-a', 'a', ['https://a.example/1.m3u8']);

    const { rerender } = render(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        availableSources={[sourceA]}
      />,
    );

    await waitFor(() =>
      expect(mockProbePlayableMediaUrl).toHaveBeenCalledTimes(1),
    );

    // 等长替换触发 effect 重跑：地址未变且结果仍新鲜，不应重复探测
    rerender(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        availableSources={[
          createSource('source-a', 'a', ['https://a.example/1.m3u8']),
        ]}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockProbePlayableMediaUrl).toHaveBeenCalledTimes(1);
  });

  test('defaults optimizationEnabled to false consistently with global settings and avoids unprompted auto-probing', async () => {
    const sourceA = createSource('source-a', 'a', ['https://a.example/1.m3u8']);

    render(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        availableSources={[sourceA]}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockProbePlayableMediaUrl).not.toHaveBeenCalled();
  });

  test('keeps source list order stable when switching sources and shows switching feedback while preventing duplicate clicks', () => {
    const sourceA = createSource('source-a', 'a', ['https://a.example/1.m3u8']);
    const sourceB = createSource('source-b', 'b', ['https://b.example/1.m3u8']);
    const sourceC = createSource('source-c', 'c', ['https://c.example/1.m3u8']);
    const onSourceChange = jest.fn();

    const { rerender } = render(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        currentSource='source-a'
        currentId='a'
        availableSources={[sourceA, sourceB, sourceC]}
        onSourceChange={onSourceChange}
      />,
    );

    // 切换当前源到 source-c 后，列表顺序不应把 source-c 顶到第一行
    rerender(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        currentSource='source-c'
        currentId='c'
        availableSources={[sourceA, sourceB, sourceC]}
        onSourceChange={onSourceChange}
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'source-a-a',
      'source-b-b',
      'source-c-c',
    ]);

    // 正在切换至 source-b 时展示「切换中」且重复点击不再次触发 onSourceChange
    rerender(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        currentSource='source-c'
        currentId='c'
        switchingSourceKey='source-b-b'
        availableSources={[sourceA, sourceB, sourceC]}
        onSourceChange={onSourceChange}
      />,
    );

    expect(screen.getByText('切换中')).not.toBeNull();
    fireEvent.click(screen.getByRole('heading', { name: 'source-b-b' }));
    expect(onSourceChange).not.toHaveBeenCalled();
  });

  test('renders amber slow/unmeasured badges instead of green playable badge for slow or unknown-speed sources', async () => {
    localStorage.setItem('enableOptimization', 'true');
    const slowSource = createSource('source-slow', 's', [
      'https://slow.example/1.m3u8',
    ]);
    const unknownSource = createSource('source-unk', 'u', [
      'https://unk.example/1.m3u8',
    ]);

    mockProbePlayableMediaUrl
      .mockResolvedValueOnce({
        quality: '1080p',
        loadSpeed: '120.00 KB/s',
        pingTimeMs: 400,
        slow: true,
      })
      .mockResolvedValueOnce({
        quality: '1080p',
        loadSpeed: '未知',
        pingTimeMs: 160,
      });

    render(
      <EpisodeSelector
        totalEpisodes={1}
        episodes_titles={[]}
        value={1}
        availableSources={[slowSource, unknownSource]}
      />,
    );

    expect(await screen.findByText('较慢 1080p')).not.toBeNull();
    expect(await screen.findByText('未测速 1080p')).not.toBeNull();
    expect(screen.queryByText('可播 1080p')).toBeNull();
  });
});
