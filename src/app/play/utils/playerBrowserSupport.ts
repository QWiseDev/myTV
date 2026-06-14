export type PlayerBrowserSupport = {
  isSafari: boolean;
  isIOS: boolean;
  isIOS13: boolean;
  isMobile: boolean;
  isWebKit: boolean;
  isChrome: boolean;
};

const CHROME_EXCLUDED_UA_PATTERNS = [
  /Edg/i,
  /OPR/i,
  /SamsungBrowser/i,
  /OPPO/i,
  /OppoBrowser/i,
  /HeyTapBrowser/i,
  /OnePlus/i,
  /Xiaomi/i,
  /MIUI/i,
  /Huawei/i,
  /Vivo/i,
  /UCBrowser/i,
  /QQBrowser/i,
  /Baidu/i,
  /SogouMobileBrowser/i,
];

export function detectPlayerBrowserSupport({
  userAgent,
  isIOS,
  isIOS13,
  isMobile,
}: {
  userAgent: string;
  isIOS: boolean;
  isIOS13: boolean;
  isMobile: boolean;
}): PlayerBrowserSupport {
  const isSafari = /^(?:(?!chrome|android).)*safari/i.test(userAgent);
  const isChrome =
    /Chrome/i.test(userAgent) &&
    !CHROME_EXCLUDED_UA_PATTERNS.some((pattern) => pattern.test(userAgent));

  return {
    isSafari,
    isIOS,
    isIOS13,
    isMobile,
    isWebKit: isSafari || isIOS,
    isChrome,
  };
}
