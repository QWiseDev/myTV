import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { ClientCache } from '@/lib/client-cache';
import {
  readDanmakuFilters,
  readDanmakuSelection,
  saveDanmakuSelection,
} from '@/lib/danmaku';

import DanmakuPanel from './DanmakuPanel';

beforeEach(() => {
  localStorage.clear();
  ClientCache.clearMemory();
});

function ok(json: unknown) {
  return { ok: true, json: async () => json } as Response;
}

const flushAsync = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** 按路由返回响应：命中规则的请求返回对应 JSON，其余（/api/cache）返回空数据 */
function routeFetch(
  routes: Array<{ match: RegExp; json: unknown }>,
): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const href = String(url);
    const hit = routes.find((route) => route.match.test(href));
    return ok(hit ? hit.json : { data: null });
  }) as unknown as typeof fetch;
  return calls;
}

it('搜索、选集后使用手动选择，并可恢复自动匹配', async () => {
  const onToggle = jest.fn();
  routeFetch([
    {
      match: /action=search/,
      json: { animes: [{ id: '1', title: '测试影片', episodeCount: 2 }] },
    },
    {
      match: /action=episodes/,
      json: { episodes: [{ id: '2', title: '第二集' }] },
    },
  ]);
  render(
    <DanmakuPanel
      mediaKey='movie'
      title='测试影片'
      episodeIndex={1}
      enabled
      onToggle={onToggle}
    />,
  );
  fireEvent.click(screen.getByText('弹幕管理'));
  fireEvent.click(screen.getByRole('button', { name: '搜索弹幕' }));
  fireEvent.click(
    await screen.findByRole('button', { name: '测试影片 · 2 集' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '第二集' }));
  expect(readDanmakuSelection('movie', 1)?.episodeId).toBe('2');
  expect(onToggle).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: '恢复自动匹配' }));
  await flushAsync();
  expect(readDanmakuSelection('movie', 1)).toBeNull();
});

it('手动选择同步到服务端共享，恢复自动匹配时清除', async () => {
  const onToggle = jest.fn();
  const calls = routeFetch([
    {
      match: /action=search/,
      json: { animes: [{ id: '1', title: '测试影片', episodeCount: 2 }] },
    },
    {
      match: /action=episodes/,
      json: { episodes: [{ id: '2', title: '第二集' }] },
    },
  ]);
  render(
    <DanmakuPanel
      mediaKey='movie'
      title='测试影片'
      episodeIndex={1}
      enabled
      onToggle={onToggle}
    />,
  );
  fireEvent.click(screen.getByText('弹幕管理'));
  fireEvent.click(screen.getByRole('button', { name: '搜索弹幕' }));
  fireEvent.click(
    await screen.findByRole('button', { name: '测试影片 · 2 集' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '第二集' }));

  await waitFor(() => {
    const syncWrite = calls.find(
      (call) => call.init?.method === 'POST' && call.url.includes('/api/cache'),
    );
    expect(syncWrite).toBeDefined();
    const body = JSON.parse(String(syncWrite?.init?.body));
    expect(body.key).toContain('danmaku-shared-sel');
    expect(body.data).toEqual({ episodeId: '2', title: '测试影片 · 第二集' });
  });

  fireEvent.click(screen.getByRole('button', { name: '恢复自动匹配' }));
  await waitFor(() => {
    const syncDelete = calls.find(
      (call) =>
        call.init?.method === 'DELETE' && call.url.includes('/api/cache'),
    );
    expect(syncDelete).toBeDefined();
    expect(syncDelete?.url).toContain('danmaku-shared-sel');
  });
  await flushAsync();
});

it('本地没有选择时展示其他用户的共享选择', async () => {
  routeFetch([
    {
      match: /danmaku-shared-sel/,
      json: { data: { episodeId: 'ep-2', title: '测试影片 · 第二集' } },
    },
  ]);
  render(
    <DanmakuPanel
      mediaKey='movie'
      title='测试影片'
      episodeIndex={1}
      enabled
      onToggle={jest.fn()}
    />,
  );
  fireEvent.click(screen.getByText('弹幕管理'));
  await screen.findByText('共享 · 测试影片 · 第二集');
});

it('保存屏蔽规则但不强制开启原本关闭的弹幕', async () => {
  const onToggle = jest.fn();
  routeFetch([]);
  render(
    <DanmakuPanel
      mediaKey='movie'
      title='影片'
      episodeIndex={0}
      enabled={false}
      onToggle={onToggle}
    />,
  );
  fireEvent.click(screen.getByText('弹幕管理'));
  fireEvent.change(screen.getByLabelText('屏蔽词'), {
    target: { value: '广告\n剧透' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存屏蔽词' }));
  fireEvent.click(screen.getByLabelText('屏蔽顶部'));
  await waitFor(() =>
    expect(readDanmakuFilters()).toMatchObject({
      keywords: ['广告', '剧透'],
      blockTop: true,
    }),
  );
  await flushAsync();
  expect(onToggle).not.toHaveBeenCalled();
});

it('游客模式下不请求或写入服务端共享选集，且无选择时禁用恢复自动匹配', async () => {
  const onToggle = jest.fn();
  const calls = routeFetch([
    {
      match: /action=search/,
      json: { animes: [{ id: '1', title: '测试影片', episodeCount: 1 }] },
    },
    {
      match: /action=episodes/,
      json: { episodes: [{ id: '2', title: '第一集' }] },
    },
  ]);

  render(
    <DanmakuPanel
      mediaKey='guest-movie'
      title='测试影片'
      episodeIndex={0}
      enabled={false}
      onToggle={onToggle}
      canUseSharedCache={false}
    />,
  );

  fireEvent.click(screen.getByText('弹幕管理'));
  await flushAsync();

  const resetBtn = screen.getByRole('button', { name: '恢复自动匹配' });
  expect(resetBtn).toBeDisabled();
  expect(calls.some((call) => call.url.includes('/api/cache'))).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: '搜索弹幕' }));
  fireEvent.click(
    await screen.findByRole('button', { name: '测试影片 · 1 集' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '第一集' }));
  expect(resetBtn).not.toBeDisabled();
  expect(onToggle).toHaveBeenLastCalledWith(true);

  fireEvent.click(resetBtn);
  await flushAsync();
  expect(readDanmakuSelection('guest-movie', 0)).toBeNull();
  expect(calls.some((call) => call.url.includes('/api/cache'))).toBe(false);
});

it('弹幕关闭状态下恢复自动匹配只清除绑定，不强制开启弹幕', async () => {
  const onToggle = jest.fn();
  saveDanmakuSelection('disabled-movie', 0, {
    episodeId: '99',
    title: '手动选择集',
  });
  routeFetch([]);

  render(
    <DanmakuPanel
      mediaKey='disabled-movie'
      title='测试影片'
      episodeIndex={0}
      enabled={false}
      onToggle={onToggle}
      canUseSharedCache={false}
    />,
  );

  fireEvent.click(screen.getByText('弹幕管理'));
  fireEvent.click(screen.getByRole('button', { name: '恢复自动匹配' }));
  await flushAsync();

  expect(readDanmakuSelection('disabled-movie', 0)).toBeNull();
  expect(onToggle).not.toHaveBeenCalled();
});
