'use client';

import { MutableRefObject, useCallback, useRef } from 'react';

import {
  ArtPlayerLike,
  clearDanmakuDisplay,
  createDanmakuLoadManager,
  DanmakuItemLike,
  loadAndRenderDanmaku,
  showDanmakuErrorNotice,
} from '../utils/danmakuRuntime';

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
    const latestEpisodeIndex = currentEpisodeIndexRef.current;
    const latestOffset = danmuEpisodeOffsetRef.current;

    danmuLoadingRef.current = true;

    const loadPromise = loadManagerRef.current.load({
      enabled: externalDanmuEnabledRef.current,
      videoTitle: videoTitleRef.current,
      videoYear: videoYearRef.current,
      videoDoubanId: videoDoubanIdRef.current,
      videoUrl: videoUrlRef.current,
      episodeIndex: latestEpisodeIndex,
      episodeOffset: latestOffset,
      source: currentSourceRef.current,
    });
    lastDanmuLoadKeyRef.current = loadManagerRef.current.activeKey;
    const danmaku = await loadPromise.catch((error) => {
      console.error('加载外部弹幕失败:', error);
      return [];
    });
    danmuLoadingRef.current = false;
    return danmaku;
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

      try {
        localStorage.setItem('enable_external_danmu', String(nextState));
      } catch (e) {
        console.warn('localStorage设置失败:', e);
      }

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

          await loadAndRenderDanmaku(art, loadExternalDanmu, {
            preserveHidden: false,
            showNotice: true,
          });
        } catch (error) {
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
