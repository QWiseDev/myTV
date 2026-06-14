import { ClientCache } from './client-cache';

describe('ClientCache', () => {
  beforeEach(() => {
    ClientCache.clearMemory();
    global.fetch = jest.fn();
  });

  it('reuses cached GET results in memory', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { title: 'cached' } }),
    });

    await expect(ClientCache.get('home-key')).resolves.toEqual({
      title: 'cached',
    });
    await expect(ClientCache.get('home-key')).resolves.toEqual({
      title: 'cached',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent GET requests for the same key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: ['one'] }),
    });

    const [first, second] = await Promise.all([
      ClientCache.get('same-key'),
      ClientCache.get('same-key'),
    ]);

    expect(first).toEqual(['one']);
    expect(second).toEqual(['one']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
