'use client';

import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { analytics } from '@/lib/analytics';
import type { TMDBHeroInfo } from '@/lib/tmdb.client';
import {
  fetchTMDBHeroInfoBatch,
  peekCachedTMDBHeroInfo,
} from '@/lib/tmdb-hero.client';
import type { DoubanItem } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';
import {
  buildPlayUrl,
  shouldUseUnoptimizedImage,
} from '@/lib/video-card-utils';

/** 继续追轮播帧所需的最小信息（由 HomeTabContent 从播放记录派生） */
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
/** 轮播总帧数上限：继续追帧在前，热门电影补足剩余帧位 */
const HERO_SLIDE_TOTAL = 8;

interface HeroCarouselProps {
  /** 继续追记录（最近优先），依次作为前几帧 */
  continueItems?: HeroContinueItem[];
  /** 热门电影，补足剩余帧位（整轮最多 8 帧） */
  movies: DoubanItem[];
  loading?: boolean;
  /** 继续观看尚未返回时暂缓请求 TMDB 横图，避免继续追插队后重复请求 */
  deferEnrich?: boolean;
}

function buildSlides(
  continueItems: HeroContinueItem[] | undefined,
  movies: DoubanItem[],
): HeroSlide[] {
  const slides: HeroSlide[] = [];
  const seenTitles = new Set<string>();

  for (const item of continueItems || []) {
    if (!item.title || !item.poster) continue;
    const title = item.title.trim();
    if (!title || seenTitles.has(title)) continue;
    seenTitles.add(title);
    slides.push({
      key: `continue:${item.key}`,
      kind: 'continue',
      title: item.title,
      poster: item.poster,
      year: item.year,
      episodeLabel: item.episodeLabel,
      href: item.href,
    });
  }

  for (const movie of movies) {
    if (!movie.title || !movie.poster) continue;
    const title = movie.title.trim();
    // 与继续追帧或其他电影重名的直接跳过
    if (!title || seenTitles.has(title)) continue;
    seenTitles.add(title);
    slides.push({
      key: `douban:${movie.id}`,
      kind: 'douban',
      title: movie.title,
      poster: movie.poster,
      rate: movie.rate || undefined,
      year: movie.year || undefined,
      // 复用统一的播放链接构造，与下方热门电影卡片保持一致
      href: buildPlayUrl({
        from: 'douban',
        title: movie.title,
        year: movie.year,
        doubanId: Number(movie.id),
        searchType: 'movie',
      }),
    });
    if (slides.length >= HERO_SLIDE_TOTAL) break;
  }

  return slides;
}

/**
 * 首页爱奇艺式首屏大轮播：模糊海报垫底 + 左文案右海报卡。
 * 移动端隐藏右侧海报卡，保留单屏轮播与指示条。
 */
export default function HeroCarousel({
  continueItems,
  movies,
  loading = false,
  deferEnrich = false,
}: HeroCarouselProps) {
  const slides = useMemo(
    () => buildSlides(continueItems, movies),
    [continueItems, movies],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [infoByTitle, setInfoByTitle] = useState<Record<string, TMDBHeroInfo>>(
    {},
  );
  const fetchedTitlesRef = useRef(new Set<string>());

  // 渲染期直接收拢越界索引，避免 slides 数量缩减时出现一帧全透明空白
  const safeActiveIndex =
    slides.length > 0 && activeIndex < slides.length ? activeIndex : 0;

  // slides 数量变化（数据异步到达）时同步收拢状态索引
  useEffect(() => {
    if (activeIndex >= slides.length && slides.length > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    // 用户偏好减少动态效果时不自动轮播，仍可手动切换
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = setInterval(() => {
      // 标签页在后台时不推进，避免回来时帧已跳走并白白加载图片
      if (document.hidden) return;
      setActiveIndex((current) => (current + 1) % slides.length);
    }, AUTO_ADVANCE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  // 异步拉取 TMDB 横图（按标题批量查询），与下方 ContinueWatching 共享内存缓存，避免同名剧集重复请求。
  const backdropLookupSignature = useMemo(() => {
    const seen = new Set<string>();
    const entries: string[] = [];
    for (const slide of slides) {
      const title = slide.title.trim();
      if (!title || seen.has(title) || fetchedTitlesRef.current.has(title)) {
        continue;
      }
      seen.add(title);
      entries.push(`${title}\t${slide.year?.trim() || ''}`);
    }
    return entries.join('\n');
  }, [slides]);

  useEffect(() => {
    if (typeof fetch === 'undefined' || deferEnrich) return;
    if (!backdropLookupSignature) return;

    const lookupItems = backdropLookupSignature.split('\n').map((line) => {
      const [title, year] = line.split('\t');
      return { title, year };
    });

    const cachedHits: Record<string, TMDBHeroInfo> = {};
    const uncachedItems: Array<{ title: string; year?: string }> = [];
    for (const item of lookupItems) {
      const cached = peekCachedTMDBHeroInfo(item.title, item.year);
      if (cached !== undefined) {
        fetchedTitlesRef.current.add(item.title);
        if (cached?.backdrop) {
          cachedHits[item.title] = cached;
        }
      } else {
        uncachedItems.push(item);
      }
    }

    if (Object.keys(cachedHits).length > 0) {
      setInfoByTitle((prev) => ({ ...prev, ...cachedHits }));
    }
    if (uncachedItems.length === 0) return;

    const controller = new AbortController();
    fetchTMDBHeroInfoBatch(uncachedItems, controller.signal)
      .then((infoMap) => {
        if (controller.signal.aborted) return;
        for (const item of uncachedItems) {
          if (peekCachedTMDBHeroInfo(item.title, item.year) !== undefined) {
            fetchedTitlesRef.current.add(item.title);
          }
        }
        if (Object.keys(infoMap).length > 0) {
          setInfoByTitle((prev) => ({ ...prev, ...infoMap }));
        }
      })
      .catch(() => {
        // TMDB 未启用/网络失败：保持模糊海报降级
      });

    return () => controller.abort();
  }, [backdropLookupSignature, deferEnrich]);

  // 仅挂载「当前帧 + 前后相邻帧」的模糊底图与海报，既保证淡入淡出过渡平滑，
  // 又将 blur-2xl 合成层上限控制在 3 帧以内，避免 8 帧长期常驻 GPU 显存。
  const prevIndex =
    slides.length > 0
      ? (safeActiveIndex - 1 + slides.length) % slides.length
      : -1;
  const nextIndex =
    slides.length > 0 ? (safeActiveIndex + 1) % slides.length : -1;

  if (slides.length === 0) {
    if (!loading) return null;
    return (
      <div
        // 高度与真实轮播保持一致，避免数据到达时布局跳动
        className='mb-6 h-[220px] w-full animate-pulse rounded-xl bg-[#e8e8e8] sm:h-[300px] lg:h-[360px] dark:bg-[#2a2a2a]'
        aria-label='推荐加载中'
      />
    );
  }

  const active = slides[safeActiveIndex];

  return (
    <section
      aria-label='推荐'
      className='group relative mb-6'
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // 键盘聚焦到轮播内（播放按钮/指示条）时暂停自动切换；焦点在容器内部切换时不误重置计时器
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className='relative h-[220px] overflow-hidden rounded-xl sm:h-[300px] lg:h-[360px]'>
        {slides.map((slide, index) => {
          const info = infoByTitle[slide.title.trim()];
          const isActive = index === safeActiveIndex;
          const showMedia =
            index === safeActiveIndex ||
            index === prevIndex ||
            index === nextIndex;
          const posterSrc = processImageUrl(slide.poster);
          // 外链/代理图直连，不经源站 /_next/image（源站并发有限）
          const posterUnoptimized = shouldUseUnoptimizedImage(posterSrc);
          const backdropUnoptimized = info?.backdrop
            ? shouldUseUnoptimizedImage(info.backdrop)
            : false;
          return (
            <div
              key={slide.key}
              aria-hidden={!isActive}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              {/* 背景层：海报模糊放大垫底，TMDB 横图就绪后叠加清晰横图 */}
              {showMedia && (
                <Image
                  src={posterSrc}
                  alt=''
                  fill
                  priority={index === 0}
                  unoptimized={posterUnoptimized}
                  referrerPolicy='no-referrer'
                  // 模糊垫底不需要高清：与右侧海报卡共用同一档小图
                  sizes='180px'
                  className='scale-110 object-cover blur-2xl brightness-[0.55]'
                  aria-hidden
                />
              )}
              {showMedia && info?.backdrop && (
                <Image
                  src={info.backdrop}
                  alt=''
                  fill
                  unoptimized={backdropUnoptimized}
                  referrerPolicy='no-referrer'
                  sizes='(max-width: 1280px) 100vw, 1280px'
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
                    // 隐藏帧的链接移出 Tab 序列，避免键盘聚焦到不可见元素
                    tabIndex={isActive ? undefined : -1}
                    onClick={() => {
                      // banner 播放漏斗起点：帧位 + 类型（片名等由 lib 层脱敏）
                      analytics.trackFeatureUsage('banner_play_click', true, {
                        slide_index: index,
                        slide_kind: slide.kind,
                      });
                    }}
                    className='mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#00be06] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a304] sm:mt-4 sm:px-5'
                  >
                    <Play size={16} className='fill-current' />
                    {slide.kind === 'continue' ? '继续播放' : '立即播放'}
                  </Link>
                </div>
                <div className='relative hidden aspect-[2/3] w-[150px] shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/20 sm:block lg:w-[180px]'>
                  {showMedia && (
                    <Image
                      src={posterSrc}
                      alt={slide.title}
                      fill
                      unoptimized={posterUnoptimized}
                      referrerPolicy='no-referrer'
                      sizes='180px'
                      className='object-cover'
                    />
                  )}
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
                aria-current={index === safeActiveIndex}
                onClick={() => setActiveIndex(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === safeActiveIndex
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
