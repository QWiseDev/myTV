import {
  buildPlayUrl,
  buildVideoCardSubjectUrl,
  getVideoCardEntryPoster,
  getVideoCardSearchType,
  shouldCheckSearchFavoriteStatus,
  shouldUseUnoptimizedImage,
} from './video-card-utils';

describe('buildPlayUrl', () => {
  it('keeps metadata in play record links for danmu lookup', () => {
    expect(
      buildPlayUrl({
        from: 'playrecord',
        source: 'iqiyizyapi.com',
        id: '79487',
        title: '南部档案',
        year: '2026',
        doubanId: 35465012,
        searchType: 'tv',
      }),
    ).toBe(
      '/play?source=iqiyizyapi.com&id=79487&title=%E5%8D%97%E9%83%A8%E6%A1%A3%E6%A1%88&year=2026&douban_id=35465012&stype=tv',
    );
  });

  it('falls back to query when a play record title is empty', () => {
    expect(
      buildPlayUrl({
        from: 'playrecord',
        source: 'iqiyizyapi.com',
        id: '79487',
        title: '',
        query: '南部档案',
        year: '2026',
        searchType: 'tv',
      }),
    ).toBe(
      '/play?source=iqiyizyapi.com&id=79487&title=%E5%8D%97%E9%83%A8%E6%A1%A3%E6%A1%88&year=2026&stitle=%E5%8D%97%E9%83%A8%E6%A1%A3%E6%A1%88&stype=tv',
    );
  });

  it('keeps poster metadata when opening a douban card', () => {
    const poster =
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg';

    expect(
      buildPlayUrl({
        from: 'douban',
        title: '南部档案',
        year: '2026',
        doubanId: 35465012,
        searchType: 'tv',
        poster,
      }),
    ).toBe(
      `/play?title=%E5%8D%97%E9%83%A8%E6%A1%A3%E6%A1%88&year=2026&douban_id=35465012&poster=${encodeURIComponent(
        poster,
      )}&stype=tv`,
    );
  });
});

describe('shouldUseUnoptimizedImage', () => {
  it('disables Next image optimization for external and proxy images', () => {
    expect(shouldUseUnoptimizedImage('http://example.com/poster.jpg')).toBe(
      true,
    );
    expect(shouldUseUnoptimizedImage('https://example.com/poster.jpg')).toBe(
      true,
    );
    expect(shouldUseUnoptimizedImage('/api/image-proxy?url=poster')).toBe(true);
  });

  it('keeps optimization for local image paths', () => {
    expect(shouldUseUnoptimizedImage('/poster.jpg')).toBe(false);
    expect(shouldUseUnoptimizedImage('poster.jpg')).toBe(false);
  });
});

describe('shouldCheckSearchFavoriteStatus', () => {
  it('checks only unresolved non-aggregate search cards with source and id', () => {
    expect(
      shouldCheckSearchFavoriteStatus({
        from: 'search',
        isAggregate: false,
        source: 'source-a',
        id: 'video-a',
        searchFavorited: null,
      }),
    ).toBe(true);
  });

  it('skips aggregate, resolved, and incomplete cards', () => {
    expect(
      shouldCheckSearchFavoriteStatus({
        from: 'search',
        isAggregate: true,
        source: 'source-a',
        id: 'video-a',
        searchFavorited: null,
      }),
    ).toBe(false);
    expect(
      shouldCheckSearchFavoriteStatus({
        from: 'search',
        isAggregate: false,
        source: 'source-a',
        id: 'video-a',
        searchFavorited: false,
      }),
    ).toBe(false);
    expect(
      shouldCheckSearchFavoriteStatus({
        from: 'douban',
        isAggregate: false,
        source: 'source-a',
        id: 'video-a',
        searchFavorited: null,
      }),
    ).toBe(false);
    expect(
      shouldCheckSearchFavoriteStatus({
        from: 'search',
        isAggregate: false,
        source: '',
        id: 'video-a',
        searchFavorited: null,
      }),
    ).toBe(false);
  });
});

describe('getVideoCardSearchType', () => {
  it('keeps explicit type for non-aggregate cards', () => {
    expect(
      getVideoCardSearchType({
        isAggregate: false,
        episodes: 1,
        type: 'show',
      }),
    ).toBe('show');
  });

  it('infers aggregate movie cards from a single episode', () => {
    expect(
      getVideoCardSearchType({
        isAggregate: true,
        episodes: 1,
        type: 'show',
      }),
    ).toBe('movie');
  });

  it('infers aggregate tv cards when episodes are missing or more than one', () => {
    expect(
      getVideoCardSearchType({
        isAggregate: true,
        type: 'movie',
      }),
    ).toBe('tv');
    expect(
      getVideoCardSearchType({
        isAggregate: true,
        episodes: 12,
        type: 'movie',
      }),
    ).toBe('tv');
  });
});

describe('getVideoCardEntryPoster', () => {
  it('keeps poster metadata only for douban and search entries', () => {
    expect(getVideoCardEntryPoster('douban', 'poster-a')).toBe('poster-a');
    expect(getVideoCardEntryPoster('search', 'poster-a')).toBe('poster-a');
    expect(getVideoCardEntryPoster('playrecord', 'poster-a')).toBeUndefined();
    expect(getVideoCardEntryPoster('favorite', 'poster-a')).toBeUndefined();
  });
});

describe('buildVideoCardSubjectUrl', () => {
  it('builds Bangumi and Douban subject URLs', () => {
    expect(buildVideoCardSubjectUrl(12345, true)).toBe(
      'https://bgm.tv/subject/12345',
    );
    expect(buildVideoCardSubjectUrl(12345, false)).toBe(
      'https://movie.douban.com/subject/12345',
    );
  });

  it('skips missing and zero ids', () => {
    expect(buildVideoCardSubjectUrl(undefined, false)).toBeUndefined();
    expect(buildVideoCardSubjectUrl(0, false)).toBeUndefined();
  });
});
