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
        expect.objectContaining({ timeoutMs: 6000 }),
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
        expect.objectContaining({ timeoutMs: 6000 }),
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
        expect.objectContaining({ timeoutMs: 6000 }),
      ),
    );
  });
});
