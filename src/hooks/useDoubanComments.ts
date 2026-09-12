'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getDoubanComments } from '@/lib/douban.client';
import type { DoubanComment } from '@/lib/types';

const PAGE_SIZE = 20;

export function useDoubanComments(id: string) {
  const [comments, setComments] = useState<DoubanComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef(0);
  const generationRef = useRef(0);
  const busyRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!/^\d+$/.test(id) || id === '0' || busyRef.current) return;
    const generation = generationRef.current;
    const start = cursorRef.current;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getDoubanComments({ id, start, limit: PAGE_SIZE });
      if (generation !== generationRef.current) return;
      if (result.code !== 200 || !result.data) {
        throw new Error('加载短评失败，请稍后重试');
      }
      const data = result.data;
      const next = data.nextStart ?? start + data.comments.length;
      setComments((previous) => {
        const all =
          start === 0 ? data.comments : [...previous, ...data.comments];
        const seen = new Set<string>();
        return all.filter((comment) => {
          const key =
            comment.id ||
            JSON.stringify([comment.user_id, comment.time, comment.content]);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
      cursorRef.current = next;
      setHasMore(
        next > start && (data.hasMore ?? data.comments.length >= PAGE_SIZE),
      );
    } catch {
      if (generation === generationRef.current)
        setError('加载短评失败，请稍后重试');
    } finally {
      if (generation === generationRef.current) {
        busyRef.current = false;
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    const generation = ++generationRef.current;
    cursorRef.current = 0;
    busyRef.current = false;
    setComments([]);
    setHasMore(false);
    setError(null);
    setLoading(false);
    void loadMore();
    return () => {
      generationRef.current = generation + 1;
    };
  }, [loadMore]);

  return { comments, loading, error, hasMore, loadMore };
}
