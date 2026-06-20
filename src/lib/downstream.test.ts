import { getDetailFromApi } from './downstream';

jest.mock('@/lib/config', () => ({
  API_CONFIG: {
    search: {
      path: '?ac=videolist&wd=',
      pagePath: '?ac=videolist&wd={query}&pg={page}',
      headers: {},
    },
    detail: {
      path: '?ac=videolist&ids=',
      headers: {},
    },
  },
  getConfig: jest.fn(),
}));

const apiSite = {
  key: 'mtzy.me',
  name: '茅台资源',
  api: 'https://caiji.maotaizy.cc/api.php/provide/vod',
  detail: 'https://mtzy.me',
};

function mockJsonResponse(data: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  } as Response);
}

function mockTextResponse(html: string, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: async () => html,
  } as Response);
}

describe('getDetailFromApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('uses standard JSON detail before HTML detail when episodes are available', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockReturnValue(
      mockJsonResponse({
        list: [
          {
            vod_id: 131288,
            vod_name: '低智商犯罪',
            vod_pic: 'https://example.com/poster.jpg',
            vod_year: '2025',
            vod_play_url:
              '第01集$https://example.com/ep1/index.m3u8#第02集$https://example.com/ep2/index.m3u8',
          },
        ],
      })
    );

    const result = await getDetailFromApi(apiSite, '131288');

    expect(result.episodes).toEqual([
      'https://example.com/ep1/index.m3u8',
      'https://example.com/ep2/index.m3u8',
    ]);
    expect(result.episodes_titles).toEqual(['第01集', '第02集']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://caiji.maotaizy.cc/api.php/provide/vod?ac=videolist&ids=131288'
    );
  });

  test('falls back to HTML detail when standard JSON detail fails', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    fetchMock
      .mockReturnValueOnce(mockJsonResponse({}, false, 500))
      .mockReturnValueOnce(
        mockTextResponse(
          '<h1>低智商犯罪</h1><a href="$https://example.com/ep1/index.m3u8">第01集</a>'
        )
      );

    const result = await getDetailFromApi(apiSite, '131288');

    expect(result.episodes).toEqual(['https://example.com/ep1/index.m3u8']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://mtzy.me/index.php/vod/detail/id/131288.html'
    );
  });
});
