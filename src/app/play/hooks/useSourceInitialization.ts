'use client';

import { MutableRefObject, useCallback, useEffect, useRef } from 'react';

import { cachedGet } from '@/lib/api-cache.client';
import type { SearchResult } from '@/lib/types';

import { SpeedTestProgress } from '../types';
import {
  checkAllKeywordsMatch,
  generateSearchVariants,
} from '../utils/helpers';
import {
  dedupeSources,
  findSourceByIdentity,
  hydrateSourceDetail,
  replaceSourceDetail,
  resolveDoubanId,
} from '../utils/sourceDetails';
import { preferBestSource } from '../utils/sourcePreference';

interface DeviceInfo {
  userAgent: string;
  isIOS: boolean;
  isIOS13: boolean;
  isMobile: boolean;
}

interface SearchApiResponse {
  results: SearchResult[];
}

export interface UseSourceInitializationParams {
  currentSource: string;
  currentId: string;
  videoTitle: string;
  searchTitle: string;
  fallbackTitle?: string;
  fallbackDoubanId?: number;
  searchType: string;
  needPreferRef: MutableRefObject<boolean>;
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
  fallbackDoubanId,
  searchType,
  needPreferRef,
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
            console.log(`🔍 为自动切换源搜索其他播放源: ${query}`);
            const maxVariants = 2;
            const limitedVariants = generateSearchVariants(query.trim()).slice(
              0,
              maxVariants,
            );

            const allResults: SearchResult[] = [];
            let bestResults: SearchResult[] = [];

            for (const variant of limitedVariants) {
              try {
                const data = await cachedGet<SearchApiResponse>('/api/search', {
                  q: variant,
                });

                if (data.results && data.results.length > 0) {
                  allResults.push(...data.results);

                  const filteredResults = data.results.filter(
                    (result: SearchResult) => {
                      const queryTitle = query
                        .replaceAll(' ', '')
                        .toLowerCase();
                      const resultTitle = result.title
                        .replaceAll(' ', '')
                        .toLowerCase();
                      return (
                        resultTitle.includes(queryTitle) ||
                        queryTitle.includes(resultTitle)
                      );
                    },
                  );

                  if (filteredResults.length > 0) {
                    bestResults = filteredResults;
                    break;
                  }
                }
              } catch (e) {
                console.warn(`搜索变体 "${variant}" 失败:`, e);
              }
            }

            if (bestResults.length > 0) {
              const combined = [detailData, ...bestResults];
              const uniqueSources = dedupeSources(combined);

              console.log(`✅ 找到 ${uniqueSources.length - 1} 个其他播放源`);
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
      options?: { silent?: boolean },
    ): Promise<SearchResult[]> => {
      const silent = options?.silent === true;
      try {
        console.log('开始智能搜索，原始查询:', query);
        const searchVariants = generateSearchVariants(query.trim());
        const maxVariants = 2;
        const limitedVariants = searchVariants.slice(0, maxVariants);
        console.log(
          `生成的搜索变体: ${searchVariants.length}个，将使用前${limitedVariants.length}个`,
        );

        const allResults: SearchResult[] = [];
        let bestResults: SearchResult[] = [];

        for (const variant of limitedVariants) {
          console.log('尝试搜索变体:', variant);

          const data = await cachedGet<SearchApiResponse>('/api/search', {
            q: variant,
          }).catch((err) => {
            console.warn(`搜索变体 "${variant}" 失败:`, err.message);
            return { results: [] };
          });

          if (data.results && data.results.length > 0) {
            allResults.push(...data.results);

            const filteredResults = data.results.filter(
              (result: SearchResult) => {
                const referenceTitle = videoTitle || searchTitle || query;
                const queryTitle = referenceTitle
                  .replaceAll(' ', '')
                  .toLowerCase();
                const resultTitle = result.title
                  .replaceAll(' ', '')
                  .toLowerCase();

                const titleMatch =
                  resultTitle.includes(queryTitle) ||
                  queryTitle.includes(resultTitle) ||
                  resultTitle.replace(/\d+|[：:]/g, '') ===
                    queryTitle.replace(/\d+|[：:]/g, '') ||
                  checkAllKeywordsMatch(queryTitle, resultTitle);

                const normalizedYear = videoYearRef.current?.toLowerCase();
                const yearMatch = normalizedYear
                  ? result.year.toLowerCase() === normalizedYear
                  : true;
                const typeMatch = searchType
                  ? (searchType === 'tv' && result.episodes.length > 1) ||
                    (searchType === 'movie' && result.episodes.length === 1)
                  : true;

                return titleMatch && yearMatch && typeMatch;
              },
            );

            if (filteredResults.length > 0) {
              console.log(
                `变体 "${variant}" 找到 ${filteredResults.length} 个精确匹配结果`,
              );
              bestResults = filteredResults;
              if (filteredResults.length >= 5) {
                console.log('✓ 已找到足够多的精确匹配结果，停止搜索');
                break;
              }
            }
          }
        }

        let finalResults = bestResults;

        if (bestResults.length === 0) {
          const queryTitle = (videoTitleRef.current || '').toLowerCase().trim();
          const allCandidates = allResults;
          const englishChars = (queryTitle.match(/[a-z\s]/g) || []).length;
          const chineseChars = (queryTitle.match(/[\u4e00-\u9fff]/g) || [])
            .length;
          const isEnglishQuery = englishChars > chineseChars;

          console.log(
            `搜索语言检测: ${
              isEnglishQuery ? '英文' : '中文'
            } - "${queryTitle}"`,
          );

          let relevantMatches: SearchResult[] = [];

          if (isEnglishQuery) {
            console.log('使用英文词汇匹配策略');

            const queryWords = queryTitle
              .toLowerCase()
              .replace(/[^\w\s]/g, ' ')
              .split(/\s+/)
              .filter(
                (word) =>
                  word.length > 2 &&
                  ![
                    'the',
                    'a',
                    'an',
                    'and',
                    'or',
                    'of',
                    'in',
                    'on',
                    'at',
                    'to',
                    'for',
                    'with',
                    'by',
                  ].includes(word),
              );

            console.log('英文关键词:', queryWords);

            relevantMatches = allCandidates.filter((result) => {
              const title = result.title.toLowerCase();
              const titleWords = title
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter((word) => word.length > 1);

              const matchedWords = queryWords.filter((queryWord) =>
                titleWords.some(
                  (titleWord) =>
                    titleWord.includes(queryWord) ||
                    queryWord.includes(titleWord) ||
                    (queryWord.length > 4 &&
                      titleWord.length > 4 &&
                      queryWord.substring(0, 4) === titleWord.substring(0, 4)),
                ),
              );

              const wordMatchRatio = matchedWords.length / queryWords.length;
              if (wordMatchRatio >= 0.5) {
                console.log(
                  `英文词汇匹配 (${matchedWords.length}/${queryWords.length}): "${result.title}"`,
                );
                return true;
              }
              return false;
            });
          } else {
            console.log('使用中文宽松匹配策略');
            relevantMatches = allCandidates.filter((result) => {
              const title = result.title.toLowerCase();
              const normalizedQuery = queryTitle.replace(
                /[^\w\u4e00-\u9fff]/g,
                '',
              );
              const normalizedTitle = title.replace(/[^\w\u4e00-\u9fff]/g, '');

              if (
                normalizedTitle.includes(normalizedQuery) ||
                normalizedQuery.includes(normalizedTitle)
              ) {
                console.log(`中文包含匹配: "${result.title}"`);
                return true;
              }

              const commonChars = Array.from(normalizedQuery).filter((char) =>
                normalizedTitle.includes(char),
              ).length;
              const similarity = commonChars / normalizedQuery.length;
              if (similarity >= 0.5) {
                console.log(
                  `中文相似匹配 (${(similarity * 100).toFixed(1)}%): "${
                    result.title
                  }"`,
                );
                return true;
              }
              return false;
            });
          }

          console.log(
            `匹配结果: ${relevantMatches.length}/${allCandidates.length}`,
          );

          const maxResults = isEnglishQuery ? 5 : 20;
          if (
            relevantMatches.length > 0 &&
            relevantMatches.length <= maxResults
          ) {
            finalResults = Array.from(
              new Map(
                relevantMatches.map((item) => [
                  `${item.source}-${item.id}`,
                  item,
                ]),
              ).values(),
            );
          } else {
            console.log('没有找到合理的匹配，返回空结果');
            finalResults = [];
          }
        }

        console.log(`智能搜索完成，最终返回 ${finalResults.length} 个结果`);
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

      setSourceSearchLoading(true);
      const searchedSources = await fetchSourcesData(query, { silent: true });
      if (!isActive() || searchedSources.length === 0) return;

      const mergedSources = dedupeSources([currentDetail, ...searchedSources]);
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

        const directSourceRequested =
          Boolean(currentSource && currentId) && !needPreferRef.current;
        let sourcesInfo: SearchResult[] = [];
        let ignoreProvidedSource = false;

        if (directSourceRequested) {
          const providedSourceDetail = await fetchSourceDetail(
            currentSource,
            currentId,
            {
              silent: true,
              includeRelatedSources: false,
            },
          );
          if (!isActive()) return;

          if (providedSourceDetail.length > 0) {
            sourcesInfo = providedSourceDetail;
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
            sourcesInfo = await fetchSourcesData(query);
          }
          if (!isActive()) return;

          if (
            currentSource &&
            currentId &&
            !findSourceByIdentity(sourcesInfo, {
              source: currentSource,
              id: currentId,
            })
          ) {
            const providedSourceDetail = await fetchSourceDetail(
              currentSource,
              currentId,
              {
                silent: true,
                includeRelatedSources: false,
              },
            );
            if (!isActive()) return;
            if (providedSourceDetail.length > 0) {
              sourcesInfo = providedSourceDetail;
            } else {
              ignoreProvidedSource = true;
              console.warn('提供的 source/id 不可用，继续使用站内搜索结果', {
                source: currentSource,
                id: currentId,
              });
            }
          }
        }

        if (sourcesInfo.length === 0) {
          failInitialization(new Error('未找到匹配结果'));
          return;
        }

        setAvailableSources(sourcesInfo);

        let detailData: SearchResult = sourcesInfo[0];
        if (
          currentSource &&
          currentId &&
          !needPreferRef.current &&
          !ignoreProvidedSource
        ) {
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
          (!currentSource ||
            !currentId ||
            needPreferRef.current ||
            ignoreProvidedSource) &&
          optimizationEnabled
        ) {
          setLoadingStage('preferring');
          setLoadingMessage('⚡ 正在优选最佳播放源...');

          detailData = await preferBestSource(sourcesInfo, {
            deviceInfo,
            setSpeedTestProgress,
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

        console.log(detailData.source, detailData.id);

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

        setVideoYear(resolvedYear);
        setVideoTitle(resolvedTitle);
        setVideoCover(detailData.poster);
        const resolvedDoubanId = resolveDoubanId(
          detailData,
          videoDoubanIdRef.current || fallbackDoubanId || null,
        );
        const resolvedDetail: SearchResult = {
          ...detailData,
          title: resolvedTitle,
          year: resolvedYear,
          douban_id: resolvedDoubanId || detailData.douban_id,
        };

        setVideoDoubanId(resolvedDoubanId);
        setDetail(resolvedDetail);
        sourceSearchLoaderRef.current = () =>
          enrichAvailableSources(resolvedDetail);
        if (directSourceRequested) {
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
    needPreferRef,
    optimizationEnabled,
    searchTitle,
    fallbackTitle,
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
