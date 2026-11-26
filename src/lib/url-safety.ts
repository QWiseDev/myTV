import dns from 'dns/promises';
import net from 'net';

const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = (value << 8) | octet;
  }

  return value >>> 0;
}

function isIpv4InCidr(
  ipInt: number,
  baseIp: string,
  prefixLen: number,
): boolean {
  const baseInt = ipv4ToInt(baseIp);
  if (baseInt === null || prefixLen < 0 || prefixLen > 32) {
    return false;
  }
  const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function normalizeIpv6(ip: string): string {
  return ip.split('%')[0].toLowerCase();
}

function expandIpv6ToGroups(ip: string): number[] | null {
  const normalized = normalizeIpv6(ip);
  if (!normalized) {
    return null;
  }

  // 处理 ::ffff:a.b.c.d 映射形式
  const lastColon = normalized.lastIndexOf(':');
  let working = normalized;
  if (lastColon !== -1 && normalized.includes('.')) {
    const ipv4Part = normalized.slice(lastColon + 1);
    const v4 = ipv4ToInt(ipv4Part);
    if (v4 === null) {
      return null;
    }
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    working = `${normalized.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const halves = working.split('::');
  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];

  if (halves.length === 1 && left.length !== 8) {
    return null;
  }
  if (halves.length === 2 && left.length + right.length >= 8) {
    return null;
  }

  const missing = halves.length === 2 ? 8 - (left.length + right.length) : 0;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => '0'),
    ...right,
  ];

  if (groups.length !== 8) {
    return null;
  }

  const numbers: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) {
      return null;
    }
    numbers.push(parseInt(g, 16));
  }

  return numbers;
}

/**
 * 判断 IPv4 或 IPv6 地址是否属于私网、回环、链路本地、保留或组播地址。
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '');
  if (!ip) {
    return true;
  }

  const ipVersion = net.isIP(normalizeIpv6(ip));
  if (ipVersion === 4) {
    const ipInt = ipv4ToInt(ip);
    if (ipInt === null) {
      return true;
    }

    return (
      isIpv4InCidr(ipInt, '0.0.0.0', 8) || // "this" network
      isIpv4InCidr(ipInt, '10.0.0.0', 8) || // RFC 1918
      isIpv4InCidr(ipInt, '100.64.0.0', 10) || // CGNAT RFC 6598
      isIpv4InCidr(ipInt, '127.0.0.0', 8) || // Loopback
      isIpv4InCidr(ipInt, '169.254.0.0', 16) || // Link-local & cloud metadata
      isIpv4InCidr(ipInt, '172.16.0.0', 12) || // RFC 1918
      isIpv4InCidr(ipInt, '192.0.0.0', 24) || // IETF protocol assignments
      isIpv4InCidr(ipInt, '192.0.2.0', 24) || // TEST-NET-1
      isIpv4InCidr(ipInt, '192.168.0.0', 16) || // RFC 1918
      isIpv4InCidr(ipInt, '198.18.0.0', 15) || // Benchmarking
      isIpv4InCidr(ipInt, '198.51.100.0', 24) || // TEST-NET-2
      isIpv4InCidr(ipInt, '203.0.113.0', 24) || // TEST-NET-3
      isIpv4InCidr(ipInt, '224.0.0.0', 4) || // Multicast
      isIpv4InCidr(ipInt, '240.0.0.0', 4) // Reserved / broadcast
    );
  }

  if (ipVersion === 6) {
    const groups = expandIpv6ToGroups(ip);
    if (!groups) {
      return true;
    }

    const isUnspecified = groups.every((g) => g === 0);
    const isLoopback =
      groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
    if (isUnspecified || isLoopback) {
      return true;
    }

    // IPv4-mapped ::ffff:0:0/96
    const isIpv4Mapped =
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0xffff;
    if (isIpv4Mapped) {
      const v4Int = ((groups[6] << 16) | groups[7]) >>> 0;
      return (
        isIpv4InCidr(v4Int, '0.0.0.0', 8) ||
        isIpv4InCidr(v4Int, '10.0.0.0', 8) ||
        isIpv4InCidr(v4Int, '100.64.0.0', 10) ||
        isIpv4InCidr(v4Int, '127.0.0.0', 8) ||
        isIpv4InCidr(v4Int, '169.254.0.0', 16) ||
        isIpv4InCidr(v4Int, '172.16.0.0', 12) ||
        isIpv4InCidr(v4Int, '192.168.0.0', 16) ||
        isIpv4InCidr(v4Int, '224.0.0.0', 4) ||
        isIpv4InCidr(v4Int, '240.0.0.0', 4)
      );
    }

    // fc00::/7 (Unique Local), fe80::/10 (Link Local), ff00::/8 (Multicast)
    const firstByte = groups[0] >> 8;
    if ((firstByte & 0xfe) === 0xfc) return true;
    if ((groups[0] & 0xffc0) === 0xfe80) return true;
    if (firstByte === 0xff) return true;

    return false;
  }

  return true;
}

/**
 * 同步校验 URL 格式与主机名是否可作为公网 HTTP(S) 请求目标。
 */
export function assertPublicHttpUrl(
  rawUrl: string,
  options?: { allowHttp?: boolean },
): URL {
  const allowHttp = options?.allowHttp ?? true;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('无效的 URL 地址');
  }

  if (
    parsed.protocol !== 'https:' &&
    (!allowHttp || parsed.protocol !== 'http:')
  ) {
    throw new Error('不支持的 URL 协议');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL 不允许包含认证凭据');
  }

  const host = parsed.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!host) {
    throw new Error('URL 缺少主机名');
  }

  if (
    PRIVATE_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('禁止访问本地或内网地址');
  }

  if (net.isIP(normalizeIpv6(host)) !== 0 && isPrivateOrReservedIp(host)) {
    throw new Error('禁止访问内网或保留 IP 地址');
  }

  return parsed;
}

/**
 * 异步校验远程 URL 及其 DNS 解析结果，拦截指向私网/回环/云元数据地址的 SSRF。
 */
export async function resolveAndValidateRemoteUrl(
  rawUrl: string,
  options?: { allowHttp?: boolean; skipDnsCheck?: boolean },
): Promise<URL> {
  const parsed = assertPublicHttpUrl(rawUrl, options);
  const host = parsed.hostname.trim().replace(/^\[|\]$/g, '');

  if (net.isIP(normalizeIpv6(host)) !== 0 || options?.skipDnsCheck) {
    return parsed;
  }

  let records: Array<{ address: string }>;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    // 某些环境或离线测试下 DNS 不可达时由外呼 fetch 报错，不误杀已验证域名格式；
    // 但若明确解析出了私网 IP 则强制拦截。
    return parsed;
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error('目标域名解析到受限内网 IP 地址');
    }
  }

  return parsed;
}

/**
 * 带 SSRF 防护与重定向校验的安全 fetch。
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & {
    maxRedirects?: number;
    skipDnsCheck?: boolean;
    allowHttp?: boolean;
  } = {},
): Promise<Response> {
  const {
    maxRedirects = 3,
    skipDnsCheck = false,
    allowHttp = true,
    ...fetchInit
  } = init;
  let currentUrl = (
    await resolveAndValidateRemoteUrl(rawUrl, { skipDnsCheck, allowHttp })
  ).toString();

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(currentUrl, {
      ...fetchInit,
      redirect: 'manual',
    });

    const locationHeader = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && locationHeader) {
      if (redirects === maxRedirects) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('重定向次数过多');
      }
      await response.body?.cancel().catch(() => undefined);
      const nextUrl = new URL(locationHeader, currentUrl).toString();
      currentUrl = (
        await resolveAndValidateRemoteUrl(nextUrl, { skipDnsCheck, allowHttp })
      ).toString();
      continue;
    }

    return response;
  }

  throw new Error('重定向次数过多');
}

/**
 * 准确的 IP / CIDR 白名单匹配（支持 IPv4 位运算掩码与 IPv6 精确/前缀匹配）。
 */
export function isIpInWhitelist(
  clientIp: string,
  allowedIPs: string[],
): boolean {
  const normalizedClient = normalizeIpv6(clientIp.trim());
  if (!normalizedClient) {
    return false;
  }

  const clientV4 = ipv4ToInt(normalizedClient);
  const clientV6 =
    clientV4 === null ? expandIpv6ToGroups(normalizedClient) : null;

  return allowedIPs.some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed === '*') {
      return true;
    }

    if (trimmed.includes('/')) {
      const [networkRaw, maskRaw] = trimmed.split('/', 2);
      const network = normalizeIpv6(networkRaw.trim());
      const prefixLen = Number(maskRaw);
      if (!Number.isInteger(prefixLen)) {
        return false;
      }

      const netV4 = ipv4ToInt(network);
      if (netV4 !== null && clientV4 !== null) {
        return isIpv4InCidr(clientV4, network, prefixLen);
      }

      const netV6 = expandIpv6ToGroups(network);
      if (netV6 && clientV6 && prefixLen >= 0 && prefixLen <= 128) {
        let remaining = prefixLen;
        for (let i = 0; i < 8; i += 1) {
          if (remaining <= 0) return true;
          const bits = Math.min(16, remaining);
          const mask = (0xffff << (16 - bits)) & 0xffff;
          if ((clientV6[i] & mask) !== (netV6[i] & mask)) {
            return false;
          }
          remaining -= bits;
        }
        return true;
      }

      return false;
    }

    const normalizedAllowed = normalizeIpv6(trimmed);
    if (clientV4 !== null) {
      const allowedV4 = ipv4ToInt(normalizedAllowed);
      return allowedV4 !== null && allowedV4 === clientV4;
    }
    if (clientV6) {
      const allowedV6 = expandIpv6ToGroups(normalizedAllowed);
      return (
        allowedV6 !== null &&
        clientV6.every((group, idx) => group === allowedV6[idx])
      );
    }

    return normalizedClient === normalizedAllowed;
  });
}

/**
 * 提取对外可访问的协议与 Host，优先考虑反向代理头（x-forwarded-proto/host）与 req.url。
 */
export function getRequestOrigin(req: Request): string {
  const forwardedProto = req.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = req.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const hostHeader = req.headers.get('host')?.split(',')[0]?.trim();

  let fallbackUrl: URL | null = null;
  try {
    fallbackUrl = new URL(req.url);
  } catch {
    fallbackUrl = null;
  }

  let protocol = forwardedProto;
  if (!protocol) {
    const referer = req.headers.get('referer');
    if (referer) {
      try {
        protocol = new URL(referer).protocol.replace(':', '');
      } catch {
        // ignore invalid referer
      }
    }
  }
  if (!protocol) {
    protocol = fallbackUrl ? fallbackUrl.protocol.replace(':', '') : 'http';
  }
  if (protocol !== 'http' && protocol !== 'https') {
    protocol = 'http';
  }

  const host = forwardedHost || hostHeader || fallbackUrl?.host || '';
  return host ? `${protocol}://${host}` : '';
}
