import type { NextRequest } from 'next/server';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// 滑动窗口：key -> 窗口内事件时间戳列表（进程内存级，适用于单实例 Docker 部署；
// 多实例/Serverless 场景各实例独立计数，仅提供基础限速）
const windows = new Map<string, number[]>();

const MAX_TRACKED_KEYS = 5000;
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

function pruneWindow(timestamps: number[], windowMs: number, now: number) {
  const valid = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] <= valid) {
    timestamps.shift();
  }
}

function sweepExpired(now: number) {
  windows.forEach((timestamps, key) => {
    const latest = timestamps[timestamps.length - 1];
    if (timestamps.length === 0 || now - latest > MAX_EVENT_AGE_MS) {
      windows.delete(key);
    }
  });
}

function getTimestamps(key: string, windowMs: number, now: number): number[] {
  let timestamps = windows.get(key);
  if (!timestamps) {
    timestamps = [];
    windows.set(key, timestamps);
  }
  pruneWindow(timestamps, windowMs, now);
  return timestamps;
}

/** 检查并不记录事件：超过 limit 时返回 allowed=false 与建议重试秒数 */
export function peekRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const timestamps = getTimestamps(key, windowMs, now);
  if (timestamps.length >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((timestamps[0] + windowMs - now) / 1000)
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return {
    allowed: true,
    remaining: limit - timestamps.length,
    retryAfterSeconds: 0,
  };
}

/** 检查并记录一次事件 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const result = peekRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    return result;
  }
  windows.get(key)?.push(Date.now());
  if (windows.size > MAX_TRACKED_KEYS) {
    sweepExpired(Date.now());
  }
  return result;
}

/** 仅记录一次事件（如登录失败） */
export function recordRateLimitEvent(key: string, windowMs: number): void {
  const timestamps = getTimestamps(key, windowMs, Date.now());
  timestamps.push(Date.now());
  if (windows.size > MAX_TRACKED_KEYS) {
    sweepExpired(Date.now());
  }
}

/** 清除指定键的计数（如登录成功后清空失败记录） */
export function resetRateLimit(...keys: (string | null | undefined)[]): void {
  for (const key of keys) {
    if (key) {
      windows.delete(key);
    }
  }
}

/** 从代理头解析客户端 IP，取不到时返回 'unknown' */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) {
      return first;
    }
  }
  return req.headers.get('x-real-ip') || 'unknown';
}
