import { buildFavoriteItems, type FavoriteRecord } from './favorite-items';
import type { PlayRecord } from './types';

function createFavorite(
  overrides: Partial<FavoriteRecord> = {},
): FavoriteRecord {
  return {
    title: '收藏影片',
    source_name: '测试源',
    year: '2026',
    cover: '/poster.jpg',
    total_episodes: 12,
    save_time: 100,
    search_title: '收藏影片',
    ...overrides,
  };
}

function createPlayRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    title: '播放记录',
    source_name: '测试源',
    cover: '/poster.jpg',
    year: '2026',
    index: 3,
    total_episodes: 12,
    play_time: 20,
    total_time: 100,
    save_time: 100,
    search_title: '播放记录',
    ...overrides,
  };
}

describe('buildFavoriteItems', () => {
  it('sorts favorites by save time and merges current episode from play records', () => {
    const items = buildFavoriteItems(
      {
        'source+old': createFavorite({
          save_time: 100,
          title: '旧收藏',
        }),
        'source+new': createFavorite({
          origin: 'vod',
          save_time: 200,
          title: '新收藏',
        }),
      },
      {
        'source+new': createPlayRecord({
          index: 8,
        }),
      },
    );

    expect(items).toEqual([
      expect.objectContaining({
        currentEpisode: 8,
        id: 'new',
        origin: 'vod',
        source: 'source',
        title: '新收藏',
      }),
      expect.objectContaining({
        currentEpisode: undefined,
        id: 'old',
        source: 'source',
        title: '旧收藏',
      }),
    ]);
  });

  it('skips invalid keys and keeps plus signs in ids', () => {
    const items = buildFavoriteItems({
      invalid: createFavorite({
        save_time: 300,
        title: '非法收藏',
      }),
      'source+id+with-plus': createFavorite({
        save_time: 200,
        title: '合法收藏',
      }),
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'id+with-plus',
        source: 'source',
        title: '合法收藏',
      }),
    ]);
  });
});
