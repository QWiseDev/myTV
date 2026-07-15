'use client';

import { MutableRefObject, useCallback, useRef } from 'react';

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
  danmuLoadingRef: MutableRefObject<boolean>;
  lastDanmuLoadKeyRef: MutableRefObject<string>;
  currentSourceRef: MutableRefObject<string>;
  danmuEpisodeOffsetRef: MutableRefObject<number>; // 🔧 新增：使用 ref 获取最新偏移
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
  danmuLoadingRef,
  lastDanmuLoadKeyRef,
  currentSourceRef,
  danmuEpisodeOffsetRef, // 🔧 新增
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
    const getCurrentRequestInput = () => ({
      enabled: externalDanmuEnabledRef.current,
      videoTitle: videoTitleRef.current,
      videoYear: videoYearRef.current,
      videoDoubanId: videoDoubanIdRef.current,
      videoUrl: videoUrlRef.current,
      episodeIndex: currentEpisodeIndexRef.current,
      episodeOffset: danmuEpisodeOffsetRef.current,
      source: currentSourceRef.current,
    });
    const requestInput = getCurrentRequestInput();
    const requestIdentity = createDanmakuRequest(requestInput);

    danmuLoadingRef.current = true;

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

      return danmaku;
    } catch (error) {
      if (isDanmakuAbortError(error)) {
        throw error;
      }
      console.error('加载外部弹幕失败:', error);
      return [];
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
