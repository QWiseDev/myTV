'use client';

import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { cachedGet } from '@/lib/api-cache.client';
import type { SearchResult } from '@/lib/types';

import {
  ArtPlayerLike,
  clearDanmakuDisplay,
  DanmakuItemLike,
  isDanmakuAbortError,
  loadAndRenderDanmaku,
  showDanmakuErrorNotice,
} from '../utils/danmakuRuntime';
import {
  findSourceByIdentity,
  hydrateSourceDetail,
  replaceSourceDetail,
  resolveDoubanId,
} from '../utils/sourceDetails';

interface UseSourceSwitcherParams {
  setVideoLoadingStage: (stage: 'initing' | 'sourceChanging') => void;
  setIsVideoLoading: (loading: boolean) => void;
  lastDanmuLoadKeyRef: MutableRefObject<string>;
  danmuLoadingRef: MutableRefObject<boolean>;
  danmuOperationTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  episodeSwitchTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  currentSourceRef: MutableRefObject<string>;
  currentIdRef: MutableRefObject<string>;
  availableSources: SearchResult[];
  setError: (msg: string | null) => void;
  currentEpisodeIndex: number;
  resumeTimeRef: MutableRefObject<number | null>;
  setVideoTitle: (title: string) => void;
  setVideoYear: (year: string) => void;
  setVideoCover: (cover: string) => void;
  setVideoDoubanId: (doubanId: number | null) => void;
  videoDoubanIdRef: MutableRefObject<number | null | undefined>;
  setCurrentSource: (source: string) => void;
  setCurrentId: (id: string) => void;
  setDetail: (detail: SearchResult | null) => void;
  setAvailableSources: Dispatch<SetStateAction<SearchResult[]>>;
  setCurrentEpisodeIndex: (index: number) => void;
  isSourceChangingRef: MutableRefObject<boolean>;
  externalDanmuEnabledRef: MutableRefObject<boolean>;
  loadExternalDanmu: () => Promise<DanmakuItemLike[]>;
}

export function useSourceSwitcher({
  setVideoLoadingStage,
  setIsVideoLoading,
  lastDanmuLoadKeyRef,
  danmuLoadingRef,
  danmuOperationTimeoutRef,
  episodeSwitchTimeoutRef,
  artPlayerRef,
  currentSourceRef,
  currentIdRef,
  availableSources,
  setError,
  currentEpisodeIndex,
  resumeTimeRef,
  setVideoTitle,
  setVideoYear,
  setVideoCover,
  setVideoDoubanId,
  videoDoubanIdRef,
  setCurrentSource,
  setCurrentId,
  setDetail,
  setAvailableSources,
  setCurrentEpisodeIndex,
  isSourceChangingRef,
  externalDanmuEnabledRef,
  loadExternalDanmu,
}: UseSourceSwitcherParams) {
  const availableSourcesRef = useRef(availableSources);
  const operationGenerationRef = useRef(0);
  availableSourcesRef.current = availableSources;

  useEffect(() => {
    return () => {
      operationGenerationRef.current += 1;
      isSourceChangingRef.current = false;
    };
  }, [isSourceChangingRef]);

  const handleSourceChange = useCallback(
    async (newSource: string, newId: string, newTitle: string) => {
      if (isSourceChangingRef.current) {
        return;
      }

      const sourcePageUrl = new URL(window.location.href);
      if (sourcePageUrl.pathname !== '/play') {
        return;
      }

      const operationGeneration = ++operationGenerationRef.current;
      const isCurrentOperation = () =>
        operationGenerationRef.current === operationGeneration;
      const isStillOnSourcePage = () =>
        sourcePageUrl.pathname === '/play' &&
        window.location.pathname === sourcePageUrl.pathname;
      const canCommitOperation = () =>
        isCurrentOperation() && isStillOnSourcePage();
      const abandonOperation = () => {
        if (isCurrentOperation()) {
          isSourceChangingRef.current = false;
        }
      };

      try {
        isSourceChangingRef.current = true;

        setVideoLoadingStage('sourceChanging');
        setIsVideoLoading(true);

        lastDanmuLoadKeyRef.current = '';
        danmuLoadingRef.current = false;

        if (danmuOperationTimeoutRef.current) {
          clearTimeout(danmuOperationTimeoutRef.current);
          danmuOperationTimeoutRef.current = null;
        }
        if (episodeSwitchTimeoutRef.current) {
          clearTimeout(episodeSwitchTimeoutRef.current);
          episodeSwitchTimeoutRef.current = null;
        }

        clearDanmakuDisplay(artPlayerRef.current, { hide: true });

        const currentPlayTime = artPlayerRef.current?.currentTime || 0;

        const newDetail = findSourceByIdentity(availableSourcesRef.current, {
          source: newSource,
          id: newId,
        });
        if (!newDetail) {
          isSourceChangingRef.current = false;
          setIsVideoLoading(false);
          setError('未找到匹配结果');
          return;
        }

        // 🩹 补全详情：部分源的搜索结果缺失 douban_id，导致演员阵容/短评无法加载
        const resolvedDetail = await hydrateSourceDetail(
          newDetail,
          (source, id) =>
            cachedGet<SearchResult>('/api/detail', {
              source,
              id,
            }),
          {
            onError: (error) =>
              console.warn('补全换源详情失败，继续使用搜索结果:', error),
          },
        );
        if (!canCommitOperation()) {
          abandonOperation();
          return;
        }

        let targetIndex = currentEpisodeIndex;

        if (
          !resolvedDetail.episodes ||
          targetIndex >= resolvedDetail.episodes.length
        ) {
          targetIndex = 0;
        }

        const targetVideoUrl = resolvedDetail.episodes?.[targetIndex]?.trim();
        if (!targetVideoUrl) {
          throw new Error('目标播放源当前集没有可播放地址');
        }
        if (targetIndex !== currentEpisodeIndex) {
          resumeTimeRef.current = 0;
        } else if (
          (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
          currentPlayTime > 1
        ) {
          resumeTimeRef.current = currentPlayTime;
        }

        const resolvedTitle = resolvedDetail.title || newTitle;
        const resolvedDoubanId = resolveDoubanId(
          resolvedDetail,
          videoDoubanIdRef.current,
        );

        if (!canCommitOperation()) {
          abandonOperation();
          return;
        }

        setVideoTitle(resolvedTitle);
        setVideoYear(resolvedDetail.year);
        setVideoCover(resolvedDetail.poster);
        setVideoDoubanId(resolvedDoubanId);
        currentSourceRef.current = newSource;
        currentIdRef.current = newId;
        setCurrentSource(newSource);
        setCurrentId(newId);
        setDetail(resolvedDetail);
        setAvailableSources((sources) => {
          const replacedSources = replaceSourceDetail(sources, resolvedDetail);
          if (
            findSourceByIdentity(replacedSources, {
              source: resolvedDetail.source,
              id: resolvedDetail.id,
            })
          ) {
            return replacedSources;
          }
          return [resolvedDetail, ...replacedSources];
        });
        setCurrentEpisodeIndex(targetIndex);

        const newUrl = new URL(sourcePageUrl.toString());
        newUrl.searchParams.set('source', newSource);
        newUrl.searchParams.set('id', newId);
        newUrl.searchParams.set('title', resolvedTitle);
        if (resolvedDetail.year) {
          newUrl.searchParams.set('year', resolvedDetail.year);
        } else {
          newUrl.searchParams.delete('year');
        }
        if (resolvedDetail.poster) {
          newUrl.searchParams.set('poster', resolvedDetail.poster);
        } else {
          newUrl.searchParams.delete('poster');
        }
        if (resolvedDoubanId > 0) {
          newUrl.searchParams.set('douban_id', String(resolvedDoubanId));
        } else {
          newUrl.searchParams.delete('douban_id');
        }
        newUrl.searchParams.delete('prefer');
        if (!canCommitOperation()) {
          abandonOperation();
          return;
        }
        window.history.replaceState({}, '', newUrl.toString());

        setTimeout(async () => {
          if (!canCommitOperation()) return;
          const art = artPlayerRef.current;

          if (
            art?.plugins?.artplayerPluginDanmuku &&
            externalDanmuEnabledRef.current
          ) {
            lastDanmuLoadKeyRef.current = '';
            danmuLoadingRef.current = false;

            try {
              await loadAndRenderDanmaku(art, loadExternalDanmu, {
                preserveHidden: false,
                showNotice: true,
              });
            } catch (error) {
              if (isDanmakuAbortError(error)) return;
              console.error('换源后弹幕加载失败:', error);
              showDanmakuErrorNotice(art, error);
            }
          }
        }, 1000);
      } catch (err) {
        if (!isCurrentOperation()) return;
        isSourceChangingRef.current = false;
        if (!isStillOnSourcePage()) return;
        setIsVideoLoading(false);
        setError(err instanceof Error ? err.message : '换源失败');
      }
    },
    [
      artPlayerRef,
      currentEpisodeIndex,
      currentIdRef,
      currentSourceRef,
      danmuLoadingRef,
      danmuOperationTimeoutRef,
      episodeSwitchTimeoutRef,
      externalDanmuEnabledRef,
      isSourceChangingRef,
      lastDanmuLoadKeyRef,
      loadExternalDanmu,
      resumeTimeRef,
      setCurrentEpisodeIndex,
      setCurrentId,
      setCurrentSource,
      setDetail,
      setAvailableSources,
      setError,
      setIsVideoLoading,
      setVideoCover,
      setVideoDoubanId,
      setVideoLoadingStage,
      setVideoTitle,
      setVideoYear,
      videoDoubanIdRef,
    ],
  );

  return { handleSourceChange };
}
