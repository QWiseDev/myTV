/** @jest-environment node */
export {};

let parseDoubanCommentsPage: typeof import('./douban-comments-parser').parseDoubanCommentsPage;

beforeAll(async () => {
  // Jest 27 的 node 环境未注入当前 Node 的 Web Streams 全局。
  Object.assign(global, jest.requireActual('stream/web'), {
    File: jest.requireActual('buffer').File,
    Blob: jest.requireActual('buffer').Blob,
    MessagePort: jest.requireActual('worker_threads').MessagePort,
    DOMException: jest.requireActual(
      'next/dist/compiled/@edge-runtime/primitives',
    ).DOMException,
  });
  ({ parseDoubanCommentsPage } = await import('./douban-comments-parser'));
});

describe('parseDoubanCommentsPage', () => {
  it('解析实体、嵌套内容、任意属性顺序及真实下一页游标', () => {
    const result = parseDoubanCommentsPage(`
      <div data-cid="123" class="comment-item">
        <div class="avatar"><a title="作者"><img src="http://img.example/a.jpg"></a></div>
        <span class="comment-info"><a href="https://www.douban.com/people/alice/">A &amp; B</a>
          <span class="rating allstar40"></span><span title="2026-09-12" class="comment-time"></span>
        </span>
        <span class="short">第一行 &amp; <b>第二行</b><br>第三行</span>
        <span class="vote-count votes">12</span>
      </div>
      <div id="paginator"><span class="next"><a href="?start=20&amp;limit=20">后页</a></span></div>`);
    expect(result.comments[0]).toMatchObject({
      id: '123',
      username: 'A & B',
      rating: 4,
      useful_count: 12,
      content: '第一行 & 第二行\n第三行',
      avatar: 'https://img.example/a.jpg',
    });
    expect(result).toMatchObject({ hasMore: true, nextStart: 20 });
  });

  it('末页和空页面不虚构后续分页', () => {
    expect(parseDoubanCommentsPage('<div></div>')).toEqual({
      comments: [],
      hasMore: false,
      nextStart: null,
    });
  });
});
