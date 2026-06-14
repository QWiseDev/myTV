import {
  applyAllUiEnhancements,
  fixDanmakuProgressConflict,
} from './playerUiEnhancements';

describe('playerUiEnhancements', () => {
  type ArtPlayerRef = {
    current: {
      on: jest.Mock;
      __uiEnhancementsCleanup?: () => void;
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    document.body.innerHTML = `
      <div class="artplayer">
        <div class="art-control-progress"></div>
        <div class="artplayer-plugin-danmuku">
          <button class="apd-config"></button>
          <div class="apd-config-panel"></div>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
    document.head
      .querySelectorAll('#danmaku-drag-fix, #danmuku-controls-optimize')
      .forEach((node) => node.remove());
    jest.restoreAllMocks();
  });

  test('removes progress conflict listeners and interval on cleanup', () => {
    const progressControl = document.querySelector(
      '.art-control-progress'
    ) as HTMLElement;
    const removeProgressListener = jest.spyOn(
      progressControl,
      'removeEventListener'
    );
    const removeDocumentListener = jest.spyOn(document, 'removeEventListener');

    const cleanup = fixDanmakuProgressConflict();
    jest.advanceTimersByTime(1500);

    cleanup();

    expect(removeProgressListener).toHaveBeenCalledWith(
      'mousedown',
      expect.any(Function)
    );
    expect(removeDocumentListener).toHaveBeenCalledWith(
      'mousemove',
      expect.any(Function)
    );
    expect(removeDocumentListener).toHaveBeenCalledWith(
      'mouseup',
      expect.any(Function)
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  test('returns a single cleanup function for all UI enhancements', () => {
    const artPlayerRef: ArtPlayerRef = { current: { on: jest.fn() } };

    const cleanup = applyAllUiEnhancements(artPlayerRef);

    expect(typeof cleanup).toBe('function');
    expect(typeof artPlayerRef.current.__uiEnhancementsCleanup).toBe(
      'function'
    );
  });
});
