/**
 * @jest-environment node
 */

const mockGetAvailableApiSites = jest.fn();

jest.mock('@/lib/config', () => ({
  // 惰性引用：jest.mock 工厂在模块初始化阶段执行，须等测试体运行时才能拿到 mock 实例
  getAvailableApiSites: (...args: unknown[]) =>
    mockGetAvailableApiSites(...args),
}));

import {
  checkGuestRateLimit,
  getGuestSource,
  isSourceAllowedForRequest,
} from './guest-source';

const GUEST_SITE = {
  key: 'iqiyizyapi.com',
  name: '爱奇艺',
  api: 'https://api.example.com',
};
const OTHER_SITE = {
  key: 'other',
  name: '其他源',
  api: 'https://other.example.com',
};

const makeRequest = (ip = '1.2.3.4') =>
  ({
    headers: new Headers({ 'x-forwarded-for': ip }),
  }) as unknown as Parameters<typeof checkGuestRateLimit>[0];

describe('guest-source', () => {
  beforeEach(() => {
    mockGetAvailableApiSites.mockReset();
  });

  describe('getGuestSource', () => {
    it('returns the site matching the guest key', async () => {
      mockGetAvailableApiSites.mockResolvedValue([OTHER_SITE, GUEST_SITE]);

      await expect(getGuestSource()).resolves.toEqual(GUEST_SITE);
      expect(mockGetAvailableApiSites).toHaveBeenCalledWith();
    });

    it('returns null when the guest source is missing or disabled', async () => {
      mockGetAvailableApiSites.mockResolvedValue([OTHER_SITE]);

      await expect(getGuestSource()).resolves.toBeNull();
    });
  });

  describe('isSourceAllowedForRequest', () => {
    it('allows guests to access only the guest source', async () => {
      mockGetAvailableApiSites.mockResolvedValue([GUEST_SITE, OTHER_SITE]);

      await expect(
        isSourceAllowedForRequest(null, GUEST_SITE.key),
      ).resolves.toEqual(GUEST_SITE);
      await expect(
        isSourceAllowedForRequest(null, 'other'),
      ).resolves.toBeNull();
      await expect(
        isSourceAllowedForRequest(null, undefined),
      ).resolves.toBeNull();
    });

    it('uses per-user source filtering for logged-in users', async () => {
      mockGetAvailableApiSites.mockImplementation(async (username?: string) =>
        username === 'alice' ? [OTHER_SITE] : [],
      );

      await expect(
        isSourceAllowedForRequest('alice', OTHER_SITE.key),
      ).resolves.toEqual(OTHER_SITE);
      await expect(
        isSourceAllowedForRequest('alice', GUEST_SITE.key),
      ).resolves.toBeNull();
      await expect(
        isSourceAllowedForRequest('bob', GUEST_SITE.key),
      ).resolves.toBeNull();
    });
  });

  describe('checkGuestRateLimit', () => {
    it('allows requests below the limit and returns a 429 response beyond it', () => {
      const ip = '9.9.9.9';
      const request = makeRequest(ip);

      // 前 60 次放行
      for (let i = 0; i < 60; i += 1) {
        expect(checkGuestRateLimit(request, 'detail')).toBeNull();
      }

      // 第 61 次限速
      const limited = checkGuestRateLimit(request, 'detail');
      expect(limited).not.toBeNull();
      expect(limited?.status).toBe(429);
      expect(limited?.headers.get('Retry-After')).toBeTruthy();

      // 其他 bucket 与其他 IP 不受影响
      expect(checkGuestRateLimit(request, 'list')).toBeNull();
      expect(checkGuestRateLimit(makeRequest('8.8.8.8'), 'detail')).toBeNull();
    });
  });
});

export {};
