import { buildPlayUrl } from './video-card-utils';

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
      })
    ).toBe(
      '/play?source=iqiyizyapi.com&id=79487&title=%E5%8D%97%E9%83%A8%E6%A1%A3%E6%A1%88&year=2026&stitle=%E5%8D%97%E9%83%A8%E6%A1%A3%E6%A1%88&stype=tv'
    );
  });
});
