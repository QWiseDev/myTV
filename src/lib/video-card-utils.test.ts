import { buildPlayUrl, shouldUseUnoptimizedImage } from './video-card-utils';

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
