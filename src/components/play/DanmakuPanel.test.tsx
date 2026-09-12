import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { readDanmakuFilters, readDanmakuSelection } from '@/lib/danmaku';

import DanmakuPanel from './DanmakuPanel';

beforeEach(() => localStorage.clear());

it('搜索、选集后使用手动选择，并可恢复自动匹配', async () => {
  const onToggle = jest.fn();
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        animes: [{ id: '1', title: '测试影片', episodeCount: 2 }],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ episodes: [{ id: '2', title: '第二集' }] }),
    });
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
  expect(readDanmakuSelection('movie', 1)).toBeNull();
});

it('保存屏蔽规则但不强制开启原本关闭的弹幕', async () => {
  const onToggle = jest.fn();
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
  expect(onToggle).not.toHaveBeenCalled();
});
