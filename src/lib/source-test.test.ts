export {};

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.resetModules();
});

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

describe('parsePlayableLines / parseSearchResultsForPlayback', () => {
  it('解析标题$地址与多线路，跳过非 http 地址', async () => {
    const { parsePlayableLines } = await import('./source-test');

    const lines = parsePlayableLines({
      id: '1',
      title: '剧',
      episodes: [
        '第1集$https://cdn.example.com/1.m3u8#第2集$https://cdn.example.com/2.m3u8',
        'https://cdn.example.com/e1.mp4',
        '',
        '非播放行',
      ],
    } as never);

    expect(lines).toHaveLength(2);
    // '第1集' 匹配 ^第?\d+ 前缀，按原实现回退为线路编号
    expect(lines[0].label).toBe('线路1');
    expect(lines[0].episodes).toEqual([
      { title: '第1集', url: 'https://cdn.example.com/1.m3u8', episodeIndex: 0 },
      { title: '第2集', url: 'https://cdn.example.com/2.m3u8', episodeIndex: 1 },
    ]);
    expect(lines[1].label).toBe('线路2');
    expect(lines[1].episodes[0].title).toBe('第1集');
  });

  it('带线路名前缀的线路取名为标签，无名线路回退为线路N', async () => {
    const { parsePlayableLines } = await import('./source-test');

    const named = parsePlayableLines({
      episodes: ['超清$https://a.example/1'],
    } as never);
    expect(named[0].label).toBe('超清');

    const fallback = parsePlayableLines({
      episodes: ['$https://a.example/1'],
    } as never);
    expect(fallback[0].label).toBe('线路1');
  });

  it('过滤无可播放线路的搜索结果', async () => {
    const { parseSearchResultsForPlayback } = await import('./source-test');

    const parsed = parseSearchResultsForPlayback([
      { id: '1', title: '可播', episodes: ['https://a.example/1'] },
      { id: '2', title: '不可播', episodes: ['视频损坏'] },
      { id: '3', title: '空线路', episodes: [] },
    ] as never);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].info.title).toBe('可播');
  });
});

describe('computeMatchRate / computeTopMatches', () => {
  it('按标题包含关键词计算命中率与前三示例', async () => {
    const { computeMatchRate, computeTopMatches } = await import(
      './source-test'
    );

    const results = [
      { title: '斗罗大陆' },
      { title: '斗罗大陆2' },
      { title: '别的剧' },
    ] as never[];

    expect(computeMatchRate(results, '斗罗')).toBe(2 / 3);
    expect(computeMatchRate([], '斗罗')).toBe(0);
    expect(computeTopMatches(results, '斗罗')).toEqual([
      '斗罗大陆',
      '斗罗大陆2',
    ]);
  });
});

describe('testSource', () => {
  it('成功时转换苹果CMS字段并计算匹配率', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        sourceName: '测试源',
        results: [
          {
            vod_id: 9,
            vod_name: '斗罗大陆',
            vod_pic: 'https://img.example/p.jpg',
            vod_year: '2024',
            vod_play_url: '第1集$https://cdn.example/1.m3u8',
            type_name: '动漫',
            vod_content: '简介',
          },
        ],
      })
    ) as unknown as typeof fetch;
    const { testSource } = await import('./source-test');

    const result = await testSource('src-a', '斗罗');

    expect(result.status).toBe('success');
    expect(result.sourceName).toBe('测试源');
    expect(result.results[0]).toMatchObject({
      id: 9,
      title: '斗罗大陆',
      source: 'src-a',
      source_name: '测试源',
      year: '2024',
      episodes: ['第1集$https://cdn.example/1.m3u8'],
    });
    expect(result.matchRate).toBe(1);
    expect(result.topMatches).toEqual(['斗罗大陆']);
  });

  it('408 映射为 timeout，其余非 2xx 映射为 error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ sourceError: '源搜索超时' }, false, 408)
      )
      .mockResolvedValueOnce(jsonResponse({ error: '服务错误' }, false, 500));
    const { testSource } = await import('./source-test');

    const timeout = await testSource('src-a', 'q');
    expect(timeout.status).toBe('timeout');
    expect(timeout.error).toBe('源搜索超时');

    const error = await testSource('src-a', 'q');
    expect(error.status).toBe('error');
    expect(error.error).toBe('服务错误');
  });

  it('请求异常时返回 error 与异常消息', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('网络中断');
    }) as unknown as typeof fetch;
    const { testSource } = await import('./source-test');

    const result = await testSource('src-a', 'q');
    expect(result.status).toBe('error');
    expect(result.error).toBe('网络中断');
  });
});

describe('autoTestVideoPlayback', () => {
  it('取第一条线路第一集作为可播放地址', async () => {
    const { autoTestVideoPlayback } = await import('./source-test');

    const result = await autoTestVideoPlayback('src-a', '测试源', [
      {
        id: '1',
        title: '剧名',
        episodes: ['超清$https://cdn.example/1.m3u8'],
      },
    ] as never);

    expect(result).toEqual({
      success: true,
      url: 'https://cdn.example/1.m3u8',
      message: '可播放: 剧名 - 超清 - 超清',
    });
  });

  it('无解析结果时返回失败（非 http 行在解析层即被过滤）', async () => {
    const { autoTestVideoPlayback } = await import('./source-test');

    const noLines = await autoTestVideoPlayback('src-a', '测试源', [
      { id: '1', title: '剧名', episodes: ['rtmp://example/stream'] },
    ] as never);
    expect(noLines).toEqual({
      success: false,
      message: '未能从搜索结果中解析到可播放地址',
    });
  });
});

describe('getAllApiSites', () => {
  it('优先使用 sources 接口', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        sources: [{ key: 'a', name: '源A', api: 'https://api.example' }],
      })
    ) as unknown as typeof fetch;
    const { getAllApiSites } = await import('./source-test');

    await expect(getAllApiSites()).resolves.toEqual([
      { key: 'a', name: '源A', api: 'https://api.example' },
    ]);
  });

  it('sources 接口失败时回退搜索接口并按 key 去重', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { source: 'a', source_name: '源A' },
            { source: 'a', source_name: '源A重复' },
            { source: 'b' },
          ],
        })
      );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getAllApiSites } = await import('./source-test');

    await expect(getAllApiSites()).resolves.toEqual([
      { key: 'a', name: '源A', api: '', disabled: false },
      { key: 'b', name: 'b', api: '', disabled: false },
    ]);
  });
});
