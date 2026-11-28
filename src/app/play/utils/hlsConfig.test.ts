jest.mock('hls.js', () => ({
  __esModule: true,
  default: {
    DefaultConfig: {
      loader: jest.fn(),
    },
    ErrorDetails: {
      BUFFER_APPEND_ERROR: 'bufferAppendError',
      FRAG_LOAD_ERROR: 'fragLoadError',
      FRAG_PARSING_ERROR: 'fragParsingError',
      LEVEL_LOAD_ERROR: 'levelLoadError',
      MANIFEST_LOAD_ERROR: 'manifestLoadError',
      MSE_ERROR: 'mseError',
      MSE_UNSUPPORTED_CODEC: 'mseUnsupportedCodec',
    },
    ErrorTypes: {
      MEDIA_ERROR: 'mediaError',
      NETWORK_ERROR: 'networkError',
    },
  },
}));

import {
  extractHlsHttpStatus,
  getOptimizedHlsConfig,
  handleHlsError,
  isRecoverableFragmentParsingError,
  isRecoverableTimestampAppendError,
  isServerUnavailableManifestError,
} from './hlsConfig';

type HlsErrorHandlerInstance = Parameters<typeof handleHlsError>[2];

describe('hlsConfig error guards', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('extractHlsHttpStatus reads status from nested HLS response shapes', () => {
    expect(extractHlsHttpStatus({ response: { status: 503 } })).toBe(503);
    expect(extractHlsHttpStatus({ networkDetails: { code: 502 } })).toBe(502);
    expect(extractHlsHttpStatus({ err: { status: 429 } })).toBe(429);
    expect(extractHlsHttpStatus({ code: 404 })).toBe(404);
  });

  test('extractHlsHttpStatus ignores invalid values', () => {
    expect(extractHlsHttpStatus({ response: { status: '503' } })).toBeNull();
    expect(extractHlsHttpStatus({ response: { status: Infinity } })).toBeNull();
    expect(extractHlsHttpStatus(null)).toBeNull();
  });

  test('isServerUnavailableManifestError only matches 5xx manifest-like load errors', () => {
    expect(
      isServerUnavailableManifestError({
        details: 'manifestLoadError',
        response: { status: 503 },
      }),
    ).toBe(true);
    expect(
      isServerUnavailableManifestError({
        details: 'levelLoadError',
        response: { status: 502 },
      }),
    ).toBe(true);
    expect(
      isServerUnavailableManifestError({
        details: 'fragLoadError',
        response: { status: 500 },
      }),
    ).toBe(true);
    expect(
      isServerUnavailableManifestError({
        details: 'manifestLoadError',
        response: { status: 404 },
      }),
    ).toBe(false);
    expect(
      isServerUnavailableManifestError({
        details: 'bufferAppendError',
        response: { status: 503 },
      }),
    ).toBe(false);
  });

  test('recoverable guards match parser and timestamp append errors', () => {
    expect(
      isRecoverableFragmentParsingError({ details: 'fragParsingError' }),
    ).toBe(true);
    expect(
      isRecoverableTimestampAppendError({
        details: 'bufferAppendError',
        err: { message: 'SourceBuffer timestamp offset invalid' },
      }),
    ).toBe(true);
    expect(
      isRecoverableTimestampAppendError({
        details: 'bufferAppendError',
        error: 'timestamp discontinuity',
      }),
    ).toBe(true);
    expect(
      isRecoverableTimestampAppendError({
        details: 'bufferAppendError',
        err: { message: 'quota exceeded' },
      }),
    ).toBe(false);
  });

  test('media fatal errors do not notify fatal handler when recovery starts', () => {
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    const recoverMediaError = jest.fn();
    const hls = {
      recoverMediaError,
      startLoad: jest.fn(),
      destroy: jest.fn(),
      trigger: jest.fn(),
      levels: [],
      currentLevel: -1,
    } as unknown as HlsErrorHandlerInstance;
    const onFatalError = jest.fn();

    handleHlsError(
      'hlsError',
      { fatal: true, type: 'mediaError', details: 'bufferStalledError' },
      hls,
      document.createElement('video'),
      onFatalError,
    );

    expect(recoverMediaError).toHaveBeenCalledTimes(1);
    expect(onFatalError).not.toHaveBeenCalled();
  });

  test('non-fatal HLS errors are not logged as console errors', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const hls = {
      recoverMediaError: jest.fn(),
      startLoad: jest.fn(),
      destroy: jest.fn(),
      trigger: jest.fn(),
      levels: [],
      currentLevel: -1,
    } as unknown as HlsErrorHandlerInstance;

    handleHlsError(
      'hlsError',
      { fatal: false, type: 'mediaError', details: 'bufferSeekOverHole' },
      hls,
      document.createElement('video'),
    );

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      'HLS Error:',
      'hlsError',
      expect.objectContaining({ fatal: false }),
    );
  });

  test('media fatal errors notify fatal handler when recovery throws', () => {
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    const recoverMediaError = jest.fn(() => {
      throw new Error('recover failed');
    });
    const hls = {
      recoverMediaError,
      startLoad: jest.fn(),
      destroy: jest.fn(),
      trigger: jest.fn(),
      levels: [],
      currentLevel: -1,
    } as unknown as HlsErrorHandlerInstance;
    const onFatalError = jest.fn();

    handleHlsError(
      'hlsError',
      { fatal: true, type: 'mediaError', details: 'bufferStalledError' },
      hls,
      document.createElement('video'),
      onFatalError,
    );

    expect(onFatalError).toHaveBeenCalledWith(
      expect.stringContaining('媒体错误'),
    );
  });

  test('notifies fatal handler after fatal network or media retries are exhausted', () => {
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    const hls = {
      recoverMediaError: jest.fn(),
      startLoad: jest.fn(),
      destroy: jest.fn(),
      trigger: jest.fn(),
      levels: [],
      currentLevel: -1,
    } as unknown as HlsErrorHandlerInstance;
    const video = document.createElement('video');
    const onFatalError = jest.fn();

    // 前两次致命分片网络错误重试 startLoad，第三次销毁并上报触发换源
    for (let i = 0; i < 3; i += 1) {
      handleHlsError(
        'hlsError',
        { fatal: true, type: 'networkError', details: 'fragLoadError' },
        hls,
        video,
        onFatalError,
      );
    }

    expect(hls.startLoad).toHaveBeenCalledTimes(2);
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(onFatalError).toHaveBeenCalledTimes(1);

    // 前两次致命媒体错误调用 recoverMediaError，第三次销毁并上报
    const mediaHls = {
      recoverMediaError: jest.fn(),
      startLoad: jest.fn(),
      destroy: jest.fn(),
      trigger: jest.fn(),
      levels: [],
      currentLevel: -1,
    } as unknown as HlsErrorHandlerInstance;
    const onMediaFatal = jest.fn();
    for (let i = 0; i < 3; i += 1) {
      handleHlsError(
        'hlsError',
        { fatal: true, type: 'mediaError', details: 'bufferStalledError' },
        mediaHls,
        video,
        onMediaFatal,
      );
    }

    expect(mediaHls.recoverMediaError).toHaveBeenCalledTimes(2);
    expect(mediaHls.destroy).toHaveBeenCalledTimes(1);
    expect(onMediaFatal).toHaveBeenCalledTimes(1);
  });

  test('manifestLoadError uses bounded retries instead of 500ms unconditional failure and guards destroyed MSE timer', () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    const hls = {
      recoverMediaError: jest.fn(),
      startLoad: jest.fn(),
      destroy: jest.fn(),
      trigger: jest.fn(),
      levels: [{ height: 1080 }, { height: 720 }],
      currentLevel: -1,
    } as unknown as HlsErrorHandlerInstance;
    const video = document.createElement('video');
    const onFatalError = jest.fn();

    // 第一次 manifestLoadError：仅调用 startLoad 重试，500ms 后不应误触发 onFatalError
    handleHlsError(
      'hlsError',
      { fatal: true, type: 'networkError', details: 'manifestLoadError' },
      hls,
      video,
      onFatalError,
    );
    jest.advanceTimersByTime(600);
    expect(hls.startLoad).toHaveBeenCalledTimes(1);
    expect(onFatalError).not.toHaveBeenCalled();

    // 耗尽重试后销毁实例并上报致命错误
    handleHlsError(
      'hlsError',
      { fatal: true, type: 'networkError', details: 'manifestLoadError' },
      hls,
      video,
      onFatalError,
    );
    handleHlsError(
      'hlsError',
      { fatal: true, type: 'networkError', details: 'manifestLoadError' },
      hls,
      video,
      onFatalError,
    );
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(onFatalError).toHaveBeenCalledTimes(1);

    // MSE_ERROR 启动 1000ms 降级定时器后，若实例在到期前已销毁则不再调用 startLoad
    const mseHls = {
      recoverMediaError: jest.fn(),
      startLoad: jest.fn(),
      destroy: jest.fn(),
      trigger: jest.fn(),
      levels: [{ height: 1080 }, { height: 720 }],
      currentLevel: 0,
    } as unknown as HlsErrorHandlerInstance;

    handleHlsError(
      'hlsError',
      { fatal: true, type: 'mediaError', details: 'mseError' },
      mseHls,
      video,
      jest.fn(),
    );
    // 模拟随后遭遇上游 503 销毁了该实例
    handleHlsError(
      'hlsError',
      {
        fatal: true,
        type: 'networkError',
        details: 'manifestLoadError',
        response: { status: 503 },
      },
      mseHls,
      video,
      jest.fn(),
    );
    jest.advanceTimersByTime(1100);
    expect(mseHls.startLoad).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});

describe('hlsConfig performance defaults', () => {
  test('keeps desktop playback smooth while capping sustained buffering work', () => {
    const config = getOptimizedHlsConfig({
      deviceInfo: {
        isMobile: false,
        isIOS: false,
        isIOS13: false,
      },
      blockAdEnabled: true,
    });

    expect(config.enableWorker).toBe(true);
    expect(config.testBandwidth).toBe(true);
    expect(config.maxBufferLength).toBe(60);
    expect(config.backBufferLength).toBe(30);
    expect(config.maxMaxBufferLength).toBe(180);
    expect(config.startFragPrefetch).toBe(true);
    expect(config.fragLoadPolicy?.default.timeoutRetry.maxNumRetry).toBe(3);
    expect(config.fragLoadPolicy?.default.errorRetry.maxNumRetry).toBe(4);
  });
});
