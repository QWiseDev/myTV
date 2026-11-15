'use client';

import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { TMDBHeroInfo } from '@/lib/tmdb.client';
import type { DoubanItem } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

/** 继续追首帧所需的最小信息（由 HomeTabContent 从播放记录派生） */
export interface HeroContinueItem {
  key: string;
  title: string;
  poster: string;
  year?: string;
  /** 如「看到第 3 集」 */
  episodeLabel?: string;
  href: string;
}

interface HeroSlide {
  key: string;
  kind: 'continue' | 'douban';
  title: string;
  poster: string;
  rate?: string;
  year?: string;
  episodeLabel?: string;
  href: string;
}

const AUTO_ADVANCE_INTERVAL_MS = 5000;

interface HeroCarouselProps {
  /** 继续追记录（最近一条），有则作为第一帧 */
  continueItem?: HeroContinueItem | null;
  /** 热门电影，取前 5 张参与轮播 */
  movies: DoubanItem[];
  loading?: boolean;
}

function buildSlides(
  continueItem: HeroContinueItem | null | undefined,
  movies: DoubanItem[],
): HeroSlide[] {
  const slides: HeroSlide[] = [];

  if (continueItem?.title && continueItem.poster) {
    slides.push({
      key: `continue:${continueItem.key}`,
      kind: 'continue',
      title: continueItem.title,
      poster: continueItem.poster,
      year: continueItem.year,
      episodeLabel: continueItem.episodeLabel,
      href: continueItem.href,
    });
  }

  for (const movie of movies) {
    if (!movie.title || !movie.poster) continue;
    slides.push({
      key: `douban:${movie.id}`,
      kind: 'douban',
      title: movie.title,
      poster: movie.poster,
      rate: movie.rate || undefined,
      year: movie.year || undefined,
      href: `/play?title=${encodeURIComponent(movie.title)}${
        movie.year ? `&year=${movie.year}` : ''
      }${movie.id ? `&douban_id=${movie.id}` : ''}&stype=movie`,
    });
    if (slides.length >= 6) break;
  }

  return slides;
}

/**
 * 首页爱奇艺式首屏大轮播：模糊海报垫底 + 左文案右海报卡。
 * 移动端隐藏右侧海报卡，保留单屏轮播与指示条。
 */
export default function HeroCarousel({
  continueItem,
  movies,
  loading = false,
}: HeroCarouselProps) {
  const slides = useMemo(
    () => buildSlides(continueItem, movies),
    [continueItem, movies],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [infoByTitle, setInfoByTitle] = useState<Record<string, TMDBHeroInfo>>(
    {},
  );

  // slides 数量变化（数据异步到达）时收拢索引，避免停留在越界帧
  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, AUTO_ADVANCE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  // 异步拉取 TMDB 横图（按标题批量查询），未配置 TMDB 时静默保持海报模糊垫底
  const backdropQuery = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; title: string; year?: string }[] = [];
    for (const slide of slides) {
      const title = slide.title.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      list.push({ key: slide.key, title, year: slide.year });
    }
    return list;
  }, [slides]);

  useEffect(() => {
    // 无 fetch 的环境（jsdom 测试等）直接跳过，保持海报模糊垫底
    if (typeof fetch === 'undefined') return;
    if (backdropQuery.length === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    backdropQuery.forEach(({ title, year }) => {
      params.append('title', title);
      if (year) params.append('year', year);
    });

    // v2：接口响应结构升级后强制绕过浏览器旧缓存
    fetch(`/api/tmdb/hero?v=2&${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { info?: Record<string, TMDBHeroInfo | null> } | null) => {
        if (!data?.info) return;
        const next: Record<string, TMDBHeroInfo> = {};
        for (const { title } of backdropQuery) {
          const info = data.info[title];
          if (info?.backdrop) next[title] = info;
        }
        setInfoByTitle(next);
      })
      .catch(() => {
        // TMDB 未启用/网络失败：保持模糊海报降级
      });
    return () => controller.abort();
  }, [backdropQuery]);

  if (slides.length === 0) {
    if (!loading) return null;
    return (
      <div
        className='mb-6 h-[220px] w-full animate-pulse rounded-xl bg-[#e8e8e8] dark:bg-[#2a2a2a]'
        aria-label='推荐加载中'
      />
    );
  }

  const active = slides[activeIndex];

  return (
    <section
      aria-label='推荐'
      className='group relative mb-6'
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className='relative h-[220px] overflow-hidden rounded-xl sm:h-[300px] lg:h-[360px]'>
        {slides.map((slide, index) => {
          const info = infoByTitle[slide.title];
          return (
            <div
              key={slide.key}
              aria-hidden={index !== activeIndex}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                index === activeIndex
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0'
              }`}
            >
              {/* 背景层：海报模糊放大垫底，TMDB 横图就绪后叠加清晰横图 */}
              <Image
                src={processImageUrl(slide.poster)}
                alt=''
                fill
                priority={index === 0}
                sizes='100vw'
                className='scale-110 object-cover blur-2xl brightness-[0.55]'
                aria-hidden
              />
              {info?.backdrop && (
                <Image
                  src={info.backdrop}
                  alt=''
                  fill
                  sizes='100vw'
                  className='animate-fade-in object-cover brightness-[0.8]'
                  aria-hidden
                />
              )}
              {/* 文案可读性遮罩 */}
              <div
                className='pointer-events-none absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent'
                aria-hidden
              />
              {/* 前景：左侧文案 + 右侧海报卡 */}
              <div className='relative flex h-full items-end justify-between gap-6 px-5 pb-12 sm:items-center sm:px-8 sm:pb-6 lg:px-10'>
                <div className='max-w-[68%] text-white sm:max-w-[60%]'>
                  <div className='mb-2 flex items-center gap-2'>
                    {slide.rate && (
                      <span className='inline-flex items-center rounded bg-[#00be06] px-1.5 py-0.5 text-xs font-bold text-white'>
                        {slide.rate}分
                      </span>
                    )}
                    <span className='rounded border border-white/40 px-1.5 py-0.5 text-xs text-white/90'>
                      {slide.kind === 'continue' ? '继续观看' : '电影'}
                    </span>
                  </div>
                  <h2 className='line-clamp-2 text-xl font-bold sm:text-2xl lg:text-3xl'>
                    {slide.title}
                  </h2>
                  <p className='mt-2 line-clamp-1 text-xs text-white/70 sm:text-sm'>
                    {slide.kind === 'continue'
                      ? slide.episodeLabel || '从上次的地方继续'
                      : [
                          slide.year,
                          info?.genres?.length
                            ? info.genres.slice(0, 2).join(' / ')
                            : '电影',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </p>
                  {info?.overview && (
                    <p className='mt-2 hidden line-clamp-2 text-xs leading-relaxed text-white/75 sm:block sm:text-sm'>
                      {info.overview}
                    </p>
                  )}
                  {((info?.cast?.length ?? 0) > 0 || info?.director) && (
                    <p className='mt-2 hidden line-clamp-1 text-xs text-white/60 lg:block'>
                      {[
                        info?.director ? `导演：${info.director}` : '',
                        info?.cast?.length
                          ? `主演：${info.cast.slice(0, 3).join(' / ')}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join('　')}
                    </p>
                  )}
                  <Link
                    href={slide.href}
                    className='mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#00be06] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a304] sm:mt-4 sm:px-5'
                  >
                    <Play size={16} className='fill-current' />
                    {slide.kind === 'continue' ? '继续播放' : '立即播放'}
                  </Link>
                </div>
                <div className='relative hidden aspect-[2/3] w-[150px] shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/20 sm:block lg:w-[180px]'>
                  <Image
                    src={processImageUrl(slide.poster)}
                    alt={slide.title}
                    fill
                    sizes='180px'
                    className='object-cover'
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* 左右切换箭头（桌面端 hover 显示） */}
        {slides.length > 1 && (
          <>
            <button
              type='button'
              aria-label='上一张'
              onClick={() =>
                setActiveIndex(
                  (current) => (current - 1 + slides.length) % slides.length,
                )
              }
              className='absolute left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition-opacity duration-300 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 sm:flex'
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type='button'
              aria-label='下一张'
              onClick={() =>
                setActiveIndex((current) => (current + 1) % slides.length)
              }
              className='absolute right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition-opacity duration-300 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 sm:flex'
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* 底部指示条（爱奇艺式右下角条状指示） */}
        {slides.length > 1 && (
          <div className='absolute bottom-3 right-4 z-10 flex items-center gap-1.5'>
            {slides.map((slide, index) => (
              <button
                key={slide.key}
                type='button'
                aria-label={`切换到 ${slide.title}`}
                aria-current={index === activeIndex}
                onClick={() => setActiveIndex(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === activeIndex
                    ? 'w-6 bg-[#00be06]'
                    : 'w-1.5 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      {/* 供无障碍读取当前帧标题 */}
      <span className='sr-only'>{active?.title}</span>
    </section>
  );
}
