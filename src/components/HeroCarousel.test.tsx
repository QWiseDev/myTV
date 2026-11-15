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
  { id: '1', title: '热门电影一', poster: 'https://img/poster1.jpg', rate: '8.5', year: '2026' },
  { id: '2', title: '热门电影二', poster: 'https://img/poster2.jpg', rate: '7.2', year: '2025' },
  { id: '3', title: '热门电影三', poster: 'https://img/poster3.jpg', rate: '6.1', year: '2024' },
];

describe('HeroCarousel', () => {
  it('renders continue item as the first slide', () => {
    render(
      <HeroCarousel
        continueItem={{
          key: 'src1+id1',
          title: '追更剧',
          poster: 'https://img/cover.jpg',
          episodeLabel: '看到第 3 集 / 共 20 集',
          href: '/play?source=src1&id=id1&title=x',
        }}
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
    expect(screen.getByText(/主演：演员甲 \/ 演员乙 \/ 演员丙/)).toBeInTheDocument();
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
