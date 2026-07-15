const mockFetchDoubanWithVerification = jest.fn();

jest.mock('./douban-anti-crawler', () => ({
  fetchDoubanWithVerification: mockFetchDoubanWithVerification,
}));

let fetchDoubanData: typeof import('./douban').fetchDoubanData;

describe('fetchDoubanData', () => {
  beforeAll(async () => {
    ({ fetchDoubanData } = await import('./douban'));
  });

  beforeEach(() => {
    mockFetchDoubanWithVerification.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not continue to the upstream fetch when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchDoubanData('https://movie.douban.com/test', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFetchDoubanWithVerification).not.toHaveBeenCalled();
  });

  it('cancels the random delay before starting the upstream fetch', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const controller = new AbortController();
    const result = fetchDoubanData(
      'https://m.douban.com/rexxar/api/v2/movie/recommend',
      controller.signal,
    );
    const rejection = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });

    controller.abort();
    jest.runAllTimers();

    await rejection;
    expect(mockFetchDoubanWithVerification).not.toHaveBeenCalled();
  });
});

export {};
