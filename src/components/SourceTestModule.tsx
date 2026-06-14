'use client';

import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { SearchResult } from '@/lib/types';

import VideoCard from '@/components/VideoCard';

import { formatBandwidth, getHLSStreamInfo, HLSStreamInfo } from '../app/play/utils/hlsStreamInfo';

type HlsInstance = InstanceType<typeof import('hls.js').default>;

// API源信息接口
interface ApiSite {
  key: string;
  name: string;
  api: string;
  disabled?: boolean;
}

// 源测试结果接口
interface SourceTestResult {
  source: string;
  sourceName: string;
  status: 'pending' | 'testing' | 'success' | 'error' | 'timeout';
  results: SearchResult[];
  responseTime?: number;
  error?: string;
  disabled?: boolean;
  resultCount?: number;
  matchRate?: number;
  topMatches?: string[];
}

interface EpisodeEntry {
  title: string;
  url: string;
  episodeIndex: number;
}

interface ParsedEpisodeLine {
  lineIndex: number;
  label: string;
  episodes: EpisodeEntry[];
}

interface ParsedSearchResult {
  info: SearchResult;
  lines: ParsedEpisodeLine[];
}

interface PlayTestStatus {
  status: 'idle' | 'testing' | 'success' | 'error';
  url?: string;
  checkedAt?: number;
  message?: string;
  autoTested?: boolean; // 标记是否为自动测试
  // HLS 流信息
  streamInfo?: HLSStreamInfo;
  resolution?: string;
  bandwidth?: string;
  codecSet?: string;
  frameRate?: string;
  totalStreams?: number;
  maxResolution?: string;
  minResolution?: string;
  bandwidthRange?: string;
}

interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'error';
  url?: string;
  title?: string;
  sourceKey?: string;
  message?: string;
  details?: string;
}

interface PlayTesterDrawerState {
  visible: boolean;
  sourceKey?: string;
  sourceName?: string;
  parsedResults: ParsedSearchResult[];
  selectedResultIndex: number;
  selectedLineIndex: number;
  selectedEpisodeIndex: number;
}

// 计算匹配率与示例（供顶层 testSource 复用）
function computeMatchRate(results: SearchResult[], q: string) {
  const lowerQ = (q || '').toLowerCase();
  if (!results || results.length === 0) return 0;
  const hit = results.filter((r) =>
    (r.title || '').toLowerCase().includes(lowerQ)
  ).length;
  return hit / results.length;
}

function computeTopMatches(results: SearchResult[], q: string) {
  const lowerQ = (q || '').toLowerCase();
  const hit = results.filter((r) =>
    (r.title || '').toLowerCase().includes(lowerQ)
  );
  return hit.slice(0, 3).map((r) => r.title || '');
}

function inferLineLabel(rawLine: string, index: number) {
  const firstSegment = rawLine.split('#')[0] || '';
  const parts = firstSegment.split('$');
  let candidate = parts.length > 2 ? parts[0] : '';

  if (!candidate && parts.length === 2) {
    const maybeTitle = parts[0]?.trim();
    if (
      maybeTitle &&
      !/^第?\d+/.test(maybeTitle) &&
      !/^第?[一二三四五六七八九十]+/.test(maybeTitle)
    ) {
      candidate = maybeTitle;
    }
  }

  const sanitized = candidate.trim();
  if (
    !sanitized ||
    sanitized.length < 2 ||
    sanitized.includes('http') ||
    /^第?\d+/.test(sanitized)
  ) {
    return `线路${index + 1}`;
  }
  return sanitized.length > 16 ? `${sanitized.slice(0, 16)}…` : sanitized;
}

function parsePlayableLines(result: SearchResult): ParsedEpisodeLine[] {
  if (!result || !Array.isArray(result.episodes)) return [];

  return result.episodes
    .map((rawLine: string, lineIndex: number) => {
      if (!rawLine) return null;
      const fragments = rawLine
        .split('#')
        .map((fragment) => fragment.trim())
        .filter(Boolean);

      const episodes = fragments
        .map((fragment, episodeIndex) => {
          const lastDollar = fragment.lastIndexOf('$');
          let url = fragment.trim();
          let title = `第${episodeIndex + 1}集`;

          if (lastDollar > -1) {
            title = fragment.slice(0, lastDollar).trim() || title;
            url = fragment.slice(lastDollar + 1).trim();
          }

          if (!/^https?:\/\//i.test(url)) {
            return null;
          }

          return {
            title,
            url,
            episodeIndex,
          } as EpisodeEntry;
        })
        .filter(Boolean) as EpisodeEntry[];

      if (!episodes.length) return null;

      return {
        lineIndex,
        label: inferLineLabel(rawLine, lineIndex),
        episodes,
      } as ParsedEpisodeLine;
    })
    .filter(Boolean) as ParsedEpisodeLine[];
}

function parseSearchResultsForPlayback(
  results: SearchResult[]
): ParsedSearchResult[] {
  if (!Array.isArray(results)) return [];
  return results
    .map((info) => ({
      info,
      lines: parsePlayableLines(info),
    }))
    .filter((item) => item.lines.length > 0);
}

// 获取所有源信息（包括禁用的）
async function getAllApiSites(): Promise<ApiSite[]> {
  try {
    const response = await fetch('/api/source-test/sources');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.sources || [];
  } catch (error) {
    console.error('获取源配置失败:', error);
    // 如果无法获取配置，尝试通过搜索API获取可用源
    try {
      const response = await fetch('/api/search?q=测试');
      const data = await response.json();

      const sources: ApiSite[] = [];
      if (data.results) {
        data.results.forEach((result: any) => {
          if (result.source && !sources.find((s) => s.key === result.source)) {
            sources.push({
              key: result.source,
              name: result.source_name || result.source,
              api: '',
              disabled: false,
            });
          }
        });
      }
      return sources;
    } catch (fallbackError) {
      console.error('获取源列表失败:', fallbackError);
      return [];
    }
  }
}

// 测试单个源
async function testSource(
  sourceKey: string,
  query: string
): Promise<SourceTestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(
      `/api/source-test?q=${encodeURIComponent(query)}&source=${sourceKey}`
    );
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        source: sourceKey,
        sourceName: sourceKey,
        status: response.status === 408 ? 'timeout' : 'error',
        results: [],
        responseTime,
        error:
          errorData.sourceError || errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    // 转换结果格式为 SearchResult
    const results: SearchResult[] = Array.isArray(data.results)
      ? data.results.map((item: any) => ({
          id: item.vod_id || item.id || '',
          title: item.vod_name || item.title || '未知标题',
          poster: item.vod_pic || item.poster || '',
          year: item.vod_year || item.year || '',
          episodes: item.vod_play_url ? item.vod_play_url.split('$$$') : [],
          episodes_titles: [],
          source: sourceKey,
          source_name: data.sourceName || sourceKey,
          class: item.type_name || item.type || '',
          desc: item.vod_content || item.desc || '',
          type_name: item.type_name || item.type || '',
          douban_id: item.vod_douban_id || item.douban_id,
        }))
      : [];

    return {
      source: sourceKey,
      sourceName: data.sourceName || sourceKey,
      status: 'success',
      results,
      responseTime,
      disabled: data.disabled,
      resultCount:
        typeof (data as any).resultCount === 'number'
          ? (data as any).resultCount
          : results.length,
      matchRate:
        typeof (data as any).matchRate === 'number'
          ? (data as any).matchRate
          : computeMatchRate(results, query),
      topMatches: Array.isArray((data as any).topMatches)
        ? (data as any).topMatches
        : computeTopMatches(results, query),
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    return {
      source: sourceKey,
      sourceName: sourceKey,
      status: 'error',
      results: [],
      responseTime,
      error: error.message,
    };
  }
}

// 自动测试单个源的视频播放功能
async function autoTestVideoPlayback(
  sourceKey: string,
  sourceName: string,
  results: SearchResult[]
): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    // 解析搜索结果中的播放地址
    const parsedResults = parseSearchResultsForPlayback(results);
    if (parsedResults.length === 0) {
      return {
        success: false,
        message: '未能从搜索结果中解析到可播放地址',
      };
    }

    // 选取第一个搜索结果的第一条线路的第一个视频
    const firstResult = parsedResults[0];
    const firstLine = firstResult.lines[0];
    const firstEpisode = firstLine.episodes[0];

    if (!firstEpisode || !firstEpisode.url) {
      return {
        success: false,
        message: '未找到有效的播放地址',
      };
    }

    // 简单测试视频地址格式
    const testUrl = firstEpisode.url;
    if (!/^https?:\/\//i.test(testUrl)) {
      return {
        success: false,
        message: '播放地址格式无效',
      };
    }

    return {
      success: true,
      url: testUrl,
      message: `可播放: ${firstResult.info.title} - ${firstLine.label} - ${firstEpisode.title}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `视频测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

export default function SourceTestModule() {
  const [sources, setSources] = useState<ApiSite[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('斗罗大陆');
  const [testResults, setTestResults] = useState<Map<string, SourceTestResult>>(
    new Map()
  );
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [selectedResults, setSelectedResults] = useState<SearchResult[]>([]);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [isDrawerAnimating, setIsDrawerAnimating] = useState(false);
  const [onlyEnabled, setOnlyEnabled] = useState(true);
  const [sortKey, setSortKey] = useState<
    'status' | 'responseTime' | 'resultCount' | 'matchRate' | 'playStatus' | 'name' | 'default'
  >('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [mounted, setMounted] = useState(false);
  const [playTestStatuses, setPlayTestStatuses] = useState<
    Map<string, PlayTestStatus>
  >(new Map());
  const [isAutoTestingVideos, setIsAutoTestingVideos] = useState(false);
  const [autoPlayTest, setAutoPlayTest] = useState(false); // 是否自动进行播放测试
  const [playTester, setPlayTester] = useState<PlayTesterDrawerState>({
    visible: false,
    parsedResults: [],
    selectedResultIndex: 0,
    selectedLineIndex: 0,
    selectedEpisodeIndex: 0,
  });
  const [playDrawerAnimating, setPlayDrawerAnimating] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>({
    status: 'idle',
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsInstanceRef = useRef<HlsInstance | null>(null);
  const latestPlaySourceRef = useRef<string | undefined>(undefined);
  const latestPlayUrlRef = useRef<string | undefined>(undefined);

  // 客户端挂载标记
  useEffect(() => {
    setMounted(true);
  }, []);

  // 加载所有源
  useEffect(() => {
    getAllApiSites().then(setSources);
  }, []);

  // 测试单个源
  const handleTestSingle = async (sourceKey: string) => {
    if (!searchKeyword.trim()) {
      alert('请输入搜索关键词');
      return;
    }

    const source = sources.find((s) => s.key === sourceKey);
    if (!source) return;

    setTestResults(
      (prev) =>
        new Map(
          prev.set(sourceKey, {
            source: sourceKey,
            sourceName: source.name,
            status: 'testing',
            results: [],
            disabled: source.disabled,
          })
        )
    );

    const result = await testSource(sourceKey, searchKeyword);
    result.sourceName = source.name;
    result.disabled = source.disabled;

    setTestResults((prev) => new Map(prev.set(sourceKey, result)));
  };

  // 测试所有源
  const handleTestAll = async () => {
    if (!searchKeyword.trim()) {
      alert('请输入搜索关键词');
      return;
    }

    setIsTestingAll(true);
    setTestResults(new Map());

    // 初始化所有源的状态
    const initialResults = new Map<string, SourceTestResult>();
    const scope = onlyEnabled ? sources.filter((s) => !s.disabled) : sources;
    scope.forEach((source) => {
      initialResults.set(source.key, {
        source: source.key,
        sourceName: source.name,
        status: 'pending',
        results: [],
        disabled: source.disabled,
      });
    });
    setTestResults(initialResults);

    // 测试范围内的源
    const testPromises = scope.map(async (source) => {
      // 更新状态为测试中
      setTestResults(
        (prev) =>
          new Map(
            prev.set(source.key, {
              ...prev.get(source.key)!,
              status: 'testing',
            })
          )
      );

      const result = await testSource(source.key, searchKeyword);
      result.sourceName = source.name;
      result.disabled = source.disabled;

      // 更新单个结果
      setTestResults((prev) => new Map(prev.set(source.key, result)));

      return result;
    });

    await Promise.allSettled(testPromises);
    setIsTestingAll(false);

    // 等待状态更新完成后，再检查是否进行自动播放测试
    setTimeout(() => {
      // 确保测试结果已更新
      const currentResults = Array.from(testResults.entries());
      const successfulResults = currentResults.filter(
        ([, result]) => result.status === 'success' && result.results.length > 0
      );

      console.log('检查自动播放测试:', {
        autoPlayTest,
        testResultsSize: testResults.size,
        successfulResults: successfulResults.length,
        currentResults: currentResults.map(([key, result]) => ({ key, status: result.status, resultCount: result.results.length }))
      });

      if (autoPlayTest && successfulResults.length > 0) {
        console.log('触发自动视频测试，源数量:', successfulResults.length);
        // 确保在下一个事件循环中执行，避免状态更新冲突
        setTimeout(() => {
          handleAutoTestVideos(false); // 传入 false 表示不显示提示
        }, 100);
      } else {
        console.log('自动播放测试条件不满足:', { autoPlayTest, successfulResults: successfulResults.length });
      }
    }, 2000); // 延迟2秒后自动开始视频测试
  };

  // 自动测试视频播放功能
  const handleAutoTestVideos = async (showAlert = true) => {
    console.log('handleAutoTestVideos 开始:', { showAlert, testResultsSize: testResults.size });

    if (!searchKeyword.trim()) {
      if (showAlert) alert('请输入搜索关键词');
      return;
    }

    // 确保有测试结果
    if (testResults.size === 0) {
      if (showAlert) alert('请先运行搜索测试');
      return;
    }

    setIsAutoTestingVideos(true);

    try {
      // 对所有成功的源进行视频测试
      const successfulResults = Array.from(testResults.entries()).filter(
        ([, result]) => result.status === 'success' && result.results.length > 0
      );

      console.log('准备测试的成功源数量:', successfulResults.length);

      for (const [sourceKey, result] of successfulResults) {
        try {
          console.log('正在测试源:', sourceKey);

          // 更新状态为测试中
          updatePlayStatus(sourceKey, {
            status: 'testing',
            message: '自动视频测试中...',
          });

          // 执行视频测试
          const videoTestResult = await autoTestVideoPlayback(
            sourceKey,
            result.sourceName,
            result.results
          );

          console.log('视频测试结果:', sourceKey, videoTestResult);

          // 更新测试状态
          updatePlayStatus(sourceKey, {
            status: videoTestResult.success ? 'success' : 'error',
            url: videoTestResult.url,
            message: videoTestResult.message,
            autoTested: true,
          });
        } catch (error) {
          console.error('单个源测试失败:', sourceKey, error);
          updatePlayStatus(sourceKey, {
            status: 'error',
            message: `自动测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
            autoTested: true,
          });
        }
      }

      console.log('所有视频测试完成');
    } catch (error) {
      console.error('自动视频测试过程中发生错误:', error);
    } finally {
      setIsAutoTestingVideos(false);
      const finalSuccessfulResults = Array.from(testResults.entries()).filter(
        ([, result]) => result.status === 'success' && result.results.length > 0
      );

      if (showAlert) {
        alert(`自动视频测试完成！共测试 ${finalSuccessfulResults.length} 个源`);
      }
    }
  };

  // 查看详细结果
  const handleViewResults = (results: SearchResult[]) => {
    setSelectedResults(results);
    setShowResultsModal(true);
    // 延迟触发动画，确保元素已渲染
    setTimeout(() => setIsDrawerAnimating(true), 10);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setIsDrawerAnimating(false);
    // 等待动画完成后再隐藏
    setTimeout(() => setShowResultsModal(false), 300);
  };

  const updatePlayStatus = (
    sourceKey: string,
    patch: Partial<PlayTestStatus> & { status: PlayTestStatus['status'] }
  ) => {
    try {
      setPlayTestStatuses((prev) => {
        const next = new Map(prev);
        const current = next.get(sourceKey) || { status: 'idle' as const };
        const checkedAt =
          typeof patch.checkedAt === 'number'
            ? patch.checkedAt
            : patch.status === 'testing'
            ? current.checkedAt
            : Date.now();
        next.set(sourceKey, {
          ...current,
          ...patch,
          status: patch.status,
          checkedAt,
        });
        return next;
      });
    } catch (error) {
      console.error('更新播放状态失败:', error, { sourceKey, patch });
    }
  };

  const cleanupPlayer = () => {
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };

  const handlePlaybackFailure = (message: string, details?: string) => {
    const sourceKey = latestPlaySourceRef.current;
    setPlayerState((prev) => ({
      ...prev,
      status: 'error',
      message,
      details,
    }));
    if (sourceKey) {
      updatePlayStatus(sourceKey, {
        status: 'error',
        url: latestPlayUrlRef.current,
        message,
        checkedAt: Date.now(),
      });
    }
  };

  const handleOpenPlayTester = (source: ApiSite) => {
    const result = testResults.get(source.key);
    if (!result || !Array.isArray(result.results) || result.results.length === 0) {
      alert('请先完成搜索测试，并确保该源返回了搜索结果');
      return;
    }
    const parsedResults = parseSearchResultsForPlayback(result.results);
    if (parsedResults.length === 0) {
      alert('未能从该源的搜索结果中解析到可播放地址');
      return;
    }
    setPlayTester({
      visible: true,
      sourceKey: source.key,
      sourceName: source.name,
      parsedResults,
      selectedResultIndex: 0,
      selectedLineIndex: 0,
      selectedEpisodeIndex: 0,
    });
    setTimeout(() => setPlayDrawerAnimating(true), 10);
  };

  const handleClosePlayTester = () => {
    setPlayDrawerAnimating(false);
    setTimeout(() => {
      setPlayTester((prev) => ({
        ...prev,
        visible: false,
      }));
      latestPlaySourceRef.current = undefined;
      latestPlayUrlRef.current = undefined;
      setPlayerState({ status: 'idle' });
      cleanupPlayer();
    }, 300);
  };

  const handleSelectPlayResult = (index: number) => {
    setPlayTester((prev) => {
      if (!prev.parsedResults[index]) return prev;
      return {
        ...prev,
        selectedResultIndex: index,
        selectedLineIndex: 0,
        selectedEpisodeIndex: 0,
      };
    });
  };

  const handleSelectPlayLine = (index: number) => {
    setPlayTester((prev) => {
      const currentResult = prev.parsedResults[prev.selectedResultIndex];
      if (!currentResult || !currentResult.lines[index]) return prev;
      return {
        ...prev,
        selectedLineIndex: index,
        selectedEpisodeIndex: 0,
      };
    });
  };

  const handleSelectPlayEpisode = (index: number) => {
    setPlayTester((prev) => {
      const currentResult = prev.parsedResults[prev.selectedResultIndex];
      const line = currentResult?.lines[prev.selectedLineIndex];
      if (!line || !line.episodes[index]) return prev;
      return {
        ...prev,
        selectedEpisodeIndex: index,
      };
    });
  };

  const startPlayDetection = async (
    episode: EpisodeEntry,
    options: {
      lineLabel: string;
      videoTitle: string;
      sourceKey: string;
      sourceName?: string;
    }
  ) => {
    const normalizedUrl = episode.url.trim();
    if (!normalizedUrl) {
      handlePlaybackFailure('播放地址为空');
      return;
    }

    latestPlaySourceRef.current = options.sourceKey;
    latestPlayUrlRef.current = normalizedUrl;
    cleanupPlayer();
    setPlayerState({
      status: 'loading',
      url: normalizedUrl,
      title: `${options.videoTitle} · ${options.lineLabel} · ${episode.title}`,
      sourceKey: options.sourceKey,
      message: '正在请求媒体资源...',
    });

    updatePlayStatus(options.sourceKey, {
      status: 'testing',
      url: normalizedUrl,
      message: `${options.lineLabel} / ${episode.title} 检测中`,
    });

    const video = videoRef.current;
    if (!video) {
      handlePlaybackFailure('播放器尚未初始化');
      return;
    }

    const isHlsStream = /\.m3u8($|\?)/i.test(normalizedUrl);
    let handledByHls = false;
    if (isHlsStream) {
      let Hls: typeof import('hls.js').default;
      try {
        Hls = (await import('hls.js')).default;
      } catch (error) {
        handlePlaybackFailure(
          error instanceof Error ? error.message : 'HLS 播放器加载失败'
        );
        return;
      }

      if (
        latestPlaySourceRef.current !== options.sourceKey ||
        latestPlayUrlRef.current !== normalizedUrl
      ) {
        return;
      }

      if (!Hls.isSupported()) {
        video.src = normalizedUrl;
        video.load();
      } else {
        handledByHls = true;
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsInstanceRef.current = hls;

        // 获取 HLS 流信息
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest 解析完成，获取流信息');
          const streamInfo = getHLSStreamInfo(hls);

          if (streamInfo) {
            console.log('获取到 HLS 流信息:', streamInfo);

            // 获取当前流信息
            const currentStream = streamInfo.levels[streamInfo.currentLevel];
            const maxBandwidth = streamInfo.maxBandwidth;
            const minBandwidth = streamInfo.minBandwidth;

            const updateData: Partial<PlayTestStatus> = {
              streamInfo,
              totalStreams: streamInfo.totalLevels,
              maxResolution: streamInfo.maxResolution,
              minResolution: streamInfo.minResolution,
              bandwidthRange: maxBandwidth && minBandwidth
                ? `${formatBandwidth(minBandwidth)} - ${formatBandwidth(maxBandwidth)}`
                : undefined
            };

            // 获取当前流信息
            if (currentStream) {
              updateData.resolution = currentStream.resolution;
              updateData.bandwidth = currentStream.bandwidthText;
              updateData.codecSet = currentStream.codecSet;
              updateData.frameRate = currentStream.frameRate;
            }

            updatePlayStatus(options.sourceKey, {
              status: 'testing',
              message: `HLS 解析成功 - ${streamInfo.totalLevels}个清晰度`,
              ...updateData
            });
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data?.fatal) {
            const reason =
              data?.response?.code === 0
                ? '跨域被拒或未开放 CORS'
                : data?.response?.code === 403
                ? '403 禁止访问，可能需要白名单'
                : data?.details || '未知 HLS 错误';
            handlePlaybackFailure(`HLS 错误：${reason}`, data?.response?.url);
          }
        });
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          try {
            hls.loadSource(normalizedUrl);
          } catch (err: any) {
            handlePlaybackFailure(err?.message || 'HLS 源加载失败');
          }
        });
      }
    }

    if (!handledByHls) {
      video.src = normalizedUrl;
      video.load();
    }

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        const msg =
          err?.message?.includes('NotAllowedError') ||
          err?.message?.includes('AbortError')
            ? '浏览器阻止了自动播放，请手动点击播放'
            : err?.message || '浏览器拒绝播放该流';
        handlePlaybackFailure(msg);
      });
    }
  };

  useEffect(() => {
    return () => {
      cleanupPlayer();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handlePlaying = () => {
      const sourceKey = latestPlaySourceRef.current;
      if (!sourceKey) return;
      setPlayerState((prev) => ({
        ...prev,
        status: 'playing',
        message: '播放成功',
      }));
      updatePlayStatus(sourceKey, {
        status: 'success',
        url: latestPlayUrlRef.current,
        message: '播放成功',
      });
    };
    const handleVideoError = () => {
      const mediaError = video.error;
      const errorCode = mediaError?.code || 0;
      const messageMap: Record<number, string> = {
        1: '加载被用户中止',
        2: '网络错误或跨域限制',
        3: '解码失败，可能格式不受支持',
        4: '资源不可用或跨域限制',
      };
      handlePlaybackFailure(
        messageMap[errorCode] || '播放失败，可能被跨域限制',
        mediaError?.message
      );
    };
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleVideoError);
    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleVideoError);
    };
  }, []);

  const selectedPlayContext = useMemo(() => {
    if (!playTester.visible) return null;
    const currentResult = playTester.parsedResults[playTester.selectedResultIndex];
    if (!currentResult) return null;
    const line = currentResult.lines[playTester.selectedLineIndex];
    if (!line) return null;
    const episode = line.episodes[playTester.selectedEpisodeIndex];
    if (!episode) return null;
    return {
      episode,
      lineLabel: line.label,
      videoTitle: currentResult.info.title,
    };
  }, [
    playTester.visible,
    playTester.parsedResults,
    playTester.selectedResultIndex,
    playTester.selectedLineIndex,
    playTester.selectedEpisodeIndex,
  ]);

  useEffect(() => {
    if (
      !playTester.visible ||
      !playTester.sourceKey ||
      !selectedPlayContext ||
      !selectedPlayContext.episode
    ) {
      return;
    }
    startPlayDetection(selectedPlayContext.episode, {
      lineLabel: selectedPlayContext.lineLabel,
      videoTitle: selectedPlayContext.videoTitle,
      sourceKey: playTester.sourceKey,
      sourceName: playTester.sourceName,
    });
    // 依赖仅关心选中的播放上下文，避免因函数引用变化导致重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playTester.visible,
    playTester.sourceKey,
    playTester.sourceName,
    selectedPlayContext?.episode?.url,
    selectedPlayContext?.lineLabel,
    selectedPlayContext?.videoTitle,
  ]);

  // 防止滚动穿透
  useEffect(() => {
    if (showResultsModal || playTester.visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showResultsModal, playTester.visible]);

  // ESC键关闭抽屉
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showResultsModal) {
          handleCloseDrawer();
        }
        if (playTester.visible) {
          handleClosePlayTester();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResultsModal, playTester.visible]);

  // 启用/禁用源
  const toggleSource = async (source: ApiSite) => {
    try {
      const action = source.disabled ? 'enable' : 'disable';
      const resp = await fetch('/api/admin/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, key: source.key }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `操作失败(${resp.status})`);
      }
      // 本地更新状态
      setSources((prev) =>
        prev.map((s) =>
          s.key === source.key ? { ...s, disabled: !s.disabled } : s
        )
      );
      setTestResults(
        (prev) =>
          new Map(
            prev.set(source.key, {
              ...(prev.get(source.key) || {
                source: source.key,
                sourceName: source.name,
                status: 'pending',
                results: [],
              }),
              disabled: !source.disabled,
            })
          )
      );
    } catch (e: any) {
      alert(e.message || '操作失败');
    }
  };

  // 获取统计信息
  const getStats = () => {
    const results = Array.from(testResults.values());
    const enabledResults = results.filter((r) => !r.disabled);
    const disabledResults = results.filter((r) => r.disabled);

    const enabledTotal = enabledResults.length;
    const enabledSuccess = enabledResults.filter(
      (r) => r.status === 'success'
    ).length;
    const enabledError = enabledResults.filter(
      (r) => r.status === 'error'
    ).length;
    const enabledTimeout = enabledResults.filter(
      (r) => r.status === 'timeout'
    ).length;
    const enabledTesting = enabledResults.filter(
      (r) => r.status === 'testing'
    ).length;

    const disabledTotal = disabledResults.length;
    const disabledSuccess = disabledResults.filter(
      (r) => r.status === 'success'
    ).length;
    const disabledError = disabledResults.filter(
      (r) => r.status === 'error'
    ).length;
    const disabledTimeout = disabledResults.filter(
      (r) => r.status === 'timeout'
    ).length;
    const disabledTesting = disabledResults.filter(
      (r) => r.status === 'testing'
    ).length;

    const total = results.length;
    const success = enabledSuccess + disabledSuccess;
    const error = enabledError + disabledError;
    const timeout = enabledTimeout + disabledTimeout;
    const testing = enabledTesting + disabledTesting;

    // 视频测试统计
    const playStatuses = Array.from(playTestStatuses.values());
    const videoTested = playStatuses.filter(p => p.status !== 'idle').length;
    const videoSuccess = playStatuses.filter(p => p.status === 'success').length;
    const videoError = playStatuses.filter(p => p.status === 'error').length;
    const autoTested = playStatuses.filter(p => p.autoTested).length;

    return {
      total,
      success,
      error,
      timeout,
      testing,
      enabledTotal,
      enabledSuccess,
      enabledError,
      enabledTimeout,
      enabledTesting,
      disabledTotal,
      disabledSuccess,
      disabledError,
      disabledTimeout,
      disabledTesting,
      videoTested,
      videoSuccess,
      videoError,
      autoTested,
    };
  };

  const stats = getStats();

  // 状态图标
  const getStatusIcon = (status: string, disabled?: boolean) => {
    if (disabled) {
      return (
        <div className='w-4 h-4 rounded-full bg-gray-400' title='已禁用' />
      );
    }

    switch (status) {
      case 'testing':
        return <ArrowPathIcon className='w-4 h-4 animate-spin text-blue-500' />;
      case 'success':
        return <CheckCircleIcon className='w-4 h-4 text-green-500' />;
      case 'error':
        return <XCircleIcon className='w-4 h-4 text-red-500' />;
      case 'timeout':
        return <ClockIcon className='w-4 h-4 text-yellow-500' />;
      default:
        return <div className='w-4 h-4 rounded-full bg-gray-300' />;
    }
  };

  const renderPlayStatus = (sourceKey: string) => {
    const ps = playTestStatuses.get(sourceKey);
    if (!ps) {
      return (
        <div className='text-xs text-gray-500 dark:text-gray-400'>
          播放检测：未测试
        </div>
      );
    }
    const colorMap: Record<PlayTestStatus['status'], string> = {
      idle: 'text-gray-500',
      testing: 'text-blue-600',
      success: 'text-green-600',
      error: 'text-red-600',
    };
    const labelMap: Record<PlayTestStatus['status'], string> = {
      idle: '未测试',
      testing: '检测中',
      success: '可播放',
      error: '异常',
    };
    return (
      <div className="space-y-1">
        <div
          className={`text-xs font-medium ${colorMap[ps.status]} flex items-center gap-1`}
          title={ps.message || ps.url}
        >
          <PlayIcon className='w-4 h-4' />
          <span>
            播放检测：{labelMap[ps.status]}
            {ps.autoTested && ' (自动)'}
            {ps.checkedAt ? ` (${new Date(ps.checkedAt).toLocaleTimeString()})` : ''}
          </span>
        </div>

        {/* HLS 流信息显示 */}
        {ps.streamInfo && (
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">HLS流:</span>
              <span>{ps.totalStreams}个清晰度</span>
              {ps.resolution && <span>• {ps.resolution}</span>}
              {ps.bandwidth && <span>• {ps.bandwidth}</span>}
            </div>
            {(ps.maxResolution || ps.minResolution) && (
              <div className="flex items-center gap-2">
                <span className="font-medium">分辨率:</span>
                <span>
                  {ps.minResolution} - {ps.maxResolution}
                </span>
              </div>
            )}
            {ps.codecSet && (
              <div className="flex items-center gap-2">
                <span className="font-medium">编码:</span>
                <span className="text-xs truncate max-w-[200px]">{ps.codecSet}</span>
              </div>
            )}
            {ps.bandwidthRange && (
              <div className="flex items-center gap-2">
                <span className="font-medium">带宽范围:</span>
                <span>{ps.bandwidthRange}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 计算排序后的源列表
  const getSortedSources = () => {
    const scope = onlyEnabled ? sources.filter((s) => !s.disabled) : sources;

    // 如果是默认排序，保持原始顺序，不排序
    if (sortKey === 'default') {
      return scope;
    }

    const statusWeight = (s?: SourceTestResult) => {
      // 数值越大表示越靠后（差）
      if (!s) return 4; // 未测试
      switch (s.status) {
        case 'success':
          return 0;
        case 'testing':
          return 1;
        case 'timeout':
          return 2;
        case 'error':
          return 3;
        case 'pending':
        default:
          return 4;
      }
    };

    const playStatusWeight = (sourceKey: string) => {
      const playStatus = playTestStatuses.get(sourceKey);
      if (!playStatus) return 5; // 未测试
      switch (playStatus.status) {
        case 'success':
          return 0;
        case 'testing':
          return 1;
        case 'error':
          return 2;
        case 'idle':
        default:
          return 5;
      }
    };

    const metric = (src: ApiSite) => {
      const r = testResults.get(src.key);
      switch (sortKey) {
        case 'status':
          return statusWeight(r);
        case 'responseTime':
          return r?.responseTime ?? Number.POSITIVE_INFINITY;
        case 'resultCount':
          return typeof r?.resultCount === 'number'
            ? r!.resultCount!
            : r?.results?.length || 0;
        case 'matchRate':
          return typeof r?.matchRate === 'number' ? r!.matchRate! : -1; // 未测试置为-1，降序时排后
        case 'playStatus':
          return playStatusWeight(src.key);
        case 'name':
          return src.name.toLowerCase();
        default:
          return 0;
      }
    };

    const arr = [...scope];
    arr.sort((a, b) => {
      const va = metric(a);
      const vb = metric(b);
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = String(va).localeCompare(String(vb));
      } else {
        const na = Number(va);
        const nb = Number(vb);
        if (Number.isNaN(na) && Number.isNaN(nb)) cmp = 0;
        else if (Number.isNaN(na)) cmp = 1;
        else if (Number.isNaN(nb)) cmp = -1;
        else cmp = na === nb ? 0 : na < nb ? -1 : 1;
      }
      // desc 表示大的在前（除 status 的权重外，我们已经用数值大小语义保持一致）
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return arr;
  };

  return (
    <div className='max-w-7xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6'>
      {/* 标题 */}
      <div className='text-center'>
        <h1 className='text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2'>
          源检测工具
        </h1>
        <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
          测试各个源的搜索功能和响应速度，自动检测视频播放可用性，方便管理员禁用不可播放的源
          {autoPlayTest && (
            <span className='block text-xs sm:text-sm text-purple-600 dark:text-purple-400 mt-1'>
              🎬 自动播放测试已启用 - 搜索测试完成后将自动进行视频播放测试
            </span>
          )}
        </p>
      </div>

      {/* 搜索控制 */}
      <div className='bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-sm'>
        <div className='flex flex-col gap-3 sm:gap-4'>
          <div className='flex-1'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              搜索关键词
            </label>
            <div className='relative'>
              <MagnifyingGlassIcon className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' />
              <input
                type='text'
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder='输入要搜索的内容...'
                className='w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
            </div>
          </div>

          <div className='flex flex-col sm:flex-row items-stretch sm:items-end gap-3'>
            <div className='flex flex-col sm:flex-row gap-3 sm:gap-4 flex-1'>
              <label className='flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 px-1'>
                <input
                  type='checkbox'
                  className='w-4 h-4 rounded border-gray-300 dark:border-gray-600'
                  checked={onlyEnabled}
                  onChange={(e) => setOnlyEnabled(e.target.checked)}
                />
                仅测试启用源
              </label>

              <label className='flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 px-1'>
                <input
                  type='checkbox'
                  className='w-4 h-4 rounded border-gray-300 dark:border-gray-600'
                  checked={autoPlayTest}
                  onChange={(e) => setAutoPlayTest(e.target.checked)}
                />
                自动播放测试
              </label>
            </div>

            <div className='flex flex-col sm:flex-row gap-2'>
              <button
                onClick={handleTestAll}
                disabled={
                  isTestingAll || !searchKeyword.trim() || sources.length === 0
                }
                className='px-4 sm:px-6 py-2.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700
                         disabled:bg-gray-400 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2 whitespace-nowrap transition-colors'
              >
                {isTestingAll ? (
                  <ArrowPathIcon className='w-4 h-4 animate-spin' />
                ) : (
                  <PlayIcon className='w-4 h-4' />
                )}
                测试所有源
              </button>

              <button
                onClick={() => handleAutoTestVideos(true)}
                disabled={
                  isAutoTestingVideos ||
                  testResults.size === 0 ||
                  !Array.from(testResults.values()).some(r => r.status === 'success')
                }
                className='px-4 sm:px-6 py-2.5 sm:py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700
                         disabled:bg-gray-400 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2 whitespace-nowrap transition-colors'
              >
                {isAutoTestingVideos ? (
                  <ArrowPathIcon className='w-4 h-4 animate-spin' />
                ) : (
                  <PlayIcon className='w-4 h-4' />
                )}
                手动视频测试
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 统计信息 */}
      {testResults.size > 0 && (
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-sm'>
          <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4'>
            测试统计
          </h3>

          {/* 搜索测试统计 */}
          <div className='mb-4'>
            <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>搜索测试</h4>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4'>
              <div className='text-center'>
                <div className='text-2xl font-bold text-gray-900 dark:text-white'>
                  {stats.total}
                </div>
                <div className='text-sm text-gray-600 dark:text-gray-400'>
                  总源数
                </div>
              </div>
              <div className='text-center'>
                <div className='text-2xl font-bold text-green-600'>
                  {stats.success}
                </div>
                <div className='text-sm text-gray-600 dark:text-gray-400'>
                  成功
                </div>
              </div>
              <div className='text-center'>
                <div className='text-2xl font-bold text-red-600'>
                  {stats.error}
                </div>
                <div className='text-sm text-gray-600 dark:text-gray-400'>
                  失败
                </div>
              </div>
              <div className='text-center'>
                <div className='text-2xl font-bold text-yellow-600'>
                  {stats.timeout}
                </div>
                <div className='text-sm text-gray-600 dark:text-gray-400'>
                  超时
                </div>
              </div>
              <div className='text-center'>
                <div className='text-2xl font-bold text-blue-600'>
                  {stats.testing}
                </div>
                <div className='text-sm text-gray-600 dark:text-gray-400'>
                  测试中
                </div>
              </div>
            </div>
          </div>

          {/* 视频测试统计 */}
          {(stats.videoTested > 0 || isAutoTestingVideos) && (
            <div className='pt-4 border-t border-gray-200 dark:border-gray-700'>
              <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                视频测试 {isAutoTestingVideos && '(进行中)'}
                {stats.autoTested > 0 && !isAutoTestingVideos && `(含自动测试 ${stats.autoTested} 个)`}
              </h4>
              <div className='grid grid-cols-3 sm:grid-cols-3 gap-3 sm:gap-4'>
                <div className='text-center'>
                  <div className='text-xl font-bold text-purple-600'>
                    {isAutoTestingVideos ? (
                      <div className='flex items-center justify-center gap-2'>
                        <ArrowPathIcon className='w-5 h-5 animate-spin' />
                        <span>测试中</span>
                      </div>
                    ) : (
                      stats.videoTested
                    )}
                  </div>
                  <div className='text-sm text-gray-600 dark:text-gray-400'>
                    {isAutoTestingVideos ? '正在测试' : '已测试'}
                  </div>
                </div>
                <div className='text-center'>
                  <div className='text-xl font-bold text-green-600'>
                    {stats.videoSuccess}
                  </div>
                  <div className='text-sm text-gray-600 dark:text-gray-400'>
                    可播放
                  </div>
                </div>
                <div className='text-center'>
                  <div className='text-xl font-bold text-red-600'>
                    {stats.videoError}
                  </div>
                  <div className='text-sm text-gray-600 dark:text-gray-400'>
                    播放异常
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 详细统计 */}
          <div className='mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6'>
              <div>
                <h4 className='text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  启用源 ({stats.enabledTotal})
                </h4>
                <div className='flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm'>
                  <span className='text-green-600'>
                    成功: {stats.enabledSuccess}
                  </span>
                  <span className='text-red-600'>
                    失败: {stats.enabledError}
                  </span>
                  <span className='text-yellow-600'>
                    超时: {stats.enabledTimeout}
                  </span>
                  <span className='text-blue-600'>
                    测试中: {stats.enabledTesting}
                  </span>
                </div>
              </div>
              <div>
                <h4 className='text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  禁用源 ({stats.disabledTotal})
                </h4>
                <div className='flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm'>
                  <span className='text-green-600'>
                    成功: {stats.disabledSuccess}
                  </span>
                  <span className='text-red-600'>
                    失败: {stats.disabledError}
                  </span>
                  <span className='text-yellow-600'>
                    超时: {stats.disabledTimeout}
                  </span>
                  <span className='text-blue-600'>
                    测试中: {stats.disabledTesting}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 源列表 */}
      <div className='bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-sm'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
          <h3 className='text-base sm:text-lg font-semibold text-gray-900 dark:text-white'>
            源列表 ({sources.length} 个源)
          </h3>
          <div className='flex items-center gap-2 sm:gap-3 flex-wrap'>
            <label className='text-xs sm:text-sm text-gray-600 dark:text-gray-300'>
              排序
            </label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
              className='text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 sm:px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            >
              <option value='default'>默认顺序</option>
              <option value='status'>状态</option>
              <option value='responseTime'>耗时</option>
              <option value='resultCount'>结果数</option>
              <option value='matchRate'>相关率</option>
              <option value='playStatus'>播放状态</option>
              <option value='name'>名称</option>
            </select>
            <button
              onClick={() =>
                setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'))
              }
              className='text-xs sm:text-sm px-2 sm:px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors'
              title='切换升序/降序'
            >
              {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
            </button>
          </div>
        </div>

        <div className='space-y-3'>
          {getSortedSources().map((source) => {
            const result = testResults.get(source.key);
            return (
              <div
                key={source.key}
                className={`border rounded-lg p-4 transition-all hover:shadow-md ${
                  source.disabled
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-3'>
                  <div className='flex items-center gap-3 flex-1'>
                    {getStatusIcon(
                      result?.status || 'pending',
                      source.disabled
                    )}
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <span
                          className={`font-medium ${
                            source.disabled
                              ? 'text-gray-500 dark:text-gray-400'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {source.name}
                        </span>
                        {source.disabled && (
                          <span className='px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded'>
                            已禁用
                          </span>
                        )}
                      </div>
                      <div className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                        <div className='font-mono text-xs'>{source.key}</div>
                        <div
                          className='truncate hover:whitespace-normal hover:break-all transition-all cursor-pointer'
                          title={source.api}
                        >
                          {source.api}
                        </div>
                      </div>
                    </div>

                    {result && (
                      <div className='text-right min-w-0 hidden md:block'>
                        <div className='text-sm text-gray-600 dark:text-gray-400'>
                          {result.responseTime && `${result.responseTime}ms`}
                        </div>
                        {result.status === 'success' && (
                          <div className='text-sm text-green-600 font-medium'>
                            {typeof result.resultCount === 'number'
                              ? result.resultCount
                              : result.results.length}{' '}
                            个结果
                            {typeof result.matchRate === 'number' && (
                              <span className='ml-2 text-gray-500'>
                                相关{Math.round((result.matchRate || 0) * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                        {result.status === 'error' && (
                          <div className='text-sm text-red-600 font-medium'>
                            请求失败
                          </div>
                        )}
                        {result.status === 'timeout' && (
                          <div className='text-sm text-yellow-600 font-medium'>
                            请求超时
                          </div>
                        )}
                        {result.status === 'testing' && (
                          <div className='text-sm text-blue-600 font-medium'>
                            测试中...
                          </div>
                        )}
                        {result.topMatches && result.topMatches.length > 0 && (
                          <div
                            className='text-xs text-gray-500 truncate max-w-xs'
                            title={result.topMatches.join(' | ')}
                          >
                            示例: {result.topMatches.join(' | ')}
                          </div>
                        )}
                        <div className='mt-1'>{renderPlayStatus(source.key)}</div>
                      </div>
                    )}
                  </div>

                  <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3 sm:mt-0 sm:ml-4'>
                {result?.results && result.results.length > 0 && (
                  <button
                    onClick={() => handleViewResults(result.results)}
                    className='px-3 py-2 sm:py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors'
                  >
                    查看结果
                  </button>
                )}
                {result?.results && result.results.length > 0 && (
                  <button
                    onClick={() => handleOpenPlayTester(source)}
                    className='px-3 py-2 sm:py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap'
                  >
                    播放检测
                  </button>
                )}

                <button
                  onClick={() => handleTestSingle(source.key)}
                  disabled={result?.status === 'testing'}
                  className={`px-3 py-2 sm:py-1 text-sm rounded-lg disabled:cursor-not-allowed transition-colors whitespace-nowrap ${
                        source.disabled
                          ? 'bg-orange-600 text-white hover:bg-orange-700 disabled:bg-gray-400'
                          : 'bg-gray-600 text-white hover:bg-gray-700 disabled:bg-gray-400'
                      }`}
                    >
                      {result?.status === 'testing'
                        ? '测试中'
                        : source.disabled
                        ? '测试禁用源'
                        : '单独测试'}
                    </button>

                    <button
                      onClick={() => toggleSource(source)}
                      className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-colors ${
                        source.disabled
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      {source.disabled ? '启用' : '禁用'}
                    </button>
                  </div>
                </div>

                {/* 移动端结果信息显示 */}
                {result && (
                  <div className='mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 md:hidden'>
                    <div className='flex items-center justify-between text-sm'>
                      <div className='text-gray-600 dark:text-gray-400'>
                        {result.responseTime &&
                          `响应时间: ${result.responseTime}ms`}
                      </div>
                      {result.status === 'success' && (
                        <div className='text-green-600 font-medium'>
                          {typeof result.resultCount === 'number'
                            ? result.resultCount
                            : result.results.length}{' '}
                          个结果
                          {typeof result.matchRate === 'number' && (
                            <span className='ml-2 text-gray-500'>
                              (相关{Math.round((result.matchRate || 0) * 100)}%)
                            </span>
                          )}
                        </div>
                      )}
                      {result.status === 'error' && (
                        <div className='text-red-600 font-medium'>请求失败</div>
                      )}
                      {result.status === 'timeout' && (
                        <div className='text-yellow-600 font-medium'>
                          请求超时
                        </div>
                      )}
                      {result.status === 'testing' && (
                        <div className='text-blue-600 font-medium'>
                          测试中...
                        </div>
                      )}
                    </div>
                    {result.topMatches && result.topMatches.length > 0 && (
                      <div
                        className='text-xs text-gray-500 mt-1'
                        title={result.topMatches.join(' | ')}
                      >
                        示例: {result.topMatches.slice(0, 2).join(', ')}
                      </div>
                    )}
                    <div className='mt-1'>{renderPlayStatus(source.key)}</div>
                  </div>
                )}

                {result?.error && (
                  <div className='mt-2 pt-2 text-sm text-red-600 dark:text-red-400 border-t border-red-200 dark:border-red-800'>
                    <span className='font-medium'>错误:</span> {result.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 结果详情侧边抽屉 - 使用 Portal 渲染到 body */}
      {mounted &&
        showResultsModal &&
        createPortal(
          <>
            {/* 遮罩层 */}
            <div
              className={`fixed inset-0 bg-black z-[998] transition-opacity duration-300 ${
                isDrawerAnimating ? 'bg-opacity-50' : 'bg-opacity-0'
              }`}
              onClick={handleCloseDrawer}
            />

            {/* 侧边抽屉 */}
            <div
              className={`fixed inset-y-0 right-0 z-[1000] w-full sm:w-3/4 md:w-2/3 lg:w-3/5 xl:w-1/2 bg-white dark:bg-gray-800 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${
                isDrawerAnimating ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              {/* 头部 */}
              <div className='flex justify-between items-center p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-10 shadow-sm'>
                <div className='flex-1 min-w-0 mr-4'>
                  <div className='flex items-center gap-2'>
                    <h3 className='text-lg sm:text-xl font-semibold text-gray-900 dark:text-white'>
                      搜索结果
                    </h3>
                    <span className='px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full'>
                      {selectedResults.length}
                    </span>
                  </div>
                  {selectedResults.length > 0 && (
                    <div className='flex items-center gap-2 mt-1'>
                      <p className='text-sm text-gray-500 dark:text-gray-400'>
                        来源: {selectedResults[0].source_name}
                      </p>
                      <span className='text-gray-300 dark:text-gray-600'>
                        •
                      </span>
                      <p className='text-sm text-gray-500 dark:text-gray-400'>
                        关键词: {searchKeyword}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleCloseDrawer}
                  className='flex-shrink-0 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
                  title='关闭 (ESC)'
                >
                  <XMarkIcon className='w-6 h-6' />
                </button>
              </div>

              {/* 内容区域 */}
              <div className='flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50 dark:bg-gray-900'>
                {selectedResults.length > 0 ? (
                  <div className='grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4'>
                    {selectedResults.map((result, index) => (
                      <VideoCard
                        key={`${result.source}-${result.id}-${index}`}
                        id={result.id}
                        title={result.title}
                        poster={result.poster}
                        year={result.year}
                        episodes={result.episodes.length}
                        source={result.source}
                        source_name={result.source_name}
                        from='search'
                        type={result.type_name}
                        rate={result.desc}
                      />
                    ))}
                  </div>
                ) : (
                  <div className='flex flex-col items-center justify-center h-full text-center py-12'>
                    <MagnifyingGlassIcon className='w-16 h-16 text-gray-300 dark:text-gray-600 mb-4' />
                    <p className='text-gray-500 dark:text-gray-400 text-lg'>
                      暂无搜索结果
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}

      {/* 播放检测抽屉 */}
      {mounted &&
        playTester.visible &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 bg-black z-[1180] transition-opacity duration-300 ${
                playDrawerAnimating ? 'bg-opacity-50' : 'bg-opacity-0'
              }`}
              onClick={handleClosePlayTester}
            />
            <div
              className={`fixed inset-y-0 right-0 z-[1190] w-full md:w-5/6 lg:w-3/4 xl:w-2/3 bg-white dark:bg-gray-900 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${
                playDrawerAnimating ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className='flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 shadow-sm'>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <h3 className='text-lg sm:text-xl font-semibold text-gray-900 dark:text-white'>
                      播放检测
                    </h3>
                    {playTester.sourceName && (
                      <span className='px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded'>
                        {playTester.sourceName}
                      </span>
                    )}
                  </div>
                  {playerState.message && (
                    <p
                      className={`text-xs sm:text-sm mt-1 ${
                        playerState.status === 'error'
                          ? 'text-red-500'
                          : 'text-gray-500'
                      }`}
                    >
                      {playerState.message}
                      {playerState.details && `（${playerState.details}）`}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClosePlayTester}
                  className='p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                  title='关闭 (ESC)'
                >
                  <XMarkIcon className='w-6 h-6' />
                </button>
              </div>

              <div className='flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50 dark:bg-gray-950/60'>
                {/* 结果列表与线路选择 */}
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                  <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden'>
                    <div className='px-3 py-2 border-b border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200'>
                      搜索结果 ({playTester.parsedResults.length})
                    </div>
                    <div className='max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800'>
                      {playTester.parsedResults.map((item, idx) => (
                        <button
                          key={`${item.info.id}-${idx}`}
                          onClick={() => handleSelectPlayResult(idx)}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                            playTester.selectedResultIndex === idx
                              ? 'bg-blue-50 dark:bg-blue-900/30'
                              : ''
                          }`}
                        >
                          <div className='flex items-center justify-between gap-2'>
                            <div className='truncate text-sm text-gray-900 dark:text-white'>
                              {item.info.title}
                            </div>
                            <span className='text-xs text-gray-500'>
                              {item.lines.length} 条线路
                            </span>
                          </div>
                          <div className='text-xs text-gray-500 truncate'>
                            ID: {item.info.id}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-3 space-y-3'>
                    <div className='flex items-center justify-between text-sm text-gray-700 dark:text-gray-200'>
                      <span>线路 / 剧集</span>
                      {playerState.url && (
                        <span className='text-xs text-gray-500 truncate max-w-[12rem]'>
                          {playerState.url}
                        </span>
                      )}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {playTester.parsedResults[
                        playTester.selectedResultIndex
                      ]?.lines.map((line, idx) => (
                        <button
                          key={line.lineIndex}
                          onClick={() => handleSelectPlayLine(idx)}
                          className={`px-3 py-1 rounded-full border text-xs ${
                            playTester.selectedLineIndex === idx
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {line.label}（{line.episodes.length}）
                        </button>
                      ))}
                    </div>
                    <div className='flex flex-wrap gap-2 max-h-32 overflow-y-auto'>
                      {playTester.parsedResults[
                        playTester.selectedResultIndex
                      ]?.lines[playTester.selectedLineIndex]?.episodes.map(
                        (ep, idx) => (
                          <button
                            key={`${ep.title}-${idx}`}
                            onClick={() => handleSelectPlayEpisode(idx)}
                            className={`px-3 py-1 rounded-lg text-xs border ${
                              playTester.selectedEpisodeIndex === idx
                                ? 'bg-green-600 text-white border-green-600'
                                : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                            title={ep.url}
                          >
                            {ep.title || `第${idx + 1}集`}
                          </button>
                        )
                      )}
                    </div>
                    <div className='text-xs text-gray-500 dark:text-gray-400'>
                      提示：若提示跨域或 403，可在源配置中添加代理或白名单。
                    </div>
                  </div>

                  <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-3 flex flex-col gap-3'>
                    <div className='flex items-center justify-between text-sm text-gray-700 dark:text-gray-200'>
                      <span>播放器</span>
                      <span
                        className={`text-xs ${
                          playerState.status === 'error'
                            ? 'text-red-500'
                            : playerState.status === 'playing'
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {playerState.status === 'loading'
                          ? '检测中...'
                          : playerState.status === 'playing'
                          ? '播放成功'
                          : playerState.status === 'error'
                          ? '播放异常'
                          : '待检测'}
                      </span>
                    </div>
                    <div className='aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center'>
                      <video
                        ref={videoRef}
                        className='w-full h-full'
                        controls
                        playsInline
                        muted
                        crossOrigin='anonymous'
                      />
                    </div>
                    {playerState.title && (
                      <div className='text-xs text-gray-600 dark:text-gray-300'>
                        {playerState.title}
                      </div>
                    )}
                    {latestPlayUrlRef.current && (
                      <div className='text-xs text-gray-500 break-all'>
                        {latestPlayUrlRef.current}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* 空状态 */}
      {sources.length === 0 && (
        <div className='text-center py-12'>
          <ExclamationTriangleIcon className='w-12 h-12 text-gray-400 mx-auto mb-4' />
          <p className='text-gray-600 dark:text-gray-400'>正在加载源列表...</p>
        </div>
      )}
    </div>
  );
}
