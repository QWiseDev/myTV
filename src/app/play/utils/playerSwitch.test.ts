import {
  applyPlayerMediaSwitch,
  shouldRebuildPlayerForMediaSwitch,
  switchPlayerMedia,
} from './playerSwitch';

function createPlayer(overrides: Record<string, unknown> = {}) {
  return {
    currentTime: 125,
    duration: 300,
    title: 'old title',
    poster: 'old.jpg',
    video: document.createElement('video'),
    switchQuality: jest.fn().mockResolvedValue(undefined),
    switchUrl: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('playerSwitch', () => {
  test('source switch rebuilds player to reset HLS media pipeline', () => {
    expect(
      shouldRebuildPlayerForMediaSwitch({
        isEpisodeChange: false,
        isSourceChange: true,
      }),
    ).toBe(true);
  });

  test('episode switch can reuse player for fast in-place switching', () => {
    expect(
      shouldRebuildPlayerForMediaSwitch({
        isEpisodeChange: true,
        isSourceChange: false,
      }),
    ).toBe(false);
  });

  test('source switch takes precedence over episode index changes', () => {
    expect(
      shouldRebuildPlayerForMediaSwitch({
        isEpisodeChange: true,
        isSourceChange: true,
      }),
    ).toBe(true);
  });

  test('in-place media switch reloads with switchUrl and restores playback time', async () => {
    const player = createPlayer();

    const result = await switchPlayerMedia(player, {
      videoUrl: 'https://example.com/next.m3u8',
      title: 'new title',
      poster: 'new.jpg',
      episodeIndex: 1,
      isEpisodeChange: false,
      resumeTime: 125,
    });

    expect(player.switchUrl).toHaveBeenCalledWith(
      'https://example.com/next.m3u8',
    );
    expect(player.switchQuality).not.toHaveBeenCalled();
    expect(player.title).toBe('old title');
    expect(player.poster).toBe('old.jpg');
    expect(player.currentTime).toBe(125);

    applyPlayerMediaSwitch(player, result);

    expect(player.title).toBe('new title - 第2集');
    expect(player.poster).toBe('new.jpg');
    expect(player.currentTime).toBe(125);
    expect(player.video.currentTime).toBe(125);
    expect(result.restoredTime).toBe(125);
  });

  test('episode switch keeps reset behavior when there is no resume time', async () => {
    const player = createPlayer({ currentTime: 88 });

    const result = await switchPlayerMedia(player, {
      videoUrl: 'https://example.com/episode-2.m3u8',
      title: 'new title',
      poster: 'new.jpg',
      episodeIndex: 1,
      isEpisodeChange: true,
      resumeTime: 0,
    });

    expect(player.switchUrl).toHaveBeenCalledWith(
      'https://example.com/episode-2.m3u8',
    );
    expect(player.switchQuality).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(88);

    applyPlayerMediaSwitch(player, result);

    expect(player.currentTime).toBe(0);
    expect(result.restoredTime).toBeUndefined();
  });
});
