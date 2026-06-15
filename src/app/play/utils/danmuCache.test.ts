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
});
