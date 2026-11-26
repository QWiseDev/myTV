import {
  type EpisodeMatchTarget,
  computeVariantOrdinal,
  extractEpisodeDate,
  extractEpisodeNumber,
  extractEpisodeSplitDirection,
  extractEpisodeVariant,
  pickBestEpisodeCandidate,
  scoreEpisodeCandidate,
} from './episode-match';

describe('episode-match（综艺集名智能匹配）', () => {
  describe('extractEpisodeDate', () => {
    test('解析 8 位日期与分隔符日期', () => {
      expect(extractEpisodeDate('第20261022期第01期')).toBe('20261022');
      expect(extractEpisodeDate('【imgo】 第1期：xxx 2026-10-22期')).toBe(
        '20261022',
      );
      expect(extractEpisodeDate('后会友期 2026年10月23日')).toBe('20261023');
      expect(extractEpisodeDate('第20261105期上')).toBe('20261105');
    });

    test('月日格式用兜底年份补齐', () => {
      expect(extractEpisodeDate('第10月22期特别篇', '2026')).toBe('20261022');
      expect(extractEpisodeDate('10月22日 直播', '2026')).toBe('20261022');
      expect(extractEpisodeDate('10月22日 直播')).toBeNull();
    });

    test('纯年份标题不是日期', () => {
      expect(extractEpisodeDate('后会友期(2026)【综艺】from 360')).toBeNull();
      expect(extractEpisodeDate('第3期：再见朋友')).toBeNull();
    });
  });

  describe('extractEpisodeVariant / hasEpisodeSplitMark', () => {
    test('版式归类', () => {
      expect(extractEpisodeVariant('第20261022期沉浸版')).toBe('沉浸版');
      expect(extractEpisodeVariant('第20261023期加更')).toBe('加更');
      expect(extractEpisodeVariant('第20261030期抢鲜版')).toBe('抢鲜');
      expect(extractEpisodeVariant('第1期 解说版')).toBe('解说');
      expect(extractEpisodeVariant('【imgo】 第1期：再见朋友')).toBe('正片');
      expect(extractEpisodeVariant('第20261029期上')).toBe('正片');
    });

    test('上/下拆分标记', () => {
      expect(extractEpisodeSplitDirection('第20261029期上')).toBe('上');
      expect(extractEpisodeSplitDirection('第20261030期沉浸版上')).toBe('上');
      expect(
        extractEpisodeSplitDirection('沉浸版上：四组旧友分房僵局 2026-10-30期'),
      ).toBe('上');
      expect(
        extractEpisodeSplitDirection('沉浸版下：厉娜许飞走心对谈 2026-10-30期'),
      ).toBe('下');
      expect(extractEpisodeSplitDirection('第20261022期第01期')).toBeNull();
    });
  });

  describe('extractEpisodeNumber', () => {
    test('常见集名写法', () => {
      expect(extractEpisodeNumber('第01期')).toBe(1);
      expect(extractEpisodeNumber('第2集')).toBe(2);
      expect(extractEpisodeNumber('第二集')).toBe(2);
      expect(extractEpisodeNumber('EP03：幕后')).toBe(3);
      expect(extractEpisodeNumber('[04] 精彩回顾')).toBe(4);
    });

    test('不会把日期误判为集数', () => {
      expect(extractEpisodeNumber('第20261022期第01期')).toBe(1);
      expect(
        extractEpisodeNumber('【imgo】 第1期：再见朋友 2026-10-22期'),
      ).toBe(1);
    });
  });

  describe('computeVariantOrdinal', () => {
    const episodes = [
      '第20261022期第01期',
      '第20261022期第02期',
      '第20261022期沉浸版',
      '第20261023期沉浸版',
      '第20261023期加更',
    ];

    test('正片用全局位置，衍生版在同版式内从 1 计数', () => {
      expect(computeVariantOrdinal(episodes, 0)).toBe(1);
      expect(computeVariantOrdinal(episodes, 1)).toBe(2);
      expect(computeVariantOrdinal(episodes, 2)).toBe(1);
      expect(computeVariantOrdinal(episodes, 3)).toBe(2);
      expect(computeVariantOrdinal(episodes, 4)).toBe(1);
    });
  });

  describe('scoreEpisodeCandidate / pickBestEpisodeCandidate', () => {
    const target = (
      overrides: Partial<EpisodeMatchTarget>,
    ): EpisodeMatchTarget => ({
      title: '后会友期',
      year: '2026',
      episodeNum: 1,
      date: null,
      variant: '正片',
      splitDirection: null,
      ...overrides,
    });

    const zhengpian = {
      animeTitle: '后会友期(2026)【综艺】from 360',
      episodeTitle: '【imgo】 第1期：再见朋友！出发前采 2026-10-22期',
    };
    const chenjin = {
      animeTitle: '后会友期 沉浸版(2026)【综艺】from 360',
      episodeTitle: '【imgo】 第1期：沉浸版',
    };

    test('衍生版目标优先命中同版式条目（即使日期与正片相同）', () => {
      const t = target({
        variant: '沉浸版',
        date: '20261022',
        episodeNum: 1,
      });
      expect(pickBestEpisodeCandidate([zhengpian, chenjin], t)).toEqual(
        chenjin,
      );
    });

    test('正片目标不会选中衍生版条目', () => {
      const t = target({ date: '20261022' });
      expect(pickBestEpisodeCandidate([zhengpian, chenjin], t)).toEqual(
        zhengpian,
      );
    });

    test('序数相同、日期不同时日期参与裁决', () => {
      const a = {
        animeTitle: '后会友期(2026)【综艺】from 360',
        episodeTitle: '第2期：A场 2026-10-22期',
      };
      const b = {
        animeTitle: '后会友期(2026)【综艺】from 360',
        episodeTitle: '第2期：B场 2026-10-23期',
      };
      const t = target({ episodeNum: 2, date: '20261023' });
      expect(pickBestEpisodeCandidate([a, b], t)).toEqual(b);
    });

    test('标题相似度过低时惩罚，防止跨内容错绑', () => {
      const t = target({ title: '后会友期', variant: '正片' });
      const unrelated = {
        animeTitle: '完全无关的节目(2025)',
        episodeTitle: '第1期',
      };
      const related = {
        animeTitle: '后会友期(2026)【综艺】from 360',
        episodeTitle: '第1期',
      };
      expect(scoreEpisodeCandidate(unrelated, t)).toBeLessThan(
        scoreEpisodeCandidate(related, t),
      );
    });

    test('同天同版式的上/下候选按方向裁决（真实数据样例）', () => {
      const t = target({
        variant: '沉浸版',
        date: '20261030',
        episodeNum: 3,
        splitDirection: '上',
      });
      const up = {
        animeTitle: '后会友期 沉浸版(2026)【综艺】from 360',
        episodeTitle: '沉浸版上：四组旧友分房僵局 2026-10-30期',
      };
      const down = {
        animeTitle: '后会友期 沉浸版(2026)【综艺】from 360',
        episodeTitle: '沉浸版下：厉娜许飞走心对谈 2026-10-30期',
      };
      expect(pickBestEpisodeCandidate([down, up], t)).toEqual(up);
    });

    test('正片第3期上/下按方向与日期裁决（真实数据样例）', () => {
      const t = target({
        variant: '正片',
        date: '20261029',
        episodeNum: 6,
        splitDirection: '上',
      });
      const first = {
        animeTitle: '后会友期(2026)【综艺】from 360',
        episodeTitle: '第1期：再见朋友！出发前采 2026-10-22期',
      };
      const q3up = {
        animeTitle: '后会友期(2026)【综艺】from 360',
        episodeTitle: '第3期上：话需讲清楚 2026-10-29期',
      };
      const q3down = {
        animeTitle: '后会友期(2026)【综艺】from 360',
        episodeTitle: '第3期下：这一刻我等了好久 2026-10-29期',
      };
      expect(pickBestEpisodeCandidate([first, q3down, q3up], t)).toEqual(q3up);
    });

    test('支持集数上下半集方向、百位中文数字及无拆分目标偏好', () => {
      expect(extractEpisodeSplitDirection('第3集(上)')).toBe('上');
      expect(extractEpisodeSplitDirection('第3集 上集')).toBe('上');
      expect(extractEpisodeSplitDirection('第3集（下）')).toBe('下');
      expect(extractEpisodeNumber('第一百零五集')).toBe(105);

      const t = target({
        variant: '正片',
        date: null,
        episodeNum: 3,
        splitDirection: null,
      });
      const splitCandidate = {
        animeTitle: '后会友期(2026)',
        episodeTitle: '第3期上',
      };
      const fullCandidate = {
        animeTitle: '后会友期(2026)',
        episodeTitle: '第3期',
      };
      expect(
        pickBestEpisodeCandidate([splitCandidate, fullCandidate], t),
      ).toEqual(fullCandidate);
    });
  });
});
