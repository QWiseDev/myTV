import { lightweightPreference } from './sourcePreference';

function createSource(name: string, episode: string) {
  return {
    id: name,
    title: name,
    poster: '',
    episodes: [episode],
    episodes_titles: [],
    source: name,
    source_name: name,
    year: '2024',
  };
}

describe('sourcePreference', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('lightweight preference works without AbortSignal.timeout', async () => {
    const originalTimeout = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: undefined,
    });
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValue(150);
    jest.spyOn(console, 'log').mockImplementation();
    global.fetch = jest.fn().mockResolvedValue({ type: 'opaque' });

    try {
      const best = await lightweightPreference(
        [createSource('source-a', 'https://a.example/video.m3u8')],
        jest.fn(),
      );

      expect(best.source_name).toBe('source-a');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://a.example/video.m3u8',
        expect.objectContaining({
          method: 'HEAD',
          mode: 'no-cors',
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      Object.defineProperty(AbortSignal, 'timeout', {
        configurable: true,
        value: originalTimeout,
      });
    }
  });
});
