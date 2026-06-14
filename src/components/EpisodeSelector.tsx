/* eslint-disable @next/next/no-img-element */

import { useRouter } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import {
  EpisodeSourceCheckResult,
  planEpisodeSourceChecks,
  probePlayableMediaUrl,
  runEpisodeSourceChecks,
} from '@/app/play/utils/episodeSourceCheck';

import { VirtualGrid } from './VirtualGrid';

// 定义视频信息类型
interface VideoInfo {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean; // 添加错误状态标识
  // ✅ 新增：完整的流信息
  levels?: unknown;
  maxResolution?: string;
  minResolution?: string;
  maxBandwidth?: number;
  minBandwidth?: number;
}

interface EpisodeSelectorProps {
  /** 总集数 */
  totalEpisodes: number;
  /** 剧集标题 */
  episodes_titles: string[];
  /** 每页显示多少集，默认 50 */
  episodesPerPage?: number;
  /** 当前选中的集数（1 开始） */
  value?: number;
  /** 用户点击选集后的回调 */
  onChange?: (episodeNumber: number) => void;
  /** 换源相关 */
  onSourceChange?: (source: string, id: string, title: string) => void;
  currentSource?: string;
  currentId?: string;
  videoTitle?: string;
  videoYear?: string;
  availableSources?: SearchResult[];
  onLoadSources?: () => boolean | Promise<boolean>;
  sourceSearchLoading?: boolean;
  sourceSearchError?: string | null;
  /** 预计算的测速结果，避免重复测速 */
  precomputedVideoInfo?: Map<string, VideoInfo>;
}

/**
 * 选集组件，支持分页、自动滚动聚焦当前分页标签，以及换源功能。
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  totalEpisodes,
  episodes_titles,
  episodesPerPage = 50,
  value = 1,
  onChange,
  onSourceChange,
  currentSource,
  currentId,
  videoTitle,
  availableSources = [],
  onLoadSources,
  sourceSearchLoading = false,
  sourceSearchError = null,
  precomputedVideoInfo,
}) => {
  const router = useRouter();
  const pageCount = Math.ceil(totalEpisodes / episodesPerPage);

  // 存储每个源的视频信息
  const [videoInfoMap, setVideoInfoMap] = useState<Map<string, VideoInfo>>(
    new Map(),
  );
  const [attemptedSources, setAttemptedSources] = useState<Set<string>>(
    new Set(),
  );

  // ==================== "检查当前集" 状态 ====================
  const [episodeCheckResults, setEpisodeCheckResults] = useState<
    Map<string, EpisodeSourceCheckResult>
  >(new Map());
  const episodeCheckResultsRef = useRef<Map<string, EpisodeSourceCheckResult>>(
    new Map(),
  );
  useEffect(() => {
    episodeCheckResultsRef.current = episodeCheckResults;
  }, [episodeCheckResults]);

  const [episodeCheckRun, setEpisodeCheckRun] = useState<{
    runId: number;
    status: 'idle' | 'running' | 'cancelling' | 'done' | 'cancelled';
    episodeIndex: number | null;
    total: number;
    completed: number;
    currentSourceKey?: string;
  }>({
    runId: 0,
    status: 'idle',
    episodeIndex: null,
    total: 0,
    completed: 0,
  });

  const episodeCheckAbortRef = useRef<AbortController | null>(null);
  const episodeCheckRunIdRef = useRef(0);
  const lastEpisodeIndexRef = useRef<number>(value - 1);

  // 使用 ref 来避免闭包问题
  const attemptedSourcesRef = useRef<Set<string>>(new Set());
  const videoInfoMapRef = useRef<Map<string, VideoInfo>>(new Map());
  const sourceSearchRequestKeyRef = useRef<string>('');

  // 同步状态到 ref
  useEffect(() => {
    attemptedSourcesRef.current = attemptedSources;
  }, [attemptedSources]);

  useEffect(() => {
    videoInfoMapRef.current = videoInfoMap;
  }, [videoInfoMap]);

  // 主要的 tab 状态：'episodes' 或 'sources'
  // 当只有一集时默认展示 "换源"，并隐藏 "选集" 标签
  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>(
    totalEpisodes > 1 ? 'episodes' : 'sources',
  );

  // 当前分页索引（0 开始）
  const initialPage = Math.floor((value - 1) / episodesPerPage);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  // 是否倒序显示
  const [descending, setDescending] = useState<boolean>(false);

  // 根据 descending 状态计算实际显示的分页索引
  const displayPage = useMemo(() => {
    if (descending) {
      return pageCount - 1 - currentPage;
    }
    return currentPage;
  }, [currentPage, descending, pageCount]);

  // 🔥 修复：当当前集数变化时，自动切换到对应的页面
  // 🔥 修复：只有在选集tab激活时才进行自动切换，避免干扰用户手动切换tab
  useEffect(() => {
    // 只有在选集tab激活时才进行自动切换
    if (activeTab !== 'episodes') return;

    const newPage = Math.floor((value - 1) / episodesPerPage);
    // 确保新计算的页码在有效范围内
    const validPage = Math.max(0, Math.min(newPage, pageCount - 1));

    if (validPage !== currentPage) {
      console.log('[EpisodeSelector] 当前集数变化，自动切换页面', {
        episode: value,
        oldPage: currentPage,
        newPage: validPage,
        episodesPerPage,
        descending,
        activeTab,
      });
      setCurrentPage(validPage);
    }
  }, [value, episodesPerPage, pageCount]); // 移除currentPage依赖避免循环触发

  // 获取视频信息的函数 - 移除 attemptedSources 依赖避免不必要的重新创建
  const getVideoInfo = useCallback(
    async (source: SearchResult) => {
      const sourceKey = `${source.source}-${source.id}`;

      // 使用 ref 获取最新的状态，避免闭包问题
      if (attemptedSourcesRef.current.has(sourceKey)) {
        return;
      }

      // 获取当前集的地址；若不存在则回退到第一集
      if (!source.episodes || source.episodes.length === 0) {
        return;
      }
      const episodeIndex = Math.min(
        Math.max(value - 1, 0),
        source.episodes.length - 1,
      );
      const episodeData = source.episodes[episodeIndex] || source.episodes[0];

      const resolveProbeUrl = async (): Promise<string | null> => {
        const raw = (episodeData || '').trim();
        if (!raw || raw.startsWith('magnet:')) {
          return null;
        }

        return raw;
      };

      // 标记为已尝试
      setAttemptedSources((prev) => new Set(prev).add(sourceKey));

      try {
        const probeUrl = await resolveProbeUrl();
        if (!probeUrl || !/^https?:\/\//i.test(probeUrl)) {
          throw new Error('播放地址无效');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        try {
          const info = await probePlayableMediaUrl(probeUrl, {
            timeoutMs: 6000,
            signal: controller.signal,
          });
          setVideoInfoMap((prev) =>
            new Map(prev).set(sourceKey, {
              quality: info.quality,
              loadSpeed: info.loadSpeed,
              pingTime: info.pingTimeMs,
            }),
          );
        } finally {
          clearTimeout(timeoutId);
        }
      } catch {
        // 使用与“检查当前集”一致的口径：探测失败即标记为异常
        setVideoInfoMap((prev) =>
          new Map(prev).set(sourceKey, {
            quality: '错误',
            loadSpeed: '未知',
            pingTime: 0,
            hasError: true,
          }),
        );
      }
    },
    [value],
  );

  // 当有预计算结果时，先合并到videoInfoMap中
  useEffect(() => {
    if (precomputedVideoInfo && precomputedVideoInfo.size > 0) {
      // 仅作为首屏占位展示，后续仍会走一次真实可播探测覆盖结果
      setVideoInfoMap((prev) => {
        const newMap = new Map(prev);
        precomputedVideoInfo.forEach((value, key) => {
          newMap.set(key, value);
        });
        return newMap;
      });
    }
  }, [precomputedVideoInfo]);

  // 读取本地"优选和测速"开关，默认开启
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  });

  // 当切换到换源tab并且有源数据时，异步获取视频信息 - 修复无限循环问题
  useEffect(() => {
    const fetchVideoInfosInBatches = async () => {
      if (
        !optimizationEnabled || // 若关闭测速则直接退出
        episodeCheckRun.status === 'running' ||
        episodeCheckRun.status === 'cancelling' ||
        activeTab !== 'sources' ||
        availableSources.length === 0
      )
        return;

      // 筛选出尚未测速的播放源
      const pendingSources = availableSources.filter((source) => {
        const sourceKey = `${source.source}-${source.id}`;
        return !attemptedSourcesRef.current.has(sourceKey);
      });

      if (pendingSources.length === 0) return;

      const batchSize = Math.ceil(pendingSources.length / 2);

      for (let start = 0; start < pendingSources.length; start += batchSize) {
        const batch = pendingSources.slice(start, start + batchSize);
        await Promise.all(batch.map(getVideoInfo));
      }
    };

    fetchVideoInfosInBatches();
    // 修复依赖项：移除 availableSources，使用长度避免对象引用变化
  }, [
    activeTab,
    availableSources.length,
    episodeCheckRun.status,
    getVideoInfo,
    optimizationEnabled,
  ]);

  const isEpisodeChecking =
    episodeCheckRun.status === 'running' ||
    episodeCheckRun.status === 'cancelling';

  const cancelEpisodeCheck = useCallback(() => {
    if (!episodeCheckAbortRef.current) return;
    try {
      setEpisodeCheckRun((prev) =>
        prev.status === 'running' ? { ...prev, status: 'cancelling' } : prev,
      );
      episodeCheckAbortRef.current.abort();
    } catch {
      // ignore
    }
  }, []);

  // 🎯 切集时清理检查状态，避免结果误读
  // 注意：这里不能依赖 isEpisodeChecking，否则会在开始检查时触发并立刻取消
  useEffect(() => {
    const episodeIndex = value - 1;
    if (lastEpisodeIndexRef.current === episodeIndex) return;
    lastEpisodeIndexRef.current = episodeIndex;

    // 失效当前 run（防止异步回写污染新集）
    episodeCheckRunIdRef.current += 1;

    // 取消当前检查（若存在）
    if (episodeCheckAbortRef.current) {
      try {
        episodeCheckAbortRef.current.abort();
      } catch {
        // ignore
      }
      episodeCheckAbortRef.current = null;
    }

    setEpisodeCheckResults(new Map());
    setEpisodeCheckRun({
      runId: episodeCheckRunIdRef.current,
      status: 'idle',
      episodeIndex,
      total: 0,
      completed: 0,
      currentSourceKey: undefined,
    });
  }, [value]);

  useEffect(() => {
    return () => {
      cancelEpisodeCheck();
    };
  }, [cancelEpisodeCheck]);

  const startEpisodeCheck = useCallback(async () => {
    // 防止重复触发
    if (isEpisodeChecking) return;

    // 新的 runId：用于防止异步回写污染状态
    episodeCheckRunIdRef.current += 1;
    const runId = episodeCheckRunIdRef.current;

    const episodeIndex = value - 1;
    const plan = planEpisodeSourceChecks({
      sources: availableSources,
      episodeIndex,
      currentSource,
      currentId,
    });

    // 初始化运行态
    setEpisodeCheckResults(new Map());
    setEpisodeCheckRun({
      runId,
      status: 'running',
      episodeIndex,
      total: plan.length,
      completed: 0,
      currentSourceKey: undefined,
    });

    const controller = new AbortController();
    episodeCheckAbortRef.current = controller;

    const isFinal = (s: EpisodeSourceCheckResult['status']) =>
      s === 'success' || s === 'error' || s === 'skipped' || s === 'cancelled';

    const onUpdate = (next: EpisodeSourceCheckResult) => {
      setEpisodeCheckResults((prev) => {
        const nextMap = new Map(prev);
        nextMap.set(next.sourceKey, next);
        return nextMap;
      });

      // 进度更新：只在进入最终态时 +1，避免 checking -> success 重复计数
      const prev = episodeCheckResultsRef.current.get(next.sourceKey);
      const wasFinal = prev ? isFinal(prev.status) : false;
      const nowFinal = isFinal(next.status);
      if (!wasFinal && nowFinal) {
        setEpisodeCheckRun((run) =>
          run.runId !== runId
            ? run
            : {
                ...run,
                completed: Math.min(run.total, run.completed + 1),
              },
        );
      }

      if (next.status === 'checking') {
        setEpisodeCheckRun((run) =>
          run.runId !== runId
            ? run
            : {
                ...run,
                currentSourceKey: next.sourceKey,
              },
        );
      }
    };

    try {
      await runEpisodeSourceChecks({
        plan,
        signal: controller.signal,
        resolveUrl: async (item, signal) => {
          if (signal.aborted) {
            return { skippedReason: '已取消' };
          }
          const raw = (item.episodeData || '').trim();
          if (!raw) {
            return { skippedReason: '播放地址为空' };
          }
          if (raw.startsWith('magnet:')) {
            return { skippedReason: '磁力链接不支持检测' };
          }
          return { url: raw };
        },
        probeUrl: async (url, signal) => {
          const metrics = await probePlayableMediaUrl(url, {
            timeoutMs: 6000,
            signal,
          });
          return metrics;
        },
        onUpdate,
      });

      setEpisodeCheckRun((run) =>
        run.runId !== runId
          ? run
          : {
              ...run,
              status: controller.signal.aborted ? 'cancelled' : 'done',
              currentSourceKey: undefined,
            },
      );
    } catch {
      // 理论上 runEpisodeSourceChecks 内部不会抛出，兜底一下
      setEpisodeCheckRun((run) =>
        run.runId !== runId
          ? run
          : {
              ...run,
              status: controller.signal.aborted ? 'cancelled' : 'done',
              currentSourceKey: undefined,
            },
      );
    } finally {
      // 仅清理当前 run 的 controller，避免与新 run 冲突
      if (episodeCheckRunIdRef.current === runId) {
        episodeCheckAbortRef.current = null;
      }
    }
  }, [availableSources, currentId, currentSource, isEpisodeChecking, value]);

  // 升序分页标签
  const categoriesAsc = useMemo(() => {
    return Array.from({ length: pageCount }, (_, i) => {
      const start = i * episodesPerPage + 1;
      const end = Math.min(start + episodesPerPage - 1, totalEpisodes);
      return { start, end };
    });
  }, [pageCount, episodesPerPage, totalEpisodes]);

  // 根据 descending 状态决定分页标签的排序和内容
  const categories = useMemo(() => {
    if (descending) {
      // 倒序时，label 也倒序显示
      return [...categoriesAsc]
        .reverse()
        .map(({ start, end }) => `${end}-${start}`);
    }
    return categoriesAsc.map(({ start, end }) => `${start}-${end}`);
  }, [categoriesAsc, descending]);

  // 🔥 修复：当totalEpisodes变化时，确保tab状态合理（避免循环依赖）
  useEffect(() => {
    if (totalEpisodes <= 1 && activeTab === 'episodes') {
      // 如果只有1集且当前在选集tab，自动切换到换源tab
      console.log('[EpisodeSelector] 单集视频，自动切换到换源tab');
      setActiveTab('sources');
    }
  }, [totalEpisodes]); // 只依赖totalEpisodes，避免与activeTab变化产生循环

  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 添加鼠标悬停状态管理
  const [isCategoryHovered, setIsCategoryHovered] = useState(false);

  // 阻止页面竖向滚动
  const preventPageScroll = useCallback(
    (e: WheelEvent) => {
      if (isCategoryHovered) {
        e.preventDefault();
      }
    },
    [isCategoryHovered],
  );

  // 处理滚轮事件，实现横向滚动
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (isCategoryHovered && categoryContainerRef.current) {
        e.preventDefault(); // 阻止默认的竖向滚动

        const container = categoryContainerRef.current;
        const scrollAmount = e.deltaY * 2; // 调整滚动速度

        // 根据滚轮方向进行横向滚动
        container.scrollBy({
          left: scrollAmount,
          behavior: 'smooth',
        });
      }
    },
    [isCategoryHovered],
  );

  // 添加全局wheel事件监听器
  useEffect(() => {
    if (isCategoryHovered) {
      // 鼠标悬停时阻止页面滚动
      document.addEventListener('wheel', preventPageScroll, { passive: false });
      document.addEventListener('wheel', handleWheel, { passive: false });
    } else {
      // 鼠标离开时恢复页面滚动
      document.removeEventListener('wheel', preventPageScroll);
      document.removeEventListener('wheel', handleWheel);
    }

    return () => {
      document.removeEventListener('wheel', preventPageScroll);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [isCategoryHovered, preventPageScroll, handleWheel]);

  // 当分页切换时，将激活的分页标签滚动到视口中间
  useEffect(() => {
    const btn = buttonRefs.current[displayPage];
    const container = categoryContainerRef.current;
    if (btn && container) {
      // 手动计算滚动位置，只滚动分页标签容器
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;

      // 计算按钮相对于容器的位置
      const btnLeft = btnRect.left - containerRect.left + scrollLeft;
      const btnWidth = btnRect.width;
      const containerWidth = containerRect.width;

      // 计算目标滚动位置，使按钮居中
      const targetScrollLeft = btnLeft - (containerWidth - btnWidth) / 2;

      // 平滑滚动到目标位置
      container.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth',
      });
    }
  }, [displayPage, pageCount]);

  // 处理选集tab点击
  const handleEpisodeTabClick = useCallback(() => {
    console.log('[EpisodeSelector] 选集tab被点击');
    setActiveTab('episodes');
  }, []);

  const requestSourceSearchIfNeeded = useCallback(() => {
    if (!onLoadSources || sourceSearchLoading || availableSources.length > 1) {
      return;
    }

    const requestKey = `${currentSource || ''}+${currentId || ''}+${
      videoTitle || ''
    }`;
    if (sourceSearchRequestKeyRef.current === requestKey) {
      return;
    }

    sourceSearchRequestKeyRef.current = requestKey;
    void Promise.resolve(onLoadSources()).then((started) => {
      if (!started && sourceSearchRequestKeyRef.current === requestKey) {
        sourceSearchRequestKeyRef.current = '';
      }
    });
  }, [
    availableSources.length,
    currentId,
    currentSource,
    onLoadSources,
    sourceSearchLoading,
    videoTitle,
  ]);

  useEffect(() => {
    if (activeTab === 'sources') {
      requestSourceSearchIfNeeded();
    }
  }, [activeTab, requestSourceSearchIfNeeded]);

  // 处理换源tab点击，只在点击时才搜索
  const handleSourceTabClick = useCallback(() => {
    console.log('[EpisodeSelector] 换源tab被点击');
    setActiveTab('sources');
    requestSourceSearchIfNeeded();
  }, [requestSourceSearchIfNeeded]);

  const handleCategoryClick = useCallback(
    (index: number) => {
      if (descending) {
        // 在倒序时，需要将显示索引转换为实际索引
        setCurrentPage(pageCount - 1 - index);
      } else {
        setCurrentPage(index);
      }
    },
    [descending, pageCount],
  );

  const handleEpisodeClick = useCallback(
    (episodeNumber: number) => {
      onChange?.(episodeNumber);
    },
    [onChange],
  );

  const handleSourceClick = useCallback(
    (source: SearchResult) => {
      onSourceChange?.(source.source, source.id, source.title);
    },
    [onSourceChange],
  );

  const currentStart = currentPage * episodesPerPage + 1;
  const currentEnd = Math.min(
    currentStart + episodesPerPage - 1,
    totalEpisodes,
  );

  // 调试信息
  // 调试信息
  // console.log('[EpisodeSelector] 渲染状态', {
  //   totalEpisodes,
  //   activeTab,
  //   currentPage,
  //   displayPage,
  //   hasEpisodesTab: totalEpisodes > 1
  // });

  return (
    <div className='md:ml-2 px-4 py-0 h-full max-h-[350px] md:max-h-[450px] lg:max-h-[520px] xl:max-h-[600px] 2xl:max-h-[700px] rounded-xl bg-black/10 dark:bg-white/5 flex flex-col border border-white/0 dark:border-white/30 overflow-hidden'>
      {/* 主要的 Tab 切换 - 美化版本 */}
      <div className='flex mb-1 -mx-4 sm:-mx-6 flex-shrink-0 relative'>
        {totalEpisodes > 1 && (
          <div
            onClick={handleEpisodeTabClick}
            className={`group flex-1 py-2 sm:py-3 px-4 sm:px-6 text-center cursor-pointer transition-all duration-300 font-semibold relative overflow-hidden
              ${
                activeTab === 'episodes'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-700 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400'
              }
            `.trim()}
          >
            {/* 激活态背景光晕 */}
            {activeTab === 'episodes' && (
              <div className='absolute inset-0 bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 -z-10'></div>
            )}
            {/* 非激活态背景 */}
            {activeTab !== 'episodes' && (
              <div className='absolute inset-0 bg-gray-100/50 dark:bg-gray-800/50 group-hover:bg-gray-100 dark:group-hover:bg-gray-800/70 transition-colors duration-300 -z-10'></div>
            )}
            {/* 悬浮光效 */}
            <div className='absolute inset-0 bg-gradient-to-r from-transparent via-green-100/0 to-transparent dark:via-green-500/0 group-hover:via-green-100/50 dark:group-hover:via-green-500/10 transition-all duration-300 -z-10'></div>
            <span className='relative z-10 font-bold text-sm sm:font-bold'>
              选集
            </span>
          </div>
        )}
        <div
          onClick={handleSourceTabClick}
          className={`group flex-1 py-2 sm:py-3 px-4 sm:px-6 text-center cursor-pointer transition-all duration-300 font-semibold relative overflow-hidden
            ${
              activeTab === 'sources'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400'
            }
          `.trim()}
        >
          {/* 激活态背景光晕 */}
          {activeTab === 'sources' && (
            <div className='absolute inset-0 bg-gradient-to-r from-blue-50 via-cyan-50 to-sky-50 dark:from-blue-900/20 dark:via-cyan-900/20 dark:to-sky-900/20 -z-10'></div>
          )}
          {/* 非激活态背景 */}
          {activeTab !== 'sources' && (
            <div className='absolute inset-0 bg-gray-100/50 dark:bg-gray-800/50 group-hover:bg-gray-100 dark:group-hover:bg-gray-800/70 transition-colors duration-300 -z-10'></div>
          )}
          {/* 悬浮光效 */}
          <div className='absolute inset-0 bg-gradient-to-r from-transparent via-blue-100/0 to-transparent dark:via-blue-500/0 group-hover:via-blue-100/50 dark:group-hover:via-blue-500/10 transition-all duration-300 -z-10'></div>
          <span className='relative z-10 font-bold text-sm sm:font-bold'>
            换源
          </span>
        </div>
      </div>

      {/* 选集 Tab 内容 */}
      {activeTab === 'episodes' && (
        <div className='flex flex-col min-h-0 flex-1'>
          {/* 分类标签 */}
          <div className='flex items-center gap-4 mb-4 border-b border-gray-300 dark:border-gray-700 -mx-6 px-6 flex-shrink-0'>
            <div
              className='flex-1 overflow-x-auto'
              ref={categoryContainerRef}
              onMouseEnter={() => setIsCategoryHovered(true)}
              onMouseLeave={() => setIsCategoryHovered(false)}
            >
              <div className='flex gap-2 min-w-max'>
                {categories.map((label, idx) => {
                  const isActive = idx === displayPage;
                  return (
                    <button
                      key={label}
                      ref={(el) => {
                        buttonRefs.current[idx] = el;
                      }}
                      onClick={() => handleCategoryClick(idx)}
                      className={`w-20 relative py-2 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 text-center 
                        ${
                          isActive
                            ? 'text-green-500 dark:text-green-400'
                            : 'text-gray-700 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400'
                        }
                      `.trim()}
                    >
                      {label}
                      {isActive && (
                        <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 dark:bg-green-400' />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 向上/向下按钮 */}
            <button
              className='flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-gray-700 hover:text-green-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-green-400 dark:hover:bg-white/20 transition-colors transform translate-y-[-4px]'
              onClick={() => {
                // 切换集数排序（正序/倒序）
                setDescending((prev) => !prev);
              }}
            >
              <svg
                className='w-4 h-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4'
                />
              </svg>
            </button>
          </div>

          {/* 集数网格 - 虚拟化 */}
          <VirtualGrid
            items={(() => {
              const len = currentEnd - currentStart + 1;
              return Array.from({ length: len }, (_, i) =>
                descending ? currentEnd - i : currentStart + i,
              );
            })()}
            itemHeight={40}
            containerHeight={300}
            gap={12}
            columns={6}
            renderItem={(episodeNumber) => {
              const isActive = episodeNumber === value;
              return (
                <button
                  key={episodeNumber}
                  onClick={() => handleEpisodeClick(episodeNumber - 1)}
                  className={`group h-10 min-w-10 px-3 py-2 flex items-center justify-center text-sm font-semibold rounded-lg transition-all duration-300 whitespace-nowrap font-mono relative overflow-hidden
                    ${
                      isActive
                        ? 'bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 text-white shadow-lg shadow-green-500/30 dark:from-green-600 dark:via-emerald-600 dark:to-teal-600 dark:shadow-green-500/20'
                        : 'bg-gradient-to-r from-gray-200 to-gray-100 text-gray-700 hover:from-gray-300 hover:to-gray-200 hover:scale-105 hover:shadow-md dark:from-white/10 dark:to-white/5 dark:text-gray-300 dark:hover:from-white/20 dark:hover:to-white/15'
                    }`.trim()}
                >
                  {isActive && (
                    <div className='absolute inset-0 bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 opacity-30 blur'></div>
                  )}
                  {!isActive && (
                    <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/0 to-transparent group-hover:via-white/20 dark:group-hover:via-white/10 transition-all duration-300'></div>
                  )}
                  <span className='relative z-10'>
                    {(() => {
                      const title = episodes_titles?.[episodeNumber - 1];
                      if (!title) {
                        return episodeNumber;
                      }
                      const match = title.match(/(?:第)?(\d+)(?:集|话)/);
                      if (match) {
                        return match[1];
                      }
                      return title;
                    })()}
                  </span>
                </button>
              );
            }}
          />
        </div>
      )}

      {/* 换源 Tab 内容 */}
      {activeTab === 'sources' && (
        <div className='flex flex-col flex-1 mt-2 sm:mt-4 min-h-0'>
          {sourceSearchLoading && (
            <div className='flex items-center justify-center py-8'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
              <span className='ml-2 text-sm text-gray-600 dark:text-gray-300'>
                搜索中...
              </span>
            </div>
          )}

          {sourceSearchError && (
            <div className='flex items-center justify-center py-8'>
              <div className='text-center'>
                <div className='text-red-500 text-2xl mb-2'>⚠️</div>
                <p className='text-sm text-red-600 dark:text-red-400'>
                  {sourceSearchError}
                </p>
              </div>
            </div>
          )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length === 0 && (
              <div className='flex items-center justify-center py-8'>
                <div className='text-center'>
                  <div className='text-gray-400 text-2xl mb-2'>📺</div>
                  <p className='text-sm text-gray-600 dark:text-gray-300'>
                    暂无可用的换源
                  </p>
                </div>
              </div>
            )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length > 0 && (
              <div className='flex flex-col flex-1 min-h-0'>
                {/* "检查当前集" 控制条 */}
                <div className='flex items-center justify-between gap-2 px-2 sm:px-3 py-2 rounded-lg border border-blue-200/30 dark:border-blue-800/30 bg-gradient-to-r from-blue-50/60 via-cyan-50/40 to-sky-50/60 dark:from-blue-900/20 dark:via-cyan-900/10 dark:to-sky-900/20 mb-2'>
                  <div className='min-w-0 flex-1'>
                    <div className='text-xs text-gray-700 dark:text-gray-200 font-semibold truncate'>
                      检查当前集：第{value}集
                    </div>
                    <div className='text-[10px] text-gray-500 dark:text-gray-400 truncate'>
                      {isEpisodeChecking
                        ? `检查中 ${episodeCheckRun.completed}/${episodeCheckRun.total}`
                        : episodeCheckRun.status === 'done'
                          ? `已完成 ${episodeCheckRun.completed}/${episodeCheckRun.total}`
                          : episodeCheckRun.status === 'cancelled'
                            ? `已取消 ${episodeCheckRun.completed}/${episodeCheckRun.total}`
                            : '点击后将按顺序检测每个源'}
                    </div>
                  </div>
                  <div className='flex items-center gap-2 flex-shrink-0'>
                    {isEpisodeChecking ? (
                      <button
                        type='button'
                        onClick={cancelEpisodeCheck}
                        className='px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-200/80 hover:bg-gray-200 text-gray-700 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-200 transition-colors'
                      >
                        取消
                      </button>
                    ) : (
                      <button
                        type='button'
                        onClick={startEpisodeCheck}
                        className='px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-sm'
                      >
                        {episodeCheckRun.status === 'done' ||
                        episodeCheckRun.status === 'cancelled'
                          ? '重新检查'
                          : '检查'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 固定高度的滚动详情列表 */}
                <div className='flex-1 min-h-0 overflow-y-auto space-y-1 sm:space-y-2'>
                  {planEpisodeSourceChecks({
                    sources: availableSources,
                    episodeIndex: value - 1,
                    currentSource,
                    currentId,
                  })
                    .map((item) => item.source)
                    .map((source, index) => {
                      const isCurrentSource =
                        source.source?.toString() ===
                          currentSource?.toString() &&
                        source.id?.toString() === currentId?.toString();
                      return (
                        <div
                          key={`${source.source}-${source.id}`}
                          onClick={() =>
                            !isCurrentSource && handleSourceClick(source)
                          }
                          className={`group flex items-start gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-3 rounded-lg sm:rounded-xl transition-all select-none duration-300 relative overflow-hidden
                      ${
                        isCurrentSource
                          ? 'bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/30 dark:via-emerald-900/30 dark:to-teal-900/30 border-2 border-green-500/50 dark:border-green-400/50 shadow-lg shadow-green-500/10'
                          : 'bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-white/5 dark:to-white/10 hover:from-blue-50 hover:to-cyan-50 dark:hover:from-blue-900/20 dark:hover:to-cyan-900/20 hover:scale-[1.02] hover:shadow-md cursor-pointer border border-gray-200/50 dark:border-white/10'
                      }`.trim()}
                        >
                          {/* 当前源标记 */}
                          {isCurrentSource && (
                            <div className='absolute top-1 sm:top-2 right-1 sm:right-2 z-10'>
                              <div className='relative'>
                                <div className='absolute inset-0 bg-green-500 rounded-full blur opacity-60 animate-pulse'></div>
                                <div className='relative bg-gradient-to-r from-green-500 to-emerald-500 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-semibold shadow-lg'>
                                  当前源
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 悬浮光效 */}
                          {!isCurrentSource && (
                            <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/5 transition-all duration-500 pointer-events-none'></div>
                          )}

                          {/* 封面 */}
                          <div className='flex-shrink-0 w-10 h-14 sm:w-12 sm:h-20 bg-gradient-to-br from-gray-300 to-gray-200 dark:from-gray-600 dark:to-gray-700 rounded-md sm:rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow duration-300'>
                            {source.episodes && source.episodes.length > 0 && (
                              <img
                                src={processImageUrl(source.poster)}
                                alt={source.title}
                                className='w-full h-full object-cover'
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            )}
                          </div>

                          {/* 信息区域 */}
                          <div className='flex-1 min-w-0 flex flex-col justify-between h-14 sm:h-20'>
                            {/* 标题和分辨率 - 顶部 */}
                            <div className='flex items-start justify-between gap-1 sm:gap-3 h-5 sm:h-6'>
                              <div className='flex-1 min-w-0 relative group/title'>
                                <h3 className='font-medium text-xs sm:text-sm truncate text-gray-900 dark:text-gray-100 leading-none'>
                                  {source.title}
                                </h3>
                                {/* 标题级别的 tooltip - 第一个元素不显示 */}
                                {index !== 0 && (
                                  <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 sm:px-3 py-1 bg-gray-800 text-white text-[10px] sm:text-xs rounded-md shadow-lg opacity-0 invisible group-hover/title:opacity-100 group-hover/title:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap z-[500] pointer-events-none'>
                                    {source.title}
                                    <div className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'></div>
                                  </div>
                                )}
                              </div>
                              {(() => {
                                const sourceKey = `${source.source}-${source.id}`;
                                const check =
                                  episodeCheckResults.get(sourceKey);

                                if (check && check.episodeIndex === value - 1) {
                                  const status = check.status;
                                  const label =
                                    status === 'checking'
                                      ? '检查中'
                                      : status === 'success'
                                        ? check.quality &&
                                          check.quality !== '未知'
                                          ? `可播 ${check.quality}`
                                          : '可播放'
                                        : status === 'skipped'
                                          ? check.message || '跳过'
                                          : status === 'cancelled'
                                            ? '已取消'
                                            : '异常';

                                  const className =
                                    status === 'checking'
                                      ? 'bg-blue-500/10 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400'
                                      : status === 'success'
                                        ? 'bg-green-500/10 dark:bg-green-400/20 text-green-600 dark:text-green-400'
                                        : status === 'skipped' ||
                                            status === 'cancelled'
                                          ? 'bg-gray-500/10 dark:bg-gray-400/20 text-gray-600 dark:text-gray-300'
                                          : 'bg-red-500/10 dark:bg-red-400/20 text-red-600 dark:text-red-400';

                                  return (
                                    <div
                                      title={check.details || check.message}
                                      className={`${className} px-1 sm:px-1.5 py-0 rounded text-[10px] sm:text-xs flex-shrink-0 min-w-[70px] sm:min-w-[80px] text-center`}
                                    >
                                      {label}
                                    </div>
                                  );
                                }

                                const videoInfo = videoInfoMap.get(sourceKey);

                                if (videoInfo && videoInfo.quality !== '未知') {
                                  if (videoInfo.hasError) {
                                    return (
                                      <div className='bg-gray-500/10 dark:bg-gray-400/20 text-red-600 dark:text-red-400 px-1 sm:px-1.5 py-0 rounded text-[10px] sm:text-xs flex-shrink-0 min-w-[40px] sm:min-w-[50px] text-center'>
                                        检测失败
                                      </div>
                                    );
                                  } else {
                                    // 根据分辨率设置不同颜色：2K、4K为紫色，1080p、720p为绿色，其他为黄色
                                    const isUltraHigh = ['4K', '2K'].includes(
                                      videoInfo.quality,
                                    );
                                    const isHigh = ['1080p', '720p'].includes(
                                      videoInfo.quality,
                                    );
                                    const textColorClasses = isUltraHigh
                                      ? 'text-purple-600 dark:text-purple-400'
                                      : isHigh
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-yellow-600 dark:text-yellow-400';

                                    return (
                                      <div
                                        className={`bg-gray-500/10 dark:bg-gray-400/20 ${textColorClasses} px-1 sm:px-1.5 py-0 rounded text-[10px] sm:text-xs flex-shrink-0 min-w-[40px] sm:min-w-[50px] text-center`}
                                      >
                                        {videoInfo.quality}
                                      </div>
                                    );
                                  }
                                }

                                return null;
                              })()}
                            </div>

                            {/* 源名称和集数信息 - 垂直居中 */}
                            <div className='flex items-center justify-between'>
                              <span className='text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 border border-gray-500/60 rounded text-gray-700 dark:text-gray-300'>
                                {source.source_name}
                              </span>
                              {source.episodes.length > 1 && (
                                <span className='text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium'>
                                  {source.episodes.length} 集
                                </span>
                              )}
                            </div>

                            {/* 网络信息 - 底部 */}
                            <div className='flex items-end h-5 sm:h-6'>
                              {(() => {
                                const sourceKey = `${source.source}-${source.id}`;
                                const check =
                                  episodeCheckResults.get(sourceKey);

                                if (check && check.episodeIndex === value - 1) {
                                  if (check.status === 'success') {
                                    return (
                                      <div className='flex items-end gap-1 sm:gap-3 text-[10px] sm:text-xs'>
                                        <div className='text-green-600 dark:text-green-400 font-medium text-[10px] sm:text-xs'>
                                          {check.loadSpeed || '未知'}
                                        </div>
                                        <div className='text-orange-600 dark:text-orange-400 font-medium text-[10px] sm:text-xs'>
                                          {(check.pingTimeMs ?? 0) > 0
                                            ? `${check.pingTimeMs}ms`
                                            : '未知'}
                                        </div>
                                      </div>
                                    );
                                  }

                                  if (check.status === 'checking') {
                                    return (
                                      <div className='text-blue-600 dark:text-blue-400 font-medium text-[10px] sm:text-xs'>
                                        检查中...
                                      </div>
                                    );
                                  }

                                  if (check.status === 'skipped') {
                                    return (
                                      <div className='text-gray-600 dark:text-gray-400 font-medium text-[10px] sm:text-xs'>
                                        {check.message || '已跳过'}
                                      </div>
                                    );
                                  }

                                  if (check.status === 'cancelled') {
                                    return (
                                      <div className='text-gray-600 dark:text-gray-400 font-medium text-[10px] sm:text-xs'>
                                        已取消
                                      </div>
                                    );
                                  }

                                  if (check.status === 'error') {
                                    return (
                                      <div
                                        title={check.details}
                                        className='text-red-500/90 dark:text-red-400 font-medium text-[10px] sm:text-xs truncate max-w-[160px]'
                                      >
                                        {check.message || '异常'}
                                      </div>
                                    );
                                  }
                                }

                                const videoInfo = videoInfoMap.get(sourceKey);
                                if (videoInfo) {
                                  if (!videoInfo.hasError) {
                                    return (
                                      <div className='flex items-end gap-1 sm:gap-3 text-[10px] sm:text-xs'>
                                        <div className='text-green-600 dark:text-green-400 font-medium text-[10px] sm:text-xs'>
                                          {videoInfo.loadSpeed}
                                        </div>
                                        <div className='text-orange-600 dark:text-orange-400 font-medium text-[10px] sm:text-xs'>
                                          {videoInfo.pingTime}ms
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div className='text-red-500/90 dark:text-red-400 font-medium text-[10px] sm:text-xs'>
                                        无测速数据
                                      </div>
                                    ); // 占位div
                                  }
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* 搜索提示按钮 */}
                <div className='flex-shrink-0 mt-2 sm:mt-4 pt-2 border-t border-gray-400 dark:border-gray-700'>
                  <button
                    onClick={() => {
                      if (videoTitle) {
                        router.push(
                          `/search?q=${encodeURIComponent(videoTitle)}`,
                        );
                      }
                    }}
                    className='w-full text-center text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors py-1.5 sm:py-2'
                  >
                    影片匹配有误？点击去搜索
                  </button>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default EpisodeSelector;
