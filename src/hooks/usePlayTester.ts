'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type ApiSite,
  type EpisodeEntry,
  type ParsedSearchResult,
  type SourceTestResult,
  parseSearchResultsForPlayback,
} from '@/lib/source-test';

import {
  formatBandwidth,
  getHLSStreamInfo,
  HLSStreamInfo,
} from '../app/play/utils/hlsStreamInfo';

type HlsInstance = InstanceType<typeof import('hls.js').default>;

export interface PlayTestStatus {
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

export interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'error';
  url?: string;
  title?: string;
  sourceKey?: string;
  message?: string;
  details?: string;
}

export interface PlayTesterDrawerState {
  visible: boolean;
  sourceKey?: string;
  sourceName?: string;
  parsedResults: ParsedSearchResult[];
  selectedResultIndex: number;
  selectedLineIndex: number;
  selectedEpisodeIndex: number;
}

/**
 * 播放检测：抽屉状态、HLS/直连播放探测与选中即自动检测编排，
 * 逐字拆分自 SourceTestModule 原实现；出错即标记失败并终止的
 * 快速失败语义原样保留（与 live-hls 的恢复式重试语义不同，勿混用）。
 */
export function usePlayTester({
  testResults,
}: {
  testResults: Map<string, SourceTestResult>;
}) {
  const [playTestStatuses, setPlayTestStatuses] = useState<
    Map<string, PlayTestStatus>
  >(new Map());
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
          const streamInfo = getHLSStreamInfo(hls);

          if (streamInfo) {

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
          } catch (err) {
            handlePlaybackFailure(
              (err instanceof Error ? err.message : undefined) ||
                'HLS 源加载失败'
            );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意 mount-only：仅挂载时为 video 元素绑定一次事件；handlePlaybackFailure 为每渲染重建的普通函数，经 ref 读取最新值，加入依赖会反复解绑/重绑
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

  return {
    playTestStatuses,
    playTester,
    playDrawerAnimating,
    playerState,
    videoRef,
    latestPlayUrlRef,
    updatePlayStatus,
    handleOpenPlayTester,
    handleClosePlayTester,
    handleSelectPlayResult,
    handleSelectPlayLine,
    handleSelectPlayEpisode,
  };
}
