'use client';

import { MutableRefObject, useEffect, useRef } from 'react';

import type { SearchResult } from '@/lib/types';

import {
  ArtPlayerLike,
  clearDanmakuDisplay,
  DanmakuItemLike,
  DanmakuPluginLike,
  isDanmakuAbortError,
  renderDanmakuList,
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
  const syncGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++syncGenerationRef.current;
    const isCurrentGeneration = () => syncGenerationRef.current === generation;

    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
      episodeSwitchTimeoutRef.current = null;
    }

    if (!isSourceChangingRef.current) {
      isEpisodeChangingRef.current = true;
      isSkipControllerTriggeredRef.current = false;
      videoEndedHandledRef.current = false;
    }

    updateVideoUrl(detail, currentEpisodeIndex);

    if (isSourceChangingRef.current) {
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

      const timeoutId = setTimeout(async () => {
        const art = artPlayerRef.current;

        try {
          if (!art?.plugins?.artplayerPluginDanmuku) {
            return;
          }

          const danmaku = await loadExternalDanmu();
          if (!isCurrentGeneration() || artPlayerRef.current !== art) {
            return;
          }

          renderDanmakuList(art, danmaku, {
            preserveHidden: Boolean(danmuPluginStateRef.current?.isHide),
            showNotice: true,
          });
        } catch (error) {
          if (!isCurrentGeneration() || artPlayerRef.current !== art) {
            return;
          }
          if (isDanmakuAbortError(error)) return;
          console.error('集数变化后加载外部弹幕失败:', error);
          showDanmakuErrorNotice(art, error);
        } finally {
          if (episodeSwitchTimeoutRef.current === timeoutId) {
            episodeSwitchTimeoutRef.current = null;
          }
        }
      }, 800);
      episodeSwitchTimeoutRef.current = timeoutId;
    }
    return () => {
      if (syncGenerationRef.current === generation) {
        syncGenerationRef.current += 1;
      }
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
