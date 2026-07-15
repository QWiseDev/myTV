import { getSettingsConfig } from './artplayerConfig';

type TestPlayer = {
  destroy: jest.Mock;
  video: {
    hls: {
      destroy: jest.Mock;
    };
  };
};

function createOptions() {
  return {
    container: document.createElement('div'),
    url: 'https://example.com/video.m3u8',
    poster: '',
    isIOS: false,
    isSafari: false,
    isChrome: true,
    isMobile: false,
    blockAdEnabled: false,
    blockAdEnabledRef: { current: false },
    externalDanmuEnabledRef: { current: false },
    onBlockAdToggle: jest.fn(),
    onDanmuToggle: jest.fn(),
    onNextEpisode: jest.fn(),
    danmuEpisodeNum: 1,
    onDanmuEpisodeChange: jest.fn(),
    artPlayerRef: {
      current: {
        currentTime: 30,
        video: {
          hls: {
            destroy: jest.fn(),
          },
        },
        destroy: jest.fn(),
      },
    },
    resumeTimeRef: { current: null },
    customType: {},
    danmakuConfig: null,
  } as unknown as Parameters<typeof getSettingsConfig>[0];
}

describe('artplayerConfig settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('block-ad toggle updates state without destroying the player', () => {
    const options = createOptions();
    const player = options.artPlayerRef.current as unknown as TestPlayer;
    const setting = getSettingsConfig(options)[0];

    expect(setting.onClick()).toBe('当前开启');
    expect(options.blockAdEnabledRef.current).toBe(true);
    expect(options.onBlockAdToggle).toHaveBeenLastCalledWith(true);
    expect(localStorage.getItem('enable_blockad')).toBe('true');
    expect(player.destroy).not.toHaveBeenCalled();
    expect(player.video.hls.destroy).not.toHaveBeenCalled();

    expect(setting.onClick()).toBe('当前关闭');
    expect(options.blockAdEnabledRef.current).toBe(false);
    expect(options.onBlockAdToggle).toHaveBeenLastCalledWith(false);
    expect(localStorage.getItem('enable_blockad')).toBe('false');
  });

  test('external danmu setting toggles through callback without rebuilding player', () => {
    localStorage.setItem('enable_external_danmu', 'true');
    const options = createOptions();
    const player = options.artPlayerRef.current as unknown as TestPlayer;
    const setting = getSettingsConfig(options)[1];

    expect(setting.tooltip).toBe('已关闭');
    expect(setting.onClick()).toBe('当前开启');
    expect(options.externalDanmuEnabledRef.current).toBe(true);
    expect(options.onDanmuToggle).toHaveBeenLastCalledWith(true);
    expect(player.destroy).not.toHaveBeenCalled();
    expect(player.video.hls.destroy).not.toHaveBeenCalled();

    expect(setting.onClick()).toBe('当前关闭');
    expect(options.externalDanmuEnabledRef.current).toBe(false);
    expect(options.onDanmuToggle).toHaveBeenLastCalledWith(false);
  });
});
