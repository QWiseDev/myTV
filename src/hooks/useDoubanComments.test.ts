import { act, renderHook, waitFor } from '@testing-library/react';

import { getDoubanComments } from '@/lib/douban.client';
import type { DoubanComment, DoubanCommentsResult } from '@/lib/types';

import { useDoubanComments } from './useDoubanComments';

jest.mock('@/lib/douban.client', () => ({ getDoubanComments: jest.fn() }));
const fetchComments = getDoubanComments as jest.Mock;
const comment = (id: string) => ({ id, content: id }) as DoubanComment;
const page = (
  ids: string[],
  nextStart: number | null,
): DoubanCommentsResult => ({
  code: 200,
  message: '',
  data: {
    comments: ids.map(comment),
    start: 0,
    limit: 20,
    count: ids.length,
    hasMore: nextStart !== null,
    nextStart,
  },
});

beforeEach(() => fetchComments.mockReset());

it('追加分页、去重并使用服务端游标', async () => {
  fetchComments
    .mockResolvedValueOnce(page(['1'], 20))
    .mockResolvedValueOnce(page(['1', '2'], null));
  const { result } = renderHook(() => useDoubanComments('123'));
  await waitFor(() => expect(result.current.comments).toHaveLength(1));
  await act(async () => {
    await result.current.loadMore();
  });
  expect(fetchComments).toHaveBeenLastCalledWith(
    expect.objectContaining({ start: 20 }),
  );
  expect(result.current.comments.map((item) => item.id)).toEqual(['1', '2']);
  expect(result.current.hasMore).toBe(false);
});

it('失败后可重试，失败不推进游标', async () => {
  fetchComments
    .mockResolvedValueOnce({ code: 500 })
    .mockResolvedValueOnce(page(['1'], null));
  const { result } = renderHook(() => useDoubanComments('123'));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  await act(async () => {
    await result.current.loadMore();
  });
  expect(result.current.error).toBeNull();
  expect(result.current.comments).toHaveLength(1);
  expect(fetchComments).toHaveBeenLastCalledWith(
    expect.objectContaining({ start: 0 }),
  );
});

it('换片不被旧请求覆盖，旧请求不会阻塞新请求', async () => {
  let resolveOld!: (result: DoubanCommentsResult) => void;
  fetchComments
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(page(['new'], null));
  const { result, rerender } = renderHook(({ id }) => useDoubanComments(id), {
    initialProps: { id: '123' },
  });
  rerender({ id: '456' });
  await waitFor(() => expect(result.current.comments[0]?.id).toBe('new'));
  await act(async () => {
    resolveOld(page(['old'], null));
  });
  expect(result.current.comments[0].id).toBe('new');
});
