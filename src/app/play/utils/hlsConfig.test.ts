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
      expect.objectContaining({ fatal: false })
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
    expect(config.maxBufferLength).toBe(20);
    expect(config.backBufferLength).toBe(10);
    expect(config.maxMaxBufferLength).toBe(90);
    expect(config.startFragPrefetch).toBe(false);
    expect(config.fragLoadPolicy?.default.timeoutRetry.maxNumRetry).toBe(3);
    expect(config.fragLoadPolicy?.default.errorRetry.maxNumRetry).toBe(4);
  });
});
