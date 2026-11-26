/**
 * @jest-environment node
 */

import {
  assertPublicHttpUrl,
  getRequestOrigin,
  isIpInWhitelist,
  isPrivateOrReservedIp,
} from './url-safety';

describe('url-safety', () => {
  test('detects private, loopback, CGNAT, link-local and IPv6-mapped reserved IPs', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.5.4')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.10')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:7f00:1')).toBe(true);

    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('172.15.255.255')).toBe(false);
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  test('assertPublicHttpUrl rejects non-http protocols and local targets', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow();
    expect(() => assertPublicHttpUrl('javascript:alert(1)')).toThrow();
    expect(() =>
      assertPublicHttpUrl('http://127.0.0.1:8080/admin', { allowHttp: true }),
    ).toThrow();
    expect(() =>
      assertPublicHttpUrl('http://localhost/api/tvbox', { allowHttp: true }),
    ).toThrow();
    expect(() =>
      assertPublicHttpUrl('http://169.254.169.254/latest/meta-data', {
        allowHttp: true,
      }),
    ).toThrow();
    expect(() =>
      assertPublicHttpUrl('http://example.com', { allowHttp: false }),
    ).toThrow();

    expect(assertPublicHttpUrl('https://example.com/a.m3u8').hostname).toBe(
      'example.com',
    );
  });

  test('isIpInWhitelist accurately handles exact match, IPv4/IPv6 CIDR and rejects invalid masks', () => {
    expect(isIpInWhitelist('192.168.1.42', ['192.168.1.0/24'])).toBe(true);
    expect(isIpInWhitelist('192.168.2.42', ['192.168.1.0/24'])).toBe(false);
    expect(isIpInWhitelist('10.20.30.40', ['10.20.0.0/16'])).toBe(true);
    expect(isIpInWhitelist('10.21.30.40', ['10.20.0.0/16'])).toBe(false);
    expect(isIpInWhitelist('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(isIpInWhitelist('2001:db9::1', ['2001:db8::/32'])).toBe(false);
    expect(isIpInWhitelist('8.8.8.8', ['*'])).toBe(true);
    expect(isIpInWhitelist('8.8.8.8', ['8.8.8.0/99'])).toBe(false);
    expect(isIpInWhitelist('unknown', ['127.0.0.1'])).toBe(false);
  });

  test('getRequestOrigin respects x-forwarded-proto and x-forwarded-host without referer', () => {
    const req = new Request('http://internal:3000/api/proxy/m3u8', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'tv.example.com',
        host: 'internal:3000',
      },
    });
    expect(getRequestOrigin(req)).toBe('https://tv.example.com');
  });
});
