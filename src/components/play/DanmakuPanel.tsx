'use client';

import {
  ArrowLeft,
  MessageSquare,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  type DanmakuAnime,
  type DanmakuEpisode,
  type DanmakuFilters,
  readDanmakuFilters,
  readDanmakuSelection,
  saveDanmakuFilters,
  saveDanmakuSelection,
} from '@/lib/danmaku';

interface Props {
  mediaKey: string;
  title: string;
  episodeIndex: number;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function DanmakuPanel({
  mediaKey,
  title,
  episodeIndex,
  enabled,
  onToggle,
}: Props) {
  const [keyword, setKeyword] = useState(title);
  const [animes, setAnimes] = useState<DanmakuAnime[]>([]);
  const [anime, setAnime] = useState<DanmakuAnime | null>(null);
  const [episodes, setEpisodes] = useState<DanmakuEpisode[]>([]);
  const [selection, setSelection] = useState(() =>
    readDanmakuSelection(mediaKey, episodeIndex),
  );
  const [filters, setFilters] = useState(readDanmakuFilters);
  const [words, setWords] = useState(filters.keywords.join('\n'));
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function query(
    params: Record<string, string>,
    apply: (data: {
      animes?: DanmakuAnime[];
      episodes?: DanmakuEpisode[];
    }) => void,
  ) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/danmaku?${new URLSearchParams(params)}`,
        { signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '弹幕请求失败');
      if (controller.signal.aborted) return;
      apply(data);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : '弹幕请求失败');
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }

  function select(episode: DanmakuEpisode | null) {
    const value = episode
      ? {
          episodeId: episode.id,
          title: `${anime?.title || ''} · ${episode.title}`,
        }
      : null;
    try {
      saveDanmakuSelection(mediaKey, episodeIndex, value);
      setSelection(value);
      setError('');
      onToggle(true);
    } catch {
      setError('无法保存弹幕选择，请检查浏览器存储权限');
    }
  }

  function updateFilters(next: DanmakuFilters) {
    try {
      saveDanmakuFilters(next);
      setFilters(next);
      setError('');
      if (enabled) onToggle(true);
    } catch {
      setError('无法保存屏蔽设置，请检查浏览器存储权限');
    }
  }

  return (
    <details className='border-b border-gray-200 px-4 py-3 text-sm dark:border-gray-700'>
      <summary className='cursor-pointer select-none font-medium'>
        <span className='ml-1 inline-flex max-w-full items-center gap-2 align-middle'>
          <MessageSquare size={16} className='shrink-0' />
          弹幕管理
          <span className='truncate font-normal text-gray-500'>
            {selection?.title || '自动匹配'}
          </span>
        </span>
      </summary>
      <div className='mt-4 grid min-w-0 gap-6 md:grid-cols-2'>
        <section className='min-w-0'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={enabled}
                onChange={(event) => onToggle(event.target.checked)}
              />
              显示弹幕
            </label>
            <button
              type='button'
              onClick={() => select(null)}
              className='flex items-center gap-1 text-green-600'
            >
              <RotateCcw size={14} />
              恢复自动匹配
            </button>
          </div>
          <form
            className='flex min-w-0 gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              if (!keyword.trim()) return;
              setAnime(null);
              setEpisodes([]);
              setSearched(false);
              void query(
                { action: 'search', keyword: keyword.trim() },
                (data) => {
                  setAnimes(data.animes || []);
                  setSearched(true);
                },
              );
            }}
          >
            <input
              aria-label='弹幕搜索关键词'
              maxLength={100}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className='min-w-0 flex-1 rounded-md border-gray-300 bg-transparent text-sm dark:border-gray-600'
            />
            <button
              type='submit'
              disabled={loading || !keyword.trim()}
              title='搜索弹幕'
              aria-label='搜索弹幕'
              className='flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-600 text-white disabled:opacity-50'
            >
              <Search size={18} />
            </button>
          </form>
          {loading && (
            <p role='status' className='py-3 text-gray-500'>
              加载中...
            </p>
          )}
          {error && (
            <p role='alert' className='py-3 text-red-500'>
              {error}
            </p>
          )}
          {anime && (
            <button
              type='button'
              className='my-3 flex items-center gap-2'
              onClick={() => {
                requestRef.current?.abort();
                setLoading(false);
                setAnime(null);
                setEpisodes([]);
              }}
            >
              <ArrowLeft size={16} />
              {anime.title}
            </button>
          )}
          <div className='mt-2 max-h-64 overflow-y-auto'>
            {!anime &&
              animes.map((item) => (
                <button
                  type='button'
                  key={item.id}
                  disabled={loading}
                  className='block w-full border-b border-gray-100 px-2 py-3 text-left hover:bg-gray-100 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-800'
                  onClick={() => {
                    setAnime(item);
                    setEpisodes([]);
                    void query({ action: 'episodes', id: item.id }, (data) =>
                      setEpisodes(data.episodes || []),
                    );
                  }}
                >
                  {item.title}
                  {item.episodeCount > 0 ? ` · ${item.episodeCount} 集` : ''}
                </button>
              ))}
            {anime &&
              episodes.map((episode) => (
                <button
                  type='button'
                  key={episode.id}
                  aria-pressed={selection?.episodeId === episode.id}
                  className={`block w-full rounded px-2 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 ${selection?.episodeId === episode.id ? 'text-green-600' : ''}`}
                  onClick={() => select(episode)}
                >
                  {episode.title || episode.id}
                </button>
              ))}
          </div>
          {!loading &&
            !error &&
            ((searched && !anime && !animes.length) ||
              (anime && !episodes.length)) && (
              <p className='py-3 text-gray-500'>暂无匹配结果</p>
            )}
        </section>
        <section className='min-w-0'>
          <label className='mb-2 block' htmlFor='danmaku-filter-words'>
            屏蔽词
          </label>
          <textarea
            id='danmaku-filter-words'
            rows={3}
            value={words}
            maxLength={5000}
            onChange={(event) => setWords(event.target.value)}
            className='w-full rounded-md border-gray-300 bg-transparent text-sm dark:border-gray-600'
          />
          <div className='mt-2 flex flex-wrap gap-x-4 gap-y-2'>
            {(
              [
                ['blockTop', '屏蔽顶部'],
                ['blockBottom', '屏蔽底部'],
                ['blockColor', '屏蔽彩色'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  checked={filters[key]}
                  onChange={(event) =>
                    updateFilters({ ...filters, [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <button
            type='button'
            className='mt-3 flex items-center gap-2 text-green-600'
            onClick={() =>
              updateFilters({
                ...filters,
                keywords: Array.from(
                  new Set(
                    words
                      .split(/[\n,，]/)
                      .map((word) => word.trim())
                      .filter(Boolean),
                  ),
                ).slice(0, 100),
              })
            }
          >
            <Save size={16} />
            保存屏蔽词
          </button>
        </section>
      </div>
    </details>
  );
}
