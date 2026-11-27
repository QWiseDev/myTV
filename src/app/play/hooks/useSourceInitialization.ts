'use client';

import { MutableRefObject, useCallback, useEffect, useRef } from 'react';

import { cachedGet } from '@/lib/api-cache.client';
import type { SearchResult } from '@/lib/types';
import { selectUsableImageUrl } from '@/lib/utils';

import { SpeedTestProgress } from '../types';
import {
  dedupeSources,
  findSourceByIdentity,
  hydrateSourceDetail,
  isSameSource,
  replaceSourceDetail,
  resolveDoubanId,
} from '../utils/sourceDetails';
import {
  preferBestSource,
  sortSourcesByPriority,
} from '../utils/sourcePreference';
import {
  fuzzyMatchSources,
  matchesSourceLoosely,
  matchesSourceStrictly,
  normalizeSearchYear,
  searchSourcesByTitle,
} from '../utils/sourceSearch';

interface DeviceInfo {
  userAgent: string;
  isIOS: boolean;
  isIOS13: boolean;
  isMobile: boolean;
  isTablet?: boolean;
}

export interface UseSourceInitializationParams {
  currentSource: string;
  currentId: string;
  videoTitle: string;
  searchTitle: string;
  fallbackTitle?: string;
  fallbackCover?: string;
  fallbackDoubanId?: number;
  searchType: string;
  needPreferRef?: MutableRefObject<boolean>;
  optimizationEnabled: boolean;
  deviceInfo: DeviceInfo;
  setNeedPrefer: (value: boolean) => void;
  setCurrentSource: (source: string) => void;
  setCurrentId: (id: string) => void;
  setVideoTitle: (title: string) => void;
  setVideoYear: (year: string) => void;
  setVideoCover: (cover: string) => void;
  setVideoDoubanId: (doubanId: number) => void;
  videoTitleRef: MutableRefObject<string | undefined>;
  videoYearRef: MutableRefObject<string | undefined>;
  videoDoubanIdRef: MutableRefObject<number | null | undefined>;
  currentSourceRef?: MutableRefObject<string>;
  currentIdRef?: MutableRefObject<string>;
  detailRef?: MutableRefObject<SearchResult | null>;
  setDetail: (detail: SearchResult | null) => void;
  setAvailableSources: (sources: SearchResult[]) => void;
  setCurrentEpisodeIndex: (index: number) => void;
  currentEpisodeIndexRef: MutableRefObject<number>;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  setLoadingStage: (
    stage: 'searching' | 'preferring' | 'fetching' | 'ready' | undefined,
  ) => void;
  setLoadingMessage: (message: string) => void;
  setSourceSearchLoading: (loading: boolean) => void;
  setSourceSearchError: (message: string | null) => void;
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void;
  errorHandler: { handleError: (error: Error | unknown) => void };
}

export interface UseSourceInitializationResult {
  loadAvailableSources: () => Promise<boolean>;
}

export function useSourceInitialization({
  currentSource,
  currentId,
  videoTitle,
  searchTitle,
  fallbackTitle,
  fallbackCover,
  fallbackDoubanId,
  searchType,
  optimizationEnabled,
  deviceInfo,
  setNeedPrefer,
  setCurrentSource,
  setCurrentId,
  setVideoTitle,
  setVideoYear,
  setVideoCover,
  setVideoDoubanId,
  videoTitleRef,
  videoYearRef,
  videoDoubanIdRef,
  currentSourceRef,
  currentIdRef,
  detailRef,
  setDetail,
  setAvailableSources,
  setCurrentEpisodeIndex,
  currentEpisodeIndexRef,
  setLoading,
  setError,
  setLoadingStage,
  setLoadingMessage,
  setSourceSearchLoading,
  setSourceSearchError,
  setSpeedTestProgress,
  errorHandler,
}: UseSourceInitializationParams): UseSourceInitializationResult {
  const latestRequestRef = useRef(0);
  const sourceSearchLoaderRef = useRef<(() => Promise<void>) | null>(null);
  const handleError = errorHandler.handleError;

  const loadAvailableSources = useCallback(async () => {
    if (!sourceSearchLoaderRef.current) {
      return false;
    }
    await sourceSearchLoaderRef.current();
    return true;
  }, []);

  useEffect(() => {
    const requestId = ++latestRequestRef.current;
    const isActive = () => latestRequestRef.current === requestId;
    const getErrorMessage = (error: Error | unknown) =>
      error instanceof Error ? error.message : '初始化失败';
    const failInitialization = (error: Error | unknown) => {
      if (!isActive()) return;
      handleError(error);
      setError(getErrorMessage(error));
      setLoading(false);
    };

    const fetchSourceDetail = async (
      source: string,
      id: string,
      options?: { silent?: boolean; includeRelatedSources?: boolean },
    ): Promise<SearchResult[]> => {
      const silent = options?.silent === true;
      const includeRelatedSources = options?.includeRelatedSources === true;
      try {
        const detailData = await cachedGet<SearchResult>('/api/detail', {
          source,
          id,
        });

        if (!includeRelatedSources) {
          return [detailData];
        }

        try {
          const query = videoTitle || detailData.title;
          if (query && query.trim()) {
            const { bestResults } = await searchSourcesByTitle({
              query,
              matchResult: (result) =>
                matchesSourceLoosely(result.title, query),
              onVariantError: (variant, error) =>
                console.warn(`搜索变体 "${variant}" 失败:`, error),
            });

            if (bestResults.length > 0) {
              const combined = [detailData, ...bestResults];
              const uniqueSources = dedupeSources(combined);

              return uniqueSources;
            }
          }
        } catch (e) {
          console.warn('搜索其他源失败:', e);
        }

        return [detailData];
      } catch (err) {
        if (!silent) {
          handleError(err);
        }
        return [];
      } finally {
        if (isActive()) {
          setSourceSearchLoading(false);
        }
      }
    };

    const fetchSourcesData = async (
      query: string,
      options?: {
        silent?: boolean;
        year?: string;
        referenceTitle?: string;
        group?: string;
        forSource?: string;
        excludeSource?: string;
      },
    ): Promise<SearchResult[]> => {
      const silent = options?.silent === true;
      try {
        const referenceTitle = (
          options?.referenceTitle ||
          videoTitle ||
          searchTitle ||
          query
        ).trim();
        const effectiveYear = normalizeSearchYear(
          options?.year ?? videoYearRef.current,
        );
        const extraSearchParams: Record<string, string> = {};
        if (options?.group) {
          extraSearchParams.group = options.group;
        }
        if (options?.forSource) {
          extraSearchParams.forSource = options.forSource;
        }
        const { allResults, bestResults } = await searchSourcesByTitle({
          query,
          minMatchesToStop: 5,
          extraSearchParams:
            Object.keys(extraSearchParams).length > 0
              ? extraSearchParams
              : undefined,
          matchResult: (result) =>
            (!options?.excludeSource ||
              result.source !== options.excludeSource) &&
            matchesSourceStrictly(result, {
              queryTitle: referenceTitle,
              year: effectiveYear,
              searchType,
            }),
          onVariantError: (variant, error) =>
            console.warn(
              `搜索变体 "${variant}" 失败:`,
              (error as Error)?.message,
            ),
        });

        let finalResults = bestResults;

        if (bestResults.length === 0) {
          const filteredCandidates = options?.excludeSource
            ? allResults.filter(
                (result) => result.source !== options.excludeSource,
              )
            : allResults;
          finalResults = fuzzyMatchSources(filteredCandidates, referenceTitle, {
            year: effectiveYear,
            searchType,
          });
        }

        return finalResults;
      } catch (err) {
        if (isActive() && !silent) {
          handleError(err);
          setSourceSearchError(err instanceof Error ? err.message : '搜索失败');
        }
        return [];
      } finally {
        if (isActive()) {
          setSourceSearchLoading(false);
        }
      }
    };

    const enrichAvailableSources = async (currentDetail: SearchResult) => {
      const query = (
        searchTitle ||
        videoTitle ||
        currentDetail.title ||
        ''
      ).trim();
      if (!query) return;

      const referenceTitle = (
        currentDetail.title ||
        videoTitle ||
        searchTitle ||
        query
      ).trim();
      const effectiveYear = normalizeSearchYear(
        currentDetail.year || videoYearRef.current,
      );
      const isAdultDetail = currentDetail.adult === true;

      setSourceSearchLoading(true);
      const searchedSources = await fetchSourcesData(query, {
        silent: true,
        year: effectiveYear,
        referenceTitle,
        ...(isAdultDetail
          ? {
              group: 'adult',
              forSource: currentDetail.source,
              excludeSource: currentDetail.source,
            }
          : {}),
      });
      if (!isActive() || searchedSources.length === 0) return;

      // 优先源紧跟当前源之后置顶，并跳过同身份源以免覆盖已补全的 currentDetail
      const otherSources = searchedSources.filter(
        (source) => !isSameSource(source, currentDetail),
      );
      if (otherSources.length === 0) return;

      const mergedSources = dedupeSources([
        currentDetail,
        ...sortSourcesByPriority(otherSources),
      ]);
      setAvailableSources(mergedSources);
    };

    const initAll = async () => {
      try {
        const currentDetail = detailRef?.current;
        const routeAlreadyApplied =
          Boolean(currentSource && currentId) &&
          currentSourceRef?.current === currentSource &&
          currentIdRef?.current === currentId &&
          Boolean(
            currentDetail &&
            findSourceByIdentity([currentDetail], {
              source: currentSource,
              id: currentId,
            }),
          );

        if (routeAlreadyApplied && currentDetail) {
          sourceSearchLoaderRef.current = () =>
            enrichAvailableSources(currentDetail);
          setLoading(false);
          void enrichAvailableSources(currentDetail);
          return;
        }

        // 🩹 修复：用户手动换源后，ref 中的 source/id 已经被
        // handleSourceChange 更新，但 routeParams（来自 useSearchParams）
        // 不会感知 replaceState 的变化，仍停留在旧值。
        // 若此时 effect 因其他依赖变化重新执行，会以旧 routeParams 重新
        // 初始化，导致"换源后又变回去"。
        // 检测到 ref 已有有效源且与传入的 routeParams 不同时，说明用户
        // 已经换过源，跳过重新初始化，仅补充可选源列表。
        const userHasSwitchedSource =
          currentSourceRef?.current &&
          currentIdRef?.current &&
          currentDetail &&
          (currentSourceRef.current !== currentSource ||
            currentIdRef.current !== currentId);

        if (userHasSwitchedSource) {
          sourceSearchLoaderRef.current = () =>
            enrichAvailableSources(currentDetail);
          setLoading(false);
          void enrichAvailableSources(currentDetail);
          return;
        }

        if (!currentSource && !currentId && !videoTitle && !searchTitle) {
          failInitialization(new Error('缺少必要参数'));
          return;
        }
        setLoading(true);
        setError(null);
        setLoadingStage(currentSource && currentId ? 'fetching' : 'searching');
        setLoadingMessage(
          currentSource && currentId
            ? '🎬 正在获取视频详情...'
            : '🔍 正在搜索播放源...',
        );

        // 链接显式指定了 source + id 时，无论是否携带 prefer=true，都优先直连该源
        const hasExplicitSource = Boolean(currentSource && currentId);
        let sourcesInfo: SearchResult[] = [];
        let ignoreProvidedSource = false;

        if (hasExplicitSource) {
          const providedSourceDetail = await fetchSourceDetail(
            currentSource,
            currentId,
            {
              silent: true,
              includeRelatedSources: false,
            },
          );
          if (!isActive()) return;

          const playableProvided = providedSourceDetail.filter(
            (item) => Array.isArray(item.episodes) && item.episodes.length > 0,
          );
          if (playableProvided.length > 0) {
            sourcesInfo = playableProvided;
          } else {
            ignoreProvidedSource = true;
            console.warn('提供的 source/id 不可用，退回站内搜索结果', {
              source: currentSource,
              id: currentId,
            });
          }
        }

        if (sourcesInfo.length === 0) {
          const query = searchTitle || videoTitle;
          if (query.trim()) {
            setSourceSearchLoading(true);
            sourcesInfo = await fetchSourcesData(query, {
              forSource: hasExplicitSource ? currentSource : undefined,
              excludeSource: hasExplicitSource ? currentSource : undefined,
            });
            // 优先源置顶：测速优选只探测前列源，置顶可提高优质源命中率
            sourcesInfo = sortSourcesByPriority(sourcesInfo);
          }
          if (!isActive()) return;
        }

        if (sourcesInfo.length === 0) {
          failInitialization(new Error('未找到匹配结果'));
          return;
        }

        setAvailableSources(sourcesInfo);

        let detailData: SearchResult = sourcesInfo[0];
        if (hasExplicitSource && !ignoreProvidedSource) {
          const target = findSourceByIdentity(sourcesInfo, {
            source: currentSource,
            id: currentId,
          });
          if (target) {
            detailData = target;
          } else {
            failInitialization(new Error('未找到匹配结果'));
            return;
          }
        }

        if (
          (!hasExplicitSource || ignoreProvidedSource) &&
          optimizationEnabled
        ) {
          setLoadingStage('preferring');
          setLoadingMessage('⚡ 正在优选最佳播放源...');

          detailData = await preferBestSource(sourcesInfo, {
            deviceInfo,
            setSpeedTestProgress,
            episodeIndex: currentEpisodeIndexRef.current,
          });
          if (!isActive()) return;
        }

        // 🩹 补全详情：部分视频源的 /api/search 结果可能缺失 douban_id 等字段，
        // 会导致「演员阵容 / 豆瓣短评」无法加载；此时补一次 /api/detail 进行兜底。
        const hydratedDetail = await hydrateSourceDetail(
          detailData,
          (source, id) =>
            cachedGet<SearchResult>('/api/detail', {
              source,
              id,
            }),
          {
            onError: (error) =>
              console.warn('补全视频详情失败，继续使用搜索结果:', error),
          },
        );
        if (!isActive()) return;
        if (hydratedDetail !== detailData) {
          detailData = hydratedDetail;
          sourcesInfo = replaceSourceDetail(sourcesInfo, detailData);
          setAvailableSources(sourcesInfo);
        }

        setNeedPrefer(false);
        setCurrentSource(detailData.source);
        setCurrentId(detailData.id);
        const resolvedTitle =
          detailData.title ||
          videoTitleRef.current ||
          videoTitle ||
          fallbackTitle ||
          searchTitle ||
          '';
        const resolvedYear = detailData.year || videoYearRef.current || '';
        const resolvedCover = selectUsableImageUrl(
          fallbackCover,
          detailData.poster,
        );

        setVideoYear(resolvedYear);
        setVideoTitle(resolvedTitle);
        setVideoCover(resolvedCover);
        const resolvedDoubanId = resolveDoubanId(
          detailData,
          videoDoubanIdRef.current || fallbackDoubanId || null,
        );
        const resolvedDetail: SearchResult = {
          ...detailData,
          title: resolvedTitle,
          year: resolvedYear,
          poster: resolvedCover || detailData.poster,
          douban_id: resolvedDoubanId || detailData.douban_id,
        };

        setVideoDoubanId(resolvedDoubanId);
        setDetail(resolvedDetail);
        sourceSearchLoaderRef.current = () =>
          enrichAvailableSources(resolvedDetail);
        if (hasExplicitSource && !ignoreProvidedSource) {
          void enrichAvailableSources(resolvedDetail);
        }
        if (currentEpisodeIndexRef.current >= resolvedDetail.episodes.length) {
          setCurrentEpisodeIndex(0);
        }

        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('source', resolvedDetail.source);
        newUrl.searchParams.set('id', resolvedDetail.id);
        if (resolvedYear) {
          newUrl.searchParams.set('year', resolvedYear);
        }
        newUrl.searchParams.set('title', resolvedTitle);
        // 封面不再进地址栏：由详情接口 / 播放记录兜底回填；旧的 poster 参数在此被清掉
        newUrl.searchParams.delete('poster');
        if (resolvedDoubanId > 0) {
          newUrl.searchParams.set('douban_id', String(resolvedDoubanId));
        } else {
          newUrl.searchParams.delete('douban_id');
        }
        newUrl.searchParams.delete('prefer');
        window.history.replaceState({}, '', newUrl.toString());

        setLoadingStage('ready');
        setLoadingMessage('✨ 准备就绪，即将开始播放...');

        setTimeout(() => {
          if (isActive()) {
            setLoading(false);
          }
        }, 1000);
      } catch (error) {
        if (!isActive()) return;
        console.error('初始化失败:', error);
        failInitialization(error);
      }
    };

    initAll();
    return () => {
      if (latestRequestRef.current === requestId) {
        latestRequestRef.current += 1;
        sourceSearchLoaderRef.current = null;
      }
    };
  }, [
    currentId,
    currentSource,
    currentIdRef,
    currentEpisodeIndexRef,
    currentSourceRef,
    deviceInfo,
    detailRef,
    handleError,
    optimizationEnabled,
    searchTitle,
    fallbackTitle,
    fallbackCover,
    fallbackDoubanId,
    searchType,
    setAvailableSources,
    setCurrentEpisodeIndex,
    setCurrentId,
    setCurrentSource,
    setDetail,
    setError,
    setLoading,
    setLoadingMessage,
    setLoadingStage,
    setNeedPrefer,
    setSourceSearchError,
    setSourceSearchLoading,
    setSpeedTestProgress,
    setVideoCover,
    setVideoDoubanId,
    setVideoTitle,
    setVideoYear,
    videoDoubanIdRef,
    videoTitle,
    videoTitleRef,
    videoYearRef,
  ]);

  return { loadAvailableSources };
}
