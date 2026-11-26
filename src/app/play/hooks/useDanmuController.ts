'use client';

import { MutableRefObject, useCallback, useRef } from 'react';

import { analytics } from '@/lib/analytics';
import {
  danmakuMediaKey,
  fetchSharedDanmakuSelection,
  readDanmakuSelection,
} from '@/lib/danmaku';

import {
  ArtPlayerLike,
  clearDanmakuDisplay,
  createDanmakuLoadManager,
  createDanmakuRequest,
  DanmakuItemLike,
  isDanmakuAbortError,
  renderDanmakuList,
  showDanmakuErrorNotice,
} from '../utils/danmakuRuntime';
import { writeExternalDanmuPref } from '../utils/danmuPreference';

interface UseDanmuControllerParams {
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  danmuOperationTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  externalDanmuEnabledRef: MutableRefObject<boolean>;
  setExternalDanmuEnabled: (enabled: boolean) => void;
  videoTitleRef: MutableRefObject<string>;
  videoYearRef: MutableRefObject<string | undefined>;
  videoDoubanIdRef: MutableRefObject<number | null | undefined>;
  videoUrlRef: MutableRefObject<string>;
  currentEpisodeIndexRef: MutableRefObject<number>; // 🔧 新增：使用 ref 获取最新集数
  /** 本地集名（综艺智能匹配：日期/版式/序数打分用） */
  episodeTitleRef: MutableRefObject<string>;
  /** 本地集名在同版式内的序数（从 1 起） */
  variantEpisodeRef: MutableRefObject<number>;
  danmuLoadingRef: MutableRefObject<boolean>;
  lastDanmuLoadKeyRef: MutableRefObject<string>;
  currentSourceRef: MutableRefObject<string>;
  danmuEpisodeOffsetRef?: MutableRefObject<number>;
  canUseSharedCacheRef?: MutableRefObject<boolean>;
}

export function useDanmuController({
  artPlayerRef,
  danmuOperationTimeoutRef,
  externalDanmuEnabledRef,
  setExternalDanmuEnabled,
  videoTitleRef,
  videoYearRef,
  videoDoubanIdRef,
  videoUrlRef,
  currentEpisodeIndexRef, // 🔧 新增
  episodeTitleRef,
  variantEpisodeRef,
  danmuLoadingRef,
  lastDanmuLoadKeyRef,
  currentSourceRef,
  danmuEpisodeOffsetRef,
  canUseSharedCacheRef,
}: UseDanmuControllerParams) {
  const loadManagerRef = useRef(createDanmakuLoadManager());

  const resetDanmuLoadState = useCallback(() => {
    loadManagerRef.current.reset();
    danmuLoadingRef.current = false;
    lastDanmuLoadKeyRef.current = '';
  }, [danmuLoadingRef, lastDanmuLoadKeyRef]);

  const loadExternalDanmu = useCallback(async (): Promise<
    DanmakuItemLike[]
  > => {
    const canUseSharedCache = canUseSharedCacheRef?.current !== false;
    const episodeOffset = danmuEpisodeOffsetRef?.current ?? 0;
    // 手动选择解析：本地选择优先；本地没有时采用其他用户的选择作为默认。
    const mediaKey = danmakuMediaKey(
      videoTitleRef.current,
      videoYearRef.current,
      videoDoubanIdRef.current,
    );
    const selectionEpisode = currentEpisodeIndexRef.current + episodeOffset;
    const localSelection = readDanmakuSelection(mediaKey, selectionEpisode);
    const manualSelection =
      localSelection || !canUseSharedCache
        ? null
        : await fetchSharedDanmakuSelection(mediaKey, selectionEpisode);
    const manualEpisodeId =
      localSelection?.episodeId ?? manualSelection?.episodeId;

    if (!localSelection && canUseSharedCache) {
      // 共享选择的请求期间媒体可能已切换（换集/换源），此时丢弃结果，
      // 由切换流程自身的重新加载接管，避免给新集数挂上旧集的选择。
      const mediaNow = danmakuMediaKey(
        videoTitleRef.current,
        videoYearRef.current,
        videoDoubanIdRef.current,
      );
      const episodeNow =
        currentEpisodeIndexRef.current + (danmuEpisodeOffsetRef?.current ?? 0);
      if (mediaNow !== mediaKey || episodeNow !== selectionEpisode) {
        const error = new Error('弹幕请求媒体已变化');
        error.name = 'AbortError';
        throw error;
      }
    }

    const getCurrentRequestInput = () => ({
      manualEpisodeId,
      enabled: externalDanmuEnabledRef.current,
      videoTitle: videoTitleRef.current,
      videoYear: videoYearRef.current,
      videoDoubanId: videoDoubanIdRef.current,
      videoUrl: videoUrlRef.current,
      episodeIndex: currentEpisodeIndexRef.current,
      episodeOffset: danmuEpisodeOffsetRef?.current ?? 0,
      episodeTitle: episodeTitleRef.current,
      variantEpisode: variantEpisodeRef.current,
      source: currentSourceRef.current,
      allowRemoteCache: canUseSharedCache,
    });
    const requestInput = getCurrentRequestInput();
    const requestIdentity = createDanmakuRequest(requestInput);

    danmuLoadingRef.current = true;

    // 弹幕加载埋点：耗时 / 条数 / 失败（缓存命中与真实请求一并统计）
    const danmuLoadStartedAt = Date.now();

    const loadPromise = loadManagerRef.current.load(requestInput);
    const requestKey = loadManagerRef.current.activeKey;
    lastDanmuLoadKeyRef.current = requestKey;

    try {
      const danmaku = await loadPromise;
      const currentIdentity = createDanmakuRequest(getCurrentRequestInput());

      if (
        currentIdentity?.key !== requestIdentity?.key ||
        currentIdentity?.source !== requestIdentity?.source
      ) {
        const error = new Error('弹幕请求媒体已变化');
        error.name = 'AbortError';
        throw error;
      }

      analytics.trackFeatureUsage('danmu_loaded', true, {
        count: danmaku.length,
        duration_ms: Date.now() - danmuLoadStartedAt,
        manual_selected: Boolean(manualEpisodeId),
      });

      return danmaku;
    } catch (error) {
      if (isDanmakuAbortError(error)) {
        throw error;
      }
      analytics.trackError(
        'danmu_load_failed',
        error instanceof Error ? error.message : '弹幕加载失败',
        { duration_ms: Date.now() - danmuLoadStartedAt },
      );
      console.error('加载外部弹幕失败:', error);
      throw error;
    } finally {
      const activeKey = loadManagerRef.current.activeKey;
      if (!activeKey || activeKey === requestKey) {
        danmuLoadingRef.current = false;
      }
    }
  }, [
    currentSourceRef,
    currentEpisodeIndexRef,
    danmuEpisodeOffsetRef,
    canUseSharedCacheRef,
    episodeTitleRef,
    variantEpisodeRef,
    danmuLoadingRef,
    externalDanmuEnabledRef,
    videoDoubanIdRef,
    videoTitleRef,
    videoYearRef,
    videoUrlRef,
    lastDanmuLoadKeyRef,
  ]);

  const handleDanmuOperationOptimized = useCallback(
    (nextState: boolean) => {
      if (danmuOperationTimeoutRef.current) {
        clearTimeout(danmuOperationTimeoutRef.current);
      }

      externalDanmuEnabledRef.current = nextState;
      setExternalDanmuEnabled(nextState);
      try {
        artPlayerRef.current?.setting?.update?.({
          name: 'external-danmu',
          tooltip: nextState ? '已开启' : '已关闭',
        });
      } catch {
        /* 设置项未挂载时忽略 */
      }

      writeExternalDanmuPref(nextState);

      danmuOperationTimeoutRef.current = setTimeout(async () => {
        const art = artPlayerRef.current;
        const plugin = art?.plugins?.artplayerPluginDanmuku;
        if (!plugin) return;

        try {
          if (!nextState) {
            resetDanmuLoadState();
            clearDanmakuDisplay(art, { hide: true });
            if (art.notice) {
              art.notice.show = '外部弹幕已关闭';
            }
            return;
          }

          const danmaku = await loadExternalDanmu();
          if (
            !externalDanmuEnabledRef.current ||
            artPlayerRef.current !== art
          ) {
            return;
          }

          renderDanmakuList(art, danmaku, {
            preserveHidden: false,
            showNotice: true,
          });
        } catch (error) {
          if (
            !externalDanmuEnabledRef.current ||
            artPlayerRef.current !== art
          ) {
            return;
          }
          if (isDanmakuAbortError(error)) return;
          console.error('弹幕开关操作失败:', error);
          showDanmakuErrorNotice(art, error);
        }
      }, 300);
    },
    [
      artPlayerRef,
      danmuOperationTimeoutRef,
      loadExternalDanmu,
      resetDanmuLoadState,
      setExternalDanmuEnabled,
      externalDanmuEnabledRef,
    ],
  );

  return {
    handleDanmuOperationOptimized,
    loadExternalDanmu,
  };
}
