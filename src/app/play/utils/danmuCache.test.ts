import { ClientCache } from '@/lib/client-cache';

import { getDanmuCacheItem, setDanmuCacheItem } from './danmuCache';

jest.mock('@/lib/client-cache', () => ({
  ClientCache: {
    get: jest.fn(),
  },
}));

describe('danmuCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('writes danmaku to local cache and reads it without server cache', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10000);

    await setDanmuCacheItem('title_2024_123_1', [{ text: 'cached', time: 1 }]);

    await expect(getDanmuCacheItem('title_2024_123_1')).resolves.toEqual({
      data: [{ text: 'cached', time: 1 }],
      timestamp: 10000,
    });
    expect(ClientCache.get).not.toHaveBeenCalled();
  });

  test('falls back to existing server cache when local cache misses', async () => {
    (ClientCache.get as jest.Mock).mockResolvedValue({
      data: [{ text: 'server', time: 2 }],
      timestamp: 20000,
    });

    await expect(getDanmuCacheItem('title_2024_123_2')).resolves.toEqual({
      data: [{ text: 'server', time: 2 }],
      timestamp: 20000,
    });
    expect(ClientCache.get).toHaveBeenCalledWith(
      'danmu-cache-title_2024_123_2',
    );
  });

  test('skips server cache when allowRemote is false', async () => {
    await expect(
      getDanmuCacheItem('missing_key', { allowRemote: false }),
    ).resolves.toBeNull();
    expect(ClientCache.get).not.toHaveBeenCalled();
  });

  test('ignores expired local entries based on danmaku TTL', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(10000);
    await setDanmuCacheItem('expiring_key', [{ text: 'old', time: 1 }]);

    nowSpy.mockReturnValue(10000 + 30 * 60 * 1000 + 1);
    (ClientCache.get as jest.Mock).mockResolvedValue(null);

    await expect(getDanmuCacheItem('expiring_key')).resolves.toBeNull();
    expect(ClientCache.get).toHaveBeenCalledWith('danmu-cache-expiring_key');
  });

  test('bounds local entries to at most 5 and recovers from QuotaExceededError', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    for (let i = 1; i <= 6; i += 1) {
      nowSpy.mockReturnValue(i * 1000);
      await setDanmuCacheItem(`k_${i}`, [{ text: `d_${i}`, time: i }]);
    }

    nowSpy.mockReturnValue(7000);
    await expect(
      getDanmuCacheItem('k_1', { allowRemote: false }),
    ).resolves.toBeNull();
    await expect(
      getDanmuCacheItem('k_6', { allowRemote: false }),
    ).resolves.toEqual({
      data: [{ text: 'd_6', time: 6 }],
      timestamp: 6000,
    });

    const originalSetItem = Storage.prototype.setItem;
    let firstWrite = true;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      if (firstWrite) {
        firstWrite = false;
        throw new Error('QuotaExceededError');
      }
      return originalSetItem.call(this, k, v);
    });

    nowSpy.mockReturnValue(8000);
    await setDanmuCacheItem('k_7', [{ text: 'd_7', time: 7 }]);
    await expect(
      getDanmuCacheItem('k_7', { allowRemote: false }),
    ).resolves.toEqual({
      data: [{ text: 'd_7', time: 7 }],
      timestamp: 8000,
    });
  });
});
