import {
  isSearchTimeoutError,
  isSiteSearchBenched,
  markSiteSearchSuccess,
  markSiteSearchTimeout,
  SEARCH_SITE_TIMEOUT_MS,
} from './site-health';

const MINUTE = 60 * 1000;

describe('site-health 站点级搜索健康度', () => {
  test('未记录超时的站点不隔离', () => {
    expect(isSiteSearchBenched('site-fresh', 1000)).toBe(false);
  });

  test('单次超时不会隔离站点', () => {
    markSiteSearchTimeout('site-once', 1000);
    expect(isSiteSearchBenched('site-once', 1001)).toBe(false);
  });

  test('窗口内连续超时达到阈值后隔离，到期后自动恢复', () => {
    markSiteSearchTimeout('site-bench', 0);
    markSiteSearchTimeout('site-bench', 30 * 1000);

    expect(isSiteSearchBenched('site-bench', 30 * 1000 + 1)).toBe(true);
    expect(
      isSiteSearchBenched('site-bench', 30 * 1000 + 10 * MINUTE - 1),
    ).toBe(true);
    expect(
      isSiteSearchBenched('site-bench', 30 * 1000 + 10 * MINUTE),
    ).toBe(false);
  });

  test('成功响应清零计数并解除隔离', () => {
    markSiteSearchTimeout('site-recover', 0);
    markSiteSearchTimeout('site-recover', 1000);
    expect(isSiteSearchBenched('site-recover', 1001)).toBe(true);

    markSiteSearchSuccess('site-recover');
    expect(isSiteSearchBenched('site-recover', 1002)).toBe(false);

    // 解除隔离后重新累计，单次超时不会立刻再隔离
    markSiteSearchTimeout('site-recover', 2000);
    expect(isSiteSearchBenched('site-recover', 2001)).toBe(false);
  });

  test('超出窗口的超时不算连续', () => {
    markSiteSearchTimeout('site-window', 0);
    markSiteSearchTimeout('site-window', 11 * MINUTE);

    expect(isSiteSearchBenched('site-window', 11 * MINUTE + 1)).toBe(false);
  });

  test('隔离到期后再次连续超时会重新隔离', () => {
    markSiteSearchTimeout('site-relapse', 0);
    markSiteSearchTimeout('site-relapse', 1000);
    // 隔离至 t=1000+10min，期间不搜索所以不会产生新记录

    const expiry = 1000 + 10 * MINUTE;
    expect(isSiteSearchBenched('site-relapse', expiry)).toBe(false);

    markSiteSearchTimeout('site-relapse', expiry + 1000);
    markSiteSearchTimeout('site-relapse', expiry + 2000);
    expect(isSiteSearchBenched('site-relapse', expiry + 2001)).toBe(true);
  });

  test('识别超时错误', () => {
    expect(isSearchTimeoutError({ name: 'TimeoutError' })).toBe(true);
    expect(isSearchTimeoutError(new Error('普通错误'))).toBe(false);
    expect(isSearchTimeoutError({ name: 'AbortError' })).toBe(false);
    expect(isSearchTimeoutError(null)).toBe(false);
    expect(isSearchTimeoutError(undefined)).toBe(false);
  });

  test('单站点超时收敛到 10 秒', () => {
    expect(SEARCH_SITE_TIMEOUT_MS).toBe(10_000);
  });
});
