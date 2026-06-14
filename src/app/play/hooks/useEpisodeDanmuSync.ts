'use client';

import { MutableRefObject, useEffect } from 'react';

import type { SearchResult } from '@/lib/types';

import {
  ArtPlayerLike,
  clearDanmakuDisplay,
  DanmakuItemLike,
  DanmakuPluginLike,
  loadAndRenderDanmaku,
  showDanmakuErrorNotice,
} from '../utils/danmakuRuntime';

type DanmakuPluginStateSnapshot = Pick<
  DanmakuPluginLike,
  'isHide' | 'isStop' | 'option'
>;

interface UseEpisodeDanmuSyncParams {
  detail: SearchResult | null;
  currentEpisodeIndex: number;
  updateVideoUrl: (
    detailData: SearchResult | null,
    episodeIndex: number,
  ) => void | Promise<void>;
  isSourceChangingRef: MutableRefObject<boolean>;
  isEpisodeChangingRef: MutableRefObject<boolean>;
  isSkipControllerTriggeredRef: MutableRefObject<boolean>;
  videoEndedHandledRef: MutableRefObject<boolean>;
  lastDanmuLoadKeyRef: MutableRefObject<string>;
  danmuLoadingRef: MutableRefObject<boolean>;
  episodeSwitchTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  danmuPluginStateRef: MutableRefObject<DanmakuPluginStateSnapshot | null>;
  loadExternalDanmu: () => Promise<DanmakuItemLike[]>;
}

export function useEpisodeDanmuSync({
  detail,
  currentEpisodeIndex,
  updateVideoUrl,
  isSourceChangingRef,
  isEpisodeChangingRef,
  isSkipControllerTriggeredRef,
  videoEndedHandledRef,
  lastDanmuLoadKeyRef,
  danmuLoadingRef,
  episodeSwitchTimeoutRef,
  artPlayerRef,
  danmuPluginStateRef,
  loadExternalDanmu,
}: UseEpisodeDanmuSyncParams) {
  useEffect(() => {
    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
      episodeSwitchTimeoutRef.current = null;
    }

    if (!isSourceChangingRef.current) {
      isEpisodeChangingRef.current = true;
      isSkipControllerTriggeredRef.current = false;
      videoEndedHandledRef.current = false;
      console.log('🔄 开始切换集数，重置自动跳过标志');
    }

    updateVideoUrl(detail, currentEpisodeIndex);

    if (isSourceChangingRef.current) {
      console.log('⏭️ 正在换源，跳过弹幕处理');
      return;
    }

    lastDanmuLoadKeyRef.current = '';
    danmuLoadingRef.current = false;

    if (
      artPlayerRef.current &&
      artPlayerRef.current.plugins?.artplayerPluginDanmuku
    ) {
      const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
      danmuPluginStateRef.current = {
        isHide: plugin.isHide,
        isStop: plugin.isStop,
        option: plugin.option,
      };
      clearDanmakuDisplay(artPlayerRef.current);

      episodeSwitchTimeoutRef.current = setTimeout(async () => {
        const art = artPlayerRef.current;

        try {
          if (!art?.plugins?.artplayerPluginDanmuku) {
            return;
          }

          await loadAndRenderDanmaku(art, loadExternalDanmu, {
            preserveHidden: Boolean(danmuPluginStateRef.current?.isHide),
            showNotice: true,
          });
        } catch (error) {
          console.error('集数变化后加载外部弹幕失败:', error);
          showDanmakuErrorNotice(art, error);
        } finally {
          episodeSwitchTimeoutRef.current = null;
        }
      }, 800);
    }
    return () => {
      if (episodeSwitchTimeoutRef.current) {
        clearTimeout(episodeSwitchTimeoutRef.current);
        episodeSwitchTimeoutRef.current = null;
      }
    };
  }, [
    artPlayerRef,
    currentEpisodeIndex,
    danmuLoadingRef,
    danmuPluginStateRef,
    detail,
    episodeSwitchTimeoutRef,
    isEpisodeChangingRef,
    isSkipControllerTriggeredRef,
    isSourceChangingRef,
    lastDanmuLoadKeyRef,
    loadExternalDanmu,
    updateVideoUrl,
    videoEndedHandledRef,
  ]); // loadExternalDanmu 必须在依赖中，否则会使用过期的闭包导致请求错误集数的弹幕
}
