import {
  checkAIRecommendAvailable,
  formatAIResponseWithLinks,
} from './ai-recommend.client';

describe('formatAIResponseWithLinks', () => {
  it('escapes raw html before adding display markup', () => {
    const result = formatAIResponseWithLinks(
      '# 推荐\n《测试片》 <img src=x onerror=alert(1)>',
    );

    expect(result).toContain('<h1');
    expect(result).toContain('《测试片》');
    expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result).not.toContain('<img src=x');
  });

  it('escapes html embedded in highlighted titles', () => {
    const result = formatAIResponseWithLinks(
      '《测试<img src=x onerror=alert(1)>》',
    );

    expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result).not.toContain('<img src=x');
  });
});

describe('checkAIRecommendAvailable', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('treats unauthorized status as unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(checkAIRecommendAvailable()).resolves.toBe(false);
  });
});
