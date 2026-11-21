/**
 * @jest-environment node
 */

// GET 契约测试：钉住 danmu-external 路由现有的来源优先级与兜底行为。
// withAbortableTimeout 保持真实实现，超时分支通过让任务直接 reject TimeoutError 触发。

const mockGetConfig = jest.fn();
const mockFetchDoubanWithVerification = jest.fn();
const mockIsDoubanChallengePage = jest.fn();
const mockBypassDoubanPowChallenge = jest.fn();

export {};

jest.mock('@/lib/config', () => ({
  getConfig: mockGetConfig,
}));

jest.mock('@/lib/douban-anti-crawler', () => ({
  fetchDoubanWithVerification: mockFetchDoubanWithVerification,
}));

jest.mock('@/lib/douban-challenge', () => ({
  isDoubanChallengePage: mockIsDoubanChallengePage,
  bypassDoubanPowChallenge: mockBypassDoubanPowChallenge,
}));

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

const fetchMock = jest.fn();

let GET: typeof import('./route').GET;
let NextRequest: typeof import('next/server').NextRequest;

beforeAll(async () => {
  global.fetch = fetchMock as unknown as typeof fetch;
  global.Headers = edgePrimitives.Headers;
  global.Request = edgePrimitives.Request;
  global.Response = edgePrimitives.Response;
  ({ NextRequest } = await import('next/server'));
  ({ GET } = await import('./route'));
});

beforeEach(() => {
  fetchMock.mockReset();
  mockGetConfig.mockResolvedValue({
    DanmuConfig: { apiBaseUrl: 'https://danmu.example.com' },
  });
  mockFetchDoubanWithVerification.mockReset();
  mockIsDoubanChallengePage.mockReset();
  mockIsDoubanChallengePage.mockReturnValue(false);
  mockBypassDoubanPowChallenge.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => data,
  } as unknown as Response;
}

function textResponse(text: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    text: async () => text,
  } as unknown as Response;
}

const DOUBAN_HTML =
  'play_link: "https%3A%2F%2Fv.qq.com%2Fx%2Fcover%2Fmzc00200xxx.html%3Fptag%3Ddouban"';

const XML_BODY =
  '<d p="5,1,16777215,16777215">你好世界</d><d p="8,1,16777215,16777215">晚安玛卡巴卡</d>';

describe('GET /api/danmu-external', () => {
  it('video_url 命中平台时优先返回 KLM 弹幕', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/comment?url=')) {
        return jsonResponse({
          success: true,
          comments: [{ p: '10.5,1,16777215,16777215', m: '测试弹幕' }],
        });
      }
      return { ok: false } as Response;
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/danmu-external?video_url=https://v.qq.com/x/cover/abc123.html&title=' +
          encodeURIComponent('测试剧'),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '测试弹幕', time: 10.5, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'logvar_url',
          url: 'https://v.qq.com/x/cover/abc123.html',
          count: 1,
        },
      ],
      total: 1,
    });
  });

  it('仅 title 时按文件名匹配 KLM 剧集', async () => {
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/api/v2/match')) {
          return jsonResponse({
            success: true,
            isMatched: true,
            matches: [
              {
                episodeId: 88,
                animeTitle: '测试剧 2024',
                episodeTitle: '第2集',
              },
            ],
          });
        }
        if (url.includes('/api/v2/comment/')) {
          return jsonResponse({
            success: true,
            comments: [{ p: '12,1,16777215,16777215', m: '剧集弹幕' }],
          });
        }
        return { ok: false } as Response;
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?title=${encodeURIComponent(
          '测试剧',
        )}&year=2024&episode=2`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '剧集弹幕', time: 12, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'logvar_episode',
          episodeId: '88',
          title: '测试剧 2024',
          episodeTitle: '第2集',
          count: 1,
        },
      ],
      total: 1,
    });

    const matchCall = fetchMock.mock.calls.find(([calledUrl]) =>
      String(calledUrl).includes('/api/v2/match'),
    );
    expect(JSON.parse(String(matchCall?.[1]?.body))).toEqual({
      fileName: '测试剧 2024 第2集',
    });
  });

  it('仅 title 且文件名匹配失败时回退到搜索接口', async () => {
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/api/v2/match')) {
          return jsonResponse({ success: true, isMatched: false });
        }
        if (url.includes('/api/v2/search/episodes')) {
          return jsonResponse({
            success: true,
            animes: [
              {
                animeTitle: '测试剧 2024 备选',
                episodes: [{ episodeId: '77', episodeTitle: '第二集' }],
              },
            ],
          });
        }
        if (url.includes('/api/v2/comment/')) {
          return jsonResponse({
            success: true,
            comments: [{ p: '30,1,16777215,16777215', m: '搜索命中弹幕' }],
          });
        }
        return { ok: false } as Response;
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?title=${encodeURIComponent(
          '测试剧',
        )}&year=2024&episode=2`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '搜索命中弹幕', time: 30, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'logvar_episode',
          episodeId: '77',
          title: '测试剧 2024 备选',
          episodeTitle: '第二集',
          count: 1,
        },
      ],
      total: 1,
    });
  });

  it('douban_id 命中 PoW 挑战时过盾后提取平台链接并合并弹幕', async () => {
    // random 固定为 0：去除防封随机延时与 Referer 概率分支，加速真实定时器
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/1234567/',
      text: async () => DOUBAN_HTML,
    });
    mockIsDoubanChallengePage.mockReturnValue(true);
    mockBypassDoubanPowChallenge.mockResolvedValue({
      html: `${DOUBAN_HTML} https://www.bilibili.com/video/BV1abc123`,
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/comment?url=')) {
        return jsonResponse({ success: true, comments: [] });
      }
      if (url.includes('fc.lyz05.cn') || url.includes('danmu.smone.us')) {
        return textResponse(XML_BODY);
      }
      return { ok: false } as Response;
    });

    const response = await GET(
      new NextRequest('http://localhost/api/danmu-external?douban_id=1234567'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [
        { text: '你好世界', time: 5, color: '#FFFFFF', mode: 0 },
        { text: '晚安玛卡巴卡', time: 8, color: '#FFFFFF', mode: 0 },
      ],
      platforms: [
        {
          platform: 'tencent',
          url: 'https://v.qq.com/x/cover/mzc00200xxx.html',
          count: 2,
        },
        {
          platform: 'bilibili',
          url: 'https://www.bilibili.com/video/BV1abc123',
          count: 2,
        },
      ],
      total: 2,
    });
    expect(mockBypassDoubanPowChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeUrl: 'https://movie.douban.com/subject/1234567/',
        timeoutMs: 15000,
      }),
    );
  });

  it('douban_id 请求超时时记录 10 秒超时日志并返回空兜底', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const timeoutError = new Error('Promise timed out after 10000ms');
    timeoutError.name = 'TimeoutError';
    mockFetchDoubanWithVerification.mockRejectedValue(timeoutError);

    const response = await GET(
      new NextRequest('http://localhost/api/danmu-external?douban_id=7654321'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [],
      platforms: [],
      total: 0,
      message: '未找到"null"的视频平台链接，无法获取弹幕数据',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '❌ 豆瓣请求超时 (10秒):',
      '7654321',
    );
  });

  it('豆瓣无结果时回退 caiji 接口并按集数选集', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/24680/',
      text: async () => '<html></html>',
    });
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/api/v2/match')) {
          return { ok: false } as Response;
        }
        if (url.includes('caiji.cyou') && url.includes('wd=')) {
          return jsonResponse({
            list: [{ vod_id: 9, vod_name: '爱情公寓' }],
          });
        }
        if (url.includes('ac=detail&ids=9')) {
          return jsonResponse({
            list: [
              {
                vod_id: 9,
                vod_play_url:
                  '第1集$https://v.qq.com/x/cover/abc.htm#第2集$https://v.qq.com/x/cover/def.htm',
              },
            ],
          });
        }
        if (url.includes('/api/v2/comment?url=')) {
          return jsonResponse({
            success: true,
            comments: [{ p: '3.2,1,16777215,16777215', m: '弹幕A' }],
          });
        }
        return { ok: false } as Response;
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=24680&title=${encodeURIComponent(
          '爱情公寓',
        )}&episode=2`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '弹幕A', time: 3.2, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'tencent_caiji',
          url: 'https://v.qq.com/x/cover/def.html',
          count: 1,
        },
      ],
      total: 1,
    });
  });

  it('豆瓣 mgtv play_link 按集数提取并命中 KLM 弹幕', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const mgtvHtml =
      'play_link: "https%3A%2F%2Fw.mgtv.com%2Fb%2F744227%2F22880001.html%3Fptag%3Ddouban" ' +
      'play_link: "https%3A%2F%2Fw.mgtv.com%2Fb%2F744227%2F22880002.html%3Fptag%3Ddouban"';
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/37100984/',
      text: async () => mgtvHtml,
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/comment?url=')) {
        return jsonResponse({
          success: true,
          comments: [{ p: '7.7,1,16777215,16777215', m: '芒果弹幕' }],
        });
      }
      return { ok: false } as Response;
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/danmu-external?douban_id=37100984&episode=2',
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '芒果弹幕', time: 7.7, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'mgtv',
          url: 'https://w.mgtv.com/b/744227/22880002.html',
          count: 1,
        },
      ],
      total: 1,
    });
  });

  it('豆瓣 m.mgtv.com 移动版链接转换为 PC 版', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const mgtvMobileHtml =
      'play_link: "https%3A%2F%2Fm.mgtv.com%2Fb%2F744227%2F22880003.html%3Fptag%3Ddouban"';
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/37100984/',
      text: async () => mgtvMobileHtml,
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/comment?url=')) {
        return jsonResponse({
          success: true,
          comments: [{ p: '4.4,1,16777215,16777215', m: '移动版转换弹幕' }],
        });
      }
      return { ok: false } as Response;
    });

    const response = await GET(
      new NextRequest('http://localhost/api/danmu-external?douban_id=37100984'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '移动版转换弹幕', time: 4.4, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'mgtv',
          url: 'https://www.mgtv.com/b/744227/22880003.html',
          count: 1,
        },
      ],
      total: 1,
    });
  });

  it('豆瓣与 caiji 均无结果时回退 danmu_api 标题匹配', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/111/',
      text: async () => '<html></html>',
    });
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/api/v2/match')) {
          return jsonResponse({
            success: true,
            isMatched: true,
            matches: [
              {
                episodeId: 9012,
                animeTitle: '后会友期 2026',
                episodeTitle: '第1集',
              },
            ],
          });
        }
        if (url.includes('/api/v2/comment/9012')) {
          return jsonResponse({
            success: true,
            comments: [{ p: '15.5,1,16777215,16777215', m: '标题匹配弹幕' }],
          });
        }
        return { ok: false } as Response;
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=111&title=${encodeURIComponent(
          '后会友期',
        )}&year=2026&episode=1`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '标题匹配弹幕', time: 15.5, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'logvar_episode',
          episodeId: '9012',
          title: '后会友期 2026',
          episodeTitle: '第1集',
          count: 1,
        },
      ],
      total: 1,
    });
  });

  it('回退 danmu_api 搜索缺集时不错绑其他集弹幕', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/111/',
      text: async () => '<html></html>',
    });
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/api/v2/match')) {
          return jsonResponse({ success: true, isMatched: false });
        }
        // danmu_api 收录了该剧但缺失第 1 集（如芒果SVIP抢先看集）
        if (url.includes('/api/v2/search/episodes')) {
          return jsonResponse({
            success: true,
            animes: [
              {
                animeTitle: '后会友期 2026',
                episodes: [{ episodeId: 'E2', episodeTitle: '第2集' }],
              },
            ],
          });
        }
        return { ok: false } as Response;
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=111&title=${encodeURIComponent(
          '后会友期',
        )}&year=2026&episode=1`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [],
      platforms: [],
      total: 0,
      message: '未找到"后会友期"的视频平台链接，无法获取弹幕数据',
    });
  });

  it('match 与 search/episodes 失败时经 search/anime + bangumi 命中综艺第N期', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/111/',
      text: async () => '<html></html>',
    });
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/api/v2/match')) {
          return jsonResponse({ success: true, isMatched: false });
        }
        // search/episodes 接口不可用（自建 danmu_api 未实现或格式不符）
        if (url.includes('/api/v2/search/episodes')) {
          return { ok: false } as Response;
        }
        // search/anime 返回真实搜索结果：正片在前，衍生版在后
        if (url.includes('/api/v2/search/anime')) {
          return jsonResponse({
            success: true,
            animes: [
              {
                animeId: 295201,
                animeTitle: '后会友期(2026)【综艺】from 360',
              },
              {
                animeId: 295202,
                animeTitle: '后会友期 沉浸版(2026)【综艺】from 360',
              },
            ],
          });
        }
        // bangumi 集列表：综艺标题为「第N期」格式
        if (url.includes('/api/v2/bangumi/295201')) {
          return jsonResponse({
            bangumi: {
              episodes: [
                {
                  episodeId: 12714,
                  episodeTitle:
                    '【imgo】 第1期：再见朋友！出发前采 2026-10-22期',
                },
                {
                  episodeId: 12715,
                  episodeTitle: '【imgo】 第2期：朋友再见！尴尬 2026-10-22期',
                },
              ],
            },
          });
        }
        if (url.includes('/api/v2/bangumi/295202')) {
          return jsonResponse({
            bangumi: {
              episodes: [
                { episodeId: 12800, episodeTitle: '【imgo】 第1期：沉浸版' },
              ],
            },
          });
        }
        if (url.includes('/api/v2/comment/12714')) {
          return jsonResponse({
            success: true,
            comments: [{ p: '9.9,1,16777215,16777215', m: '第一期弹幕' }],
          });
        }
        return { ok: false } as Response;
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=111&title=${encodeURIComponent(
          '后会友期',
        )}&year=2026&episode=1`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '第一期弹幕', time: 9.9, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'logvar_episode',
          episodeId: '12714',
          title: '后会友期(2026)【综艺】from 360',
          episodeTitle: '【imgo】 第1期：再见朋友！出发前采 2026-10-22期',
          count: 1,
        },
      ],
      total: 1,
    });
    // 正片（非衍生版）的 comment 被尝试，沉浸版未被消费
    const commentUrls = fetchMock.mock.calls
      .map(([calledUrl]) => String(calledUrl))
      .filter((url) => url.includes('/api/v2/comment/'));
    expect(commentUrls).toHaveLength(1);
    expect(commentUrls[0]).toContain('12714');
  });

  it('episode_title 为沉浸版时按版式命中沉浸版条目（日期与正片相同也不错绑）', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/match')) {
        return jsonResponse({ success: true, isMatched: false });
      }
      if (url.includes('/api/v2/search/episodes')) {
        return { ok: false } as Response;
      }
      if (url.includes('/api/v2/search/anime')) {
        return jsonResponse({
          success: true,
          animes: [
            { animeId: 295201, animeTitle: '后会友期(2026)【综艺】from 360' },
            {
              animeId: 295202,
              animeTitle: '后会友期 沉浸版(2026)【综艺】from 360',
            },
          ],
        });
      }
      if (url.includes('/api/v2/bangumi/295201')) {
        return jsonResponse({
          bangumi: {
            episodes: [
              { episodeId: 12714, episodeTitle: '第1期：正片 2026-10-22期' },
            ],
          },
        });
      }
      if (url.includes('/api/v2/bangumi/295202')) {
        return jsonResponse({
          bangumi: {
            episodes: [{ episodeId: 12800, episodeTitle: '第1期：沉浸版' }],
          },
        });
      }
      if (url.includes('/api/v2/comment/12800')) {
        return jsonResponse({
          success: true,
          comments: [{ p: '3.3,1,16777215,16777215', m: '沉浸版弹幕' }],
        });
      }
      return { ok: false } as Response;
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=111&title=${encodeURIComponent(
          '后会友期',
        )}&year=2026&episode=1&episode_title=${encodeURIComponent(
          '第20261022期沉浸版',
        )}&variant_episode=1`,
      ),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.platforms[0].episodeId).toBe('12800');
    expect(data.danmu[0].text).toBe('沉浸版弹幕');
  });

  it('episode_title 带日期时在同序数候选中按日期裁决', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/match')) {
        return jsonResponse({ success: true, isMatched: false });
      }
      if (url.includes('/api/v2/search/episodes')) {
        return { ok: false } as Response;
      }
      if (url.includes('/api/v2/search/anime')) {
        return jsonResponse({
          success: true,
          animes: [
            { animeId: 295201, animeTitle: '后会友期(2026)【综艺】from 360' },
          ],
        });
      }
      if (url.includes('/api/v2/bangumi/295201')) {
        return jsonResponse({
          bangumi: {
            episodes: [
              { episodeId: 12714, episodeTitle: '第1期：正片 2026-10-22期' },
              { episodeId: 12715, episodeTitle: '第2期：上 2026-10-22期' },
              { episodeId: 12716, episodeTitle: '第2期：下 2026-10-23期' },
            ],
          },
        });
      }
      if (url.includes('/api/v2/comment/12715')) {
        return jsonResponse({
          success: true,
          comments: [{ p: '1.1,1,16777215,16777215', m: '上期弹幕' }],
        });
      }
      return { ok: false } as Response;
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=111&title=${encodeURIComponent(
          '后会友期',
        )}&year=2026&episode=2&episode_title=${encodeURIComponent(
          '第20261022期第02期',
        )}`,
      ),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    // 同为第2期的两个候选（22 日 / 23 日），按本地集名日期选中 22 日
    expect(data.platforms[0].episodeId).toBe('12715');
    expect(data.danmu[0].text).toBe('上期弹幕');
  });

  it('match 错配集数时复核拦截并降级到 search/episodes 正确选集', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/111/',
      text: async () => '<html></html>',
    });
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/api/v2/match')) {
          // danmu_api 按标题相似度把「第2集」错配到第1期
          return jsonResponse({
            success: true,
            isMatched: true,
            matches: [
              {
                episodeId: 12714,
                animeTitle: '后会友期(2026)【综艺】from 360',
                episodeTitle: '【imgo】 第1期：再见朋友！出发前采 2026-10-22期',
              },
            ],
          });
        }
        if (url.includes('/api/v2/search/episodes')) {
          return jsonResponse({
            success: true,
            animes: [
              {
                animeTitle: '后会友期(2026)【综艺】from 360',
                episodes: [
                  {
                    episodeId: 12715,
                    episodeTitle: '【imgo】 第2期：朋友再见！尴尬',
                  },
                ],
              },
            ],
          });
        }
        if (url.includes('/api/v2/comment/')) {
          return jsonResponse({
            success: true,
            comments: [{ p: '21.3,1,16777215,16777215', m: '第二期弹幕' }],
          });
        }
        return { ok: false } as Response;
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=111&title=${encodeURIComponent(
          '后会友期',
        )}&year=2026&episode=2`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [{ text: '第二期弹幕', time: 21.3, color: '#FFFFFF', mode: 0 }],
      platforms: [
        {
          platform: 'logvar_episode',
          episodeId: '12715',
          title: '后会友期(2026)【综艺】from 360',
          episodeTitle: '【imgo】 第2期：朋友再见！尴尬',
          count: 1,
        },
      ],
      total: 1,
    });
    // 错配的第1期未被消费
    const commentUrls = fetchMock.mock.calls
      .map(([calledUrl]) => String(calledUrl))
      .filter((url) => url.includes('/api/v2/comment/'));
    expect(commentUrls).toHaveLength(1);
    expect(commentUrls[0]).toContain('12715');
  });

  it('豆瓣与 caiji 均无结果时返回空数据与提示', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockFetchDoubanWithVerification.mockResolvedValue({
      ok: true,
      url: 'https://movie.douban.com/subject/111/',
      text: async () => '<html></html>',
    });
    fetchMock.mockImplementation(async () => ({ ok: false }) as Response);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/danmu-external?douban_id=111&title=${encodeURIComponent(
          '不存在的剧',
        )}`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      danmu: [],
      platforms: [],
      total: 0,
      message: '未找到"不存在的剧"的视频平台链接，无法获取弹幕数据',
    });
  });

  it('缺少 douban_id 与 title 时返回 400', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/danmu-external'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing required parameters: douban_id or title',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('编排异常时返回 500 错误结构', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { NextResponse } = await import('next/server');
    const originalJson = NextResponse.json;
    let firstCall = true;
    NextResponse.json = ((...args: Parameters<typeof originalJson>) => {
      if (firstCall) {
        firstCall = false;
        throw new Error('序列化失败');
      }
      return originalJson(...args);
    }) as typeof originalJson;

    try {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v2/comment?url=')) {
          return jsonResponse({
            success: true,
            comments: [{ p: '1,1,16777215,16777215', m: '弹幕' }],
          });
        }
        return { ok: false } as Response;
      });

      const response = await GET(
        new NextRequest(
          'http://localhost/api/danmu-external?video_url=https://v.qq.com/x/cover/boom.html&title=' +
            encodeURIComponent('测试剧'),
        ),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: '获取外部弹幕失败',
        danmu: [],
      });
      expect(consoleError).toHaveBeenCalledWith(
        '外部弹幕获取失败:',
        expect.any(Error),
      );
    } finally {
      NextResponse.json = originalJson;
    }
  });
});
