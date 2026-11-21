import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (
    props: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
      fill?: boolean;
      priority?: boolean;
      src: string | { src: string };
    },
  ) => {
    const { src, ...imageProps } = props;
    delete imageProps.fill;
    delete imageProps.priority;

    return React.createElement('img', {
      ...imageProps,
      src: typeof src === 'string' ? src : src.src,
    });
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

import type { DoubanItem } from '@/lib/types';

import HeroCarousel from './HeroCarousel';

// jsdom 无 fetch：模拟 TMDB 接口不可用，验证降级路径
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve(null),
    } as unknown as Response),
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

const MOVIES: DoubanItem[] = [
  {
    id: '1',
    title: '热门电影一',
    poster: 'https://img/poster1.jpg',
    rate: '8.5',
    year: '2026',
  },
  {
    id: '2',
    title: '热门电影二',
    poster: 'https://img/poster2.jpg',
    rate: '7.2',
    year: '2025',
  },
  {
    id: '3',
    title: '热门电影三',
    poster: 'https://img/poster3.jpg',
    rate: '6.1',
    year: '2024',
  },
];

describe('HeroCarousel', () => {
  it('renders up to 4 continue items as the leading slides with movies filling the rest', () => {
    render(
      <HeroCarousel
        continueItems={[
          {
            key: 'src1+id1',
            title: '追更剧一',
            poster: 'https://img/cover1.jpg',
            episodeLabel: '看到第 3 集 / 共 20 集',
            href: '/play?source=src1&id=id1&title=x',
          },
          {
            key: 'src2+id2',
            title: '追更剧二',
            poster: 'https://img/cover2.jpg',
            episodeLabel: '看到第 5 集 / 共 12 集',
            href: '/play?source=src2&id=id2&title=y',
          },
          {
            key: 'src3+id3',
            title: '追更剧三',
            poster: 'https://img/cover3.jpg',
            href: '/play?source=src3&id=id3&title=z',
          },
          {
            key: 'src4+id4',
            title: '追更剧四',
            poster: 'https://img/cover4.jpg',
            episodeLabel: '看到第 2 集 / 共 8 集',
            href: '/play?source=src4&id=id4&title=w',
          },
        ]}
        movies={MOVIES}
      />,
    );

    expect(
      screen.getByRole('heading', { name: '追更剧一' }),
    ).toBeInTheDocument();
    expect(screen.getByText('看到第 3 集 / 共 20 集')).toBeInTheDocument();
    expect(screen.getByText('看到第 2 集 / 共 8 集')).toBeInTheDocument();
    // 4 条继续追帧各带一个「继续播放」按钮
    expect(screen.getAllByText('继续播放')).toHaveLength(4);
    // 帧序：4 条继续追在前，热门电影补足剩余帧位（4 + 3 = 7 帧）
    expect(screen.getAllByRole('button', { name: /切换到/ })).toHaveLength(7);
    // 非当前帧带 aria-hidden，切到电影三帧后标题才可查
    fireEvent.click(screen.getByRole('button', { name: '切换到 热门电影三' }));
    expect(
      screen.getByRole('heading', { name: '热门电影三' }),
    ).toBeInTheDocument();
  });

  it('skips slides with duplicate titles (movies colliding with continue items)', () => {
    render(
      <HeroCarousel
        continueItems={[
          {
            key: 'src1+id1',
            title: '追更剧一',
            poster: 'https://img/cover1.jpg',
            episodeLabel: '看到第 3 集 / 共 20 集',
            href: '/play?source=src1&id=id1&title=x',
          },
        ]}
        movies={[
          {
            id: 'dup',
            title: '追更剧一',
            poster: 'https://img/dup.jpg',
            rate: '9.0',
            year: '2026',
          },
          ...MOVIES,
        ]}
      />,
    );

    // 重名电影被跳过：1 继续追 + 3 电影 = 4 帧
    expect(screen.getAllByRole('button', { name: /切换到/ })).toHaveLength(4);
    expect(screen.getAllByText('继续播放')).toHaveLength(1);
    expect(screen.queryByText('9.0分')).not.toBeInTheDocument();
  });

  it('renders movies as leading slides when fewer continue items exist', () => {
    render(
      <HeroCarousel
        continueItems={[
          {
            key: 'src1+id1',
            title: '追更剧',
            poster: 'https://img/cover.jpg',
            episodeLabel: '看到第 3 集 / 共 20 集',
            href: '/play?source=src1&id=id1&title=x',
          },
        ]}
        movies={MOVIES}
      />,
    );

    expect(screen.getByRole('heading', { name: '追更剧' })).toBeInTheDocument();
    expect(screen.getByText('看到第 3 集 / 共 20 集')).toBeInTheDocument();
    expect(screen.getByText('继续播放')).toBeInTheDocument();
    // 指示条数量 = 继续追 + 电影
    expect(screen.getAllByRole('button', { name: /切换到/ })).toHaveLength(4);
  });

  it('renders only movie slides without continue item and links to play page', () => {
    render(<HeroCarousel movies={MOVIES} />);

    expect(
      screen.getByRole('heading', { name: '热门电影一' }),
    ).toBeInTheDocument();
    const playLink = screen.getByRole('link', { name: /立即播放/ });
    expect(playLink).toHaveAttribute(
      'href',
      '/play?title=%E7%83%AD%E9%97%A8%E7%94%B5%E5%BD%B1%E4%B8%80&year=2026&douban_id=1&stype=movie',
    );
  });

  it('renders TMDB enriched info (overview/genres/cast/director) when API responds', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            info: {
              热门电影一: {
                backdrop: 'https://image.tmdb.org/t/p/w1280/abc.jpg',
                overview: '这是一段剧情简介。',
                genres: ['科幻', '冒险', '动作'],
                cast: ['演员甲', '演员乙', '演员丙', '演员丁'],
                director: '导演甲',
              },
              热门电影二: null,
            },
          }),
      }),
    );

    render(<HeroCarousel movies={MOVIES} />);

    // 副标题带本地化类型
    expect(await screen.findByText('2026 · 科幻 / 冒险')).toBeInTheDocument();
    expect(screen.getByText('这是一段剧情简介。')).toBeInTheDocument();
    expect(screen.getByText(/导演：导演甲/)).toBeInTheDocument();
    expect(
      screen.getByText(/主演：演员甲 \/ 演员乙 \/ 演员丙/),
    ).toBeInTheDocument();
    // 无信息帧降级为"电影"占位类型
    expect(screen.getByText('2025 · 电影')).toBeInTheDocument();
  });

  it('shows skeleton while loading without data and nothing when idle-empty', () => {
    const { container, rerender } = render(
      <HeroCarousel movies={[]} loading />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();

    rerender(<HeroCarousel movies={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('switches slide via indicator and arrows', () => {
    const { container } = render(<HeroCarousel movies={MOVIES} />);

    fireEvent.click(screen.getByRole('button', { name: '切换到 热门电影三' }));
    expect(
      screen.getByRole('heading', { name: '热门电影三' }),
    ).toBeInTheDocument();

    const nextButton = container.querySelector('[aria-label="下一张"]');
    expect(nextButton).not.toBeNull();
    if (nextButton) {
      fireEvent.click(nextButton);
    }
    // 循环回到第一帧
    expect(
      screen.getByRole('heading', { name: '热门电影一' }),
    ).toBeInTheDocument();
  });
});
