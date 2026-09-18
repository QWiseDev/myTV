import { timingSafeEqual } from 'crypto';

// 允许免密调用的本机主机名（Docker 内 start.js 以 HOSTNAME=0.0.0.0 自调用）
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export interface CronAuthResult {
  ok: boolean;
  status: number;
  message: string;
}

interface CronRequestLike {
  url: string;
  headers: { get(name: string): string | null };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function extractBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function extractHostname(hostHeader: string): string {
  // IPv6 带端口形如 [::1]:3000，不能按冒号直接切分
  const bracketMatch = /^\[(.+)\]/.exec(hostHeader);
  if (bracketMatch) {
    return bracketMatch[1];
  }
  return hostHeader.split(':')[0];
}

/**
 * 校验 /api/cron 调用方身份：
 * - 配置了 CRON_SECRET：要求 Authorization: Bearer / x-cron-secret 头 / ?secret= 查询参数之一匹配；
 * - 未配置：仅放行本机 Host 调用（Docker start.js 内部调度、本地 curl），外部请求一律拒绝。
 *   注意：本机 Host 校验依赖反代不透传客户端 Host，生产环境务必配置 CRON_SECRET。
 */
export function verifyCronAuth(request: CronRequestLike): CronAuthResult {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const provided =
      extractBearerToken(request.headers.get('authorization')) ??
      request.headers.get('x-cron-secret') ??
      new URL(request.url).searchParams.get('secret');

    if (!provided || !safeEqual(provided, secret)) {
      return {
        ok: false,
        status: 401,
        message: 'CRON_SECRET 校验失败',
      };
    }
    return { ok: true, status: 200, message: 'ok' };
  }

  const hostHeader = (request.headers.get('host') ?? '').toLowerCase();
  const host = hostHeader ? extractHostname(hostHeader) : '';
  if (!LOCAL_HOSTNAMES.has(host)) {
    return {
      ok: false,
      status: 403,
      message:
        '未配置 CRON_SECRET，且请求非本机调用。请在环境变量中配置 CRON_SECRET 后，以 Authorization: Bearer <CRON_SECRET> 方式调用',
    };
  }
  return { ok: true, status: 200, message: 'ok' };
}
