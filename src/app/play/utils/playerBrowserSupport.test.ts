import { detectPlayerBrowserSupport } from './playerBrowserSupport';

describe('playerBrowserSupport', () => {
  test('detects Safari as WebKit and not Chrome', () => {
    const result = detectPlayerBrowserSupport({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      isIOS: false,
      isIOS13: false,
      isMobile: false,
    });

    expect(result.isSafari).toBe(true);
    expect(result.isWebKit).toBe(true);
    expect(result.isChrome).toBe(false);
  });

  test('detects desktop Chrome when vendor shell markers are absent', () => {
    const result = detectPlayerBrowserSupport({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      isIOS: false,
      isIOS13: false,
      isMobile: false,
    });

    expect(result.isSafari).toBe(false);
    expect(result.isWebKit).toBe(false);
    expect(result.isChrome).toBe(true);
  });

  test('excludes Chromium based vendor browsers from Chromecast path', () => {
    const result = detectPlayerBrowserSupport({
      userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      isIOS: false,
      isIOS13: false,
      isMobile: false,
    });

    expect(result.isChrome).toBe(false);
  });
});
