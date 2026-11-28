import {
  finishSiteHealthProbe,
  FORBIDDEN_BACKOFF_MS,
  getSiteCircuitState,
  getSiteHealthSnapshot,
  getSiteSearchTimeoutMs,
  HALF_OPEN_PROBE_TIMEOUT_MS,
  isSearchTimeoutError,
  isSiteSearchBenched,
  markSiteSearchFailure,
  markSiteSearchSuccess,
  markSiteSearchTimeout,
  pickFirstHealthySite,
  resetSiteHealth,
  SEARCH_SITE_TIMEOUT_MS,
  SEARCH_SLOW_SITE_TIMEOUT_MS,
  shouldSkipSiteSearch,
  TRANSIENT_BACKOFF_MS,
} from './site-health';

const MINUTE = 60 * 1000;

describe('site-health 站点级三态熔断与健康度', () => {
  beforeEach(() => {
    resetSiteHealth();
  });

  test('未记录故障的站点处于 closed 且不跳过', () => {
    expect(getSiteCircuitState('site-fresh', 1000)).toBe('closed');
    expect(isSiteSearchBenched('site-fresh', 1000)).toBe(false);
    expect(shouldSkipSiteSearch('site-fresh', 1000)).toEqual({
      skip: false,
      shouldBackgroundProbe: false,
      state: 'closed',
    });
  });

  test('单次失败不会触发熔断，窗口内连续 2 次触发首次 2 分钟熔断', () => {
    markSiteSearchTimeout('site-once', 1000);
    expect(getSiteCircuitState('site-once', 1001)).toBe('closed');

    markSiteSearchTimeout('site-once', 30 * 1000);
    expect(getSiteCircuitState('site-once', 30 * 1000 + 1)).toBe('open');
    expect(
      isSiteSearchBenched('site-once', 30 * 1000 + TRANSIENT_BACKOFF_MS[0] - 1),
    ).toBe(true);
    // 到期进入 half_open，而非直接盲目放通
    expect(
      getSiteCircuitState('site-once', 30 * 1000 + TRANSIENT_BACKOFF_MS[0]),
    ).toBe('half_open');
    expect(
      isSiteSearchBenched('site-once', 30 * 1000 + TRANSIENT_BACKOFF_MS[0]),
    ).toBe(false);
  });

  test('半开到期时当前请求 0 等待跳过，且并发下仅放行 1 路后台探活（防惊群）', () => {
    markSiteSearchFailure('site-half', 'timeout', 0);
    markSiteSearchFailure('site-half', 'timeout', 1000);

    const expiry = 1000 + TRANSIENT_BACKOFF_MS[0];
    // 第 1 个请求获得后台探活权，但本身仍立即跳过不等待
    expect(shouldSkipSiteSearch('site-half', expiry)).toEqual({
      skip: true,
      shouldBackgroundProbe: true,
      state: 'half_open',
    });
    // 并发进来的第 2、3 个请求直接跳过，不再重复发探活
    expect(shouldSkipSiteSearch('site-half', expiry + 10)).toEqual({
      skip: true,
      shouldBackgroundProbe: false,
      state: 'half_open',
    });
    expect(shouldSkipSiteSearch('site-half', expiry + 20)).toEqual({
      skip: true,
      shouldBackgroundProbe: false,
      state: 'half_open',
    });

    // 探活成功后立即恢复 closed，后续请求正常放行
    markSiteSearchSuccess('site-half', 320);
    expect(shouldSkipSiteSearch('site-half', expiry + 50)).toEqual({
      skip: false,
      shouldBackgroundProbe: false,
      state: 'closed',
    });
  });

  test('半开探活失败按指数退避升级：2m -> 10m -> 30m -> 2h（封顶）', () => {
    let t = 0;
    markSiteSearchFailure('site-backoff', 'server_error', t);
    t += 1000;
    markSiteSearchFailure('site-backoff', 'server_error', t);
    // 第 1 阶：2 分钟
    expect(isSiteSearchBenched('site-backoff', t + 2 * MINUTE - 1)).toBe(true);
    t += 2 * MINUTE;

    // 探活失败 -> 第 2 阶：10 分钟
    expect(shouldSkipSiteSearch('site-backoff', t).shouldBackgroundProbe).toBe(
      true,
    );
    markSiteSearchFailure('site-backoff', 'network_error', t + 500);
    t += 500;
    expect(isSiteSearchBenched('site-backoff', t + 10 * MINUTE - 1)).toBe(true);
    t += 10 * MINUTE;

    // 探活失败 -> 第 3 阶：30 分钟
    expect(shouldSkipSiteSearch('site-backoff', t).shouldBackgroundProbe).toBe(
      true,
    );
    markSiteSearchFailure('site-backoff', 'timeout', t + 500);
    t += 500;
    expect(isSiteSearchBenched('site-backoff', t + 30 * MINUTE - 1)).toBe(true);
    t += 30 * MINUTE;

    // 探活失败 -> 第 4 阶：2 小时封顶
    expect(shouldSkipSiteSearch('site-backoff', t).shouldBackgroundProbe).toBe(
      true,
    );
    markSiteSearchFailure('site-backoff', 'timeout', t + 500);
    t += 500;
    expect(isSiteSearchBenched('site-backoff', t + 120 * MINUTE - 1)).toBe(
      true,
    );
    t += 120 * MINUTE;

    // 再失败仍封顶 2 小时
    expect(shouldSkipSiteSearch('site-backoff', t).shouldBackgroundProbe).toBe(
      true,
    );
    markSiteSearchFailure('site-backoff', 'timeout', t + 500);
    t += 500;
    expect(isSiteSearchBenched('site-backoff', t + 120 * MINUTE - 1)).toBe(
      true,
    );
  });

  test('403/401 明确拒绝直接从 30 分钟起步退避至 2 小时', () => {
    markSiteSearchFailure('site-403', 'forbidden', 0);
    markSiteSearchFailure('site-403', 'forbidden', 1000);

    expect(
      isSiteSearchBenched('site-403', 1000 + FORBIDDEN_BACKOFF_MS[0] - 1),
    ).toBe(true);
    expect(
      getSiteCircuitState('site-403', 1000 + FORBIDDEN_BACKOFF_MS[0]),
    ).toBe('half_open');

    const expiry = 1000 + FORBIDDEN_BACKOFF_MS[0];
    shouldSkipSiteSearch('site-403', expiry);
    markSiteSearchFailure('site-403', 'forbidden', expiry + 100);
    expect(
      isSiteSearchBenched(
        'site-403',
        expiry + 100 + FORBIDDEN_BACKOFF_MS[1] - 1,
      ),
    ).toBe(true);
  });

  test('超出 10 分钟窗口的失败不算连续', () => {
    markSiteSearchFailure('site-window', 'timeout', 1000);
    markSiteSearchFailure('site-window', 'timeout', 1000 + 11 * MINUTE);

    expect(getSiteCircuitState('site-window', 1000 + 11 * MINUTE + 1)).toBe(
      'closed',
    );
  });

  test('慢源 EWMA 延迟达标后收紧单次超时，成功提速后恢复', () => {
    expect(getSiteSearchTimeoutMs('site-slow', 8000)).toBe(8000);

    markSiteSearchSuccess('site-slow', 6000);
    expect(getSiteSearchTimeoutMs('site-slow', 8000)).toBe(
      SEARCH_SLOW_SITE_TIMEOUT_MS,
    );

    // 多次快速响应拉低 EWMA 后恢复默认超时
    for (let i = 0; i < 6; i += 1) {
      markSiteSearchSuccess('site-slow', 400);
    }
    expect(getSiteSearchTimeoutMs('site-slow', 8000)).toBe(8000);
  });

  test('pickFirstHealthySite 跳过熔断源并在全挂时回退首个源', () => {
    const sites = [{ key: 's1' }, { key: 's2' }, { key: 's3' }];
    markSiteSearchFailure('s1', 'timeout', 0);
    markSiteSearchFailure('s1', 'timeout', 1000);

    expect(pickFirstHealthySite(sites, 2000)?.key).toBe('s2');

    markSiteSearchFailure('s2', 'forbidden', 0);
    markSiteSearchFailure('s2', 'forbidden', 1000);
    markSiteSearchFailure('s3', 'server_error', 0);
    markSiteSearchFailure('s3', 'server_error', 1000);

    // 全部熔断时兜底返回首个站点
    expect(pickFirstHealthySite(sites, 2000)?.key).toBe('s1');
  });

  test('resetSiteHealth 与 finishSiteHealthProbe 正确清理状态并输出快照', () => {
    markSiteSearchFailure('site-reset', 'timeout', 0);
    markSiteSearchFailure('site-reset', 'timeout', 1000);
    const expiry = 1000 + TRANSIENT_BACKOFF_MS[0];
    expect(
      shouldSkipSiteSearch('site-reset', expiry).shouldBackgroundProbe,
    ).toBe(true);
    finishSiteHealthProbe('site-reset');
    expect(getSiteHealthSnapshot(expiry)[0].probeInFlight).toBe(false);

    resetSiteHealth('site-reset');
    expect(getSiteCircuitState('site-reset', expiry)).toBe('closed');
    expect(getSiteHealthSnapshot(expiry)).toHaveLength(0);
  });

  test('识别超时错误与核心常量', () => {
    expect(isSearchTimeoutError({ name: 'TimeoutError' })).toBe(true);
    expect(isSearchTimeoutError(new Error('普通错误'))).toBe(false);
    expect(isSearchTimeoutError({ name: 'AbortError' })).toBe(false);
    expect(isSearchTimeoutError(null)).toBe(false);
    expect(isSearchTimeoutError(undefined)).toBe(false);
    expect(SEARCH_SITE_TIMEOUT_MS).toBe(10_000);
    expect(HALF_OPEN_PROBE_TIMEOUT_MS).toBe(4_000);
  });
});
