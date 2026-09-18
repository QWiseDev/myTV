import {
  consumeRateLimit,
  peekRateLimit,
  recordRateLimitEvent,
  resetRateLimit,
} from './rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('窗口内允许 limit 次，超出后拒绝并给出重试秒数', () => {
    const key = 'test:attempt:1';
    for (let i = 0; i < 3; i++) {
      const result = consumeRateLimit(key, 3, 60_000);
      expect(result.allowed).toBe(true);
    }
    const denied = consumeRateLimit(key, 3, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('peek 只检查不记录，不消耗配额', () => {
    const key = 'test:peek:1';
    recordRateLimitEvent(key, 60_000);
    expect(peekRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(peekRateLimit(key, 2, 60_000).allowed).toBe(true);
    // peek 未记录，仍只算 1 次
    expect(consumeRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000).allowed).toBe(false);
  });

  it('窗口滑动过期后恢复允许', () => {
    const key = 'test:window:1';
    for (let i = 0; i < 2; i++) {
      expect(consumeRateLimit(key, 2, 10_000).allowed).toBe(true);
    }
    expect(consumeRateLimit(key, 2, 10_000).allowed).toBe(false);

    jest.advanceTimersByTime(10_001);
    expect(consumeRateLimit(key, 2, 10_000).allowed).toBe(true);
  });

  it('resetRateLimit 清除计数（登录成功后应清空失败记录）', () => {
    const key = 'test:reset:1';
    recordRateLimitEvent(key, 60_000);
    recordRateLimitEvent(key, 60_000);
    expect(peekRateLimit(key, 2, 60_000).allowed).toBe(false);

    resetRateLimit(key);
    expect(peekRateLimit(key, 2, 60_000).allowed).toBe(true);
  });

  it('resetRateLimit 忽略空键', () => {
    expect(() => resetRateLimit(null, undefined, '')).not.toThrow();
  });
});
