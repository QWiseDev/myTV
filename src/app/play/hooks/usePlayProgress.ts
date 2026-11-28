'use client';

import { MutableRefObject, useCallback, useEffect, useRef } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { generateStorageKey, savePlayRecord } from '@/lib/db.client';
import { resolvePlayRecordOriginalEpisodes } from '@/lib/play-record-original-episodes';
import type { PlayRecord, SearchResult } from '@/lib/types';
import { selectUsableImageUrl } from '@/lib/utils';

import { isNearVideoEnd } from './usePlayerInitializer';
import type { BangumiDetails, MovieDetails } from '../types';
import type { ArtPlayerLike } from '../utils/danmakuRuntime';

interface UsePlayProgressOptions {
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  currentSourceRef: MutableRefObject<string>;
  currentIdRef: MutableRefObject<string>;
  videoTitleRef: MutableRefObject<string>;
  videoCover: string;
  videoDoubanIdRef: MutableRefObject<number | null | undefined>;
  detailRef: MutableRefObject<SearchResult | null>;
  playRecords: Record<string, PlayRecord> | null;
  availableSourcesRef: MutableRefObject<SearchResult[]>;
  movieDetails: MovieDetails | null;
  bangumiDetails: BangumiDetails | null;
  currentEpisodeIndexRef: MutableRefObject<number>;
  searchTitle: string;
  lastSaveTimeRef: MutableRefObject<number>;
  releaseWakeLock: () => Promise<void> | void;
  cleanupPlayer: () => void;
  requestWakeLock: () => Promise<void> | void;
}

type PlayProgressPayload = {
  source: string;
  id: string;
  key: string;
  record: PlayRecord;
};

type BuildPlayProgressPayloadOptions = {
  player: ArtPlayerLike | null;
  currentSource: string;
  currentId: string;
  videoTitle: string;
  videoCover: string;
  videoDoubanId: number | null | undefined;
  detail: SearchResult | null;
  playRecords: Record<string, PlayRecord> | null;
  availableSources: SearchResult[];
  movieDetails: MovieDetails | null;
  bangumiDetails: BangumiDetails | null;
  currentEpisodeIndex: number;
  searchTitle: string;
};

export function buildPlayProgressPayload({
  player,
  currentSource,
  currentId,
  videoTitle,
  videoCover,
  videoDoubanId,
  detail,
  playRecords,
  availableSources,
  movieDetails,
  bangumiDetails,
  currentEpisodeIndex,
  searchTitle,
}: BuildPlayProgressPayloadOptions): PlayProgressPayload | null {
  if (!player || !currentSource || !currentId || !detail?.source_name) {
    return null;
  }

  const currentTime = player.currentTime || 0;
  const duration = player.duration || 0;

  if (currentTime < 1 || !duration || isNearVideoEnd(currentTime, duration)) {
    return null;
  }

  const key = generateStorageKey(currentSource, currentId);
  const existingRecord = playRecords?.[key];
  const currentTotalEpisodes = detail.episodes.length || 1;
  const titleToSave =
    videoTitle ||
    detail.title ||
    existingRecord?.title ||
    searchTitle ||
    existingRecord?.search_title ||
    '';

  if (!titleToSave) {
    return null;
  }

  const sourceFromList = availableSources.find(
    (source) => source.source === currentSource && source.id === currentId,
  );
  const remarksToSave = sourceFromList?.remarks || detail.remarks;
  const coverToSave = selectUsableImageUrl(
    bangumiDetails?.images?.large,
    movieDetails?.poster,
    videoCover,
    detail.poster,
    sourceFromList?.poster,
    existingRecord?.cover,
  );

  const record: PlayRecord = {
    title: titleToSave,
    source_name: detail.source_name || existingRecord?.source_name || '',
    year: detail.year || existingRecord?.year || '',
    douban_id: detail.douban_id || videoDoubanId || existingRecord?.douban_id,
    cover: coverToSave,
    index: currentEpisodeIndex + 1,
    total_episodes: currentTotalEpisodes,
    original_episodes: existingRecord?.original_episodes,
    play_time: Math.floor(currentTime),
    total_time: Math.floor(duration),
    save_time: Date.now(),
    search_title: searchTitle || existingRecord?.search_title || titleToSave,
    remarks: remarksToSave,
  };
  record.original_episodes = resolvePlayRecordOriginalEpisodes(
    existingRecord,
    record,
  );

  return {
    source: currentSource,
    id: currentId,
    key,
    record,
  };
}

function sendPlayProgressOnUnload(payload: PlayProgressPayload): void {
  const body = JSON.stringify({
    key: payload.key,
    record: payload.record,
  });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon('/api/playrecords', blob)) {
      return;
    }
  }

  fetch('/api/playrecords', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch((error) => {
    console.warn('卸载前保存播放进度失败:', error);
  });
}

export function usePlayProgress({
  artPlayerRef,
  currentSourceRef,
  currentIdRef,
  videoTitleRef,
  videoCover,
  videoDoubanIdRef,
  detailRef,
  playRecords,
  availableSourcesRef,
  movieDetails,
  bangumiDetails,
  currentEpisodeIndexRef,
  searchTitle,
  lastSaveTimeRef,
  releaseWakeLock,
  cleanupPlayer,
  requestWakeLock,
}: UsePlayProgressOptions) {
  // Use ref to track playRecords without triggering re-renders of the save function
  const playRecordsRef = useRef(playRecords);
  useEffect(() => {
    playRecordsRef.current = playRecords;
  }, [playRecords]);

  const movieDetailsRef = useRef(movieDetails);
  const bangumiDetailsRef = useRef(bangumiDetails);
  const videoCoverRef = useRef(videoCover);
  useEffect(() => {
    movieDetailsRef.current = movieDetails;
  }, [movieDetails]);
  useEffect(() => {
    bangumiDetailsRef.current = bangumiDetails;
  }, [bangumiDetails]);
  useEffect(() => {
    videoCoverRef.current = videoCover;
  }, [videoCover]);

  const saveCurrentPlayProgress = useCallback(async () => {
    const payload = buildPlayProgressPayload({
      player: artPlayerRef.current,
      currentSource: currentSourceRef.current,
      currentId: currentIdRef.current,
      videoTitle: videoTitleRef.current,
      videoCover: videoCoverRef.current,
      videoDoubanId: videoDoubanIdRef.current,
      detail: detailRef.current,
      playRecords: playRecordsRef.current,
      availableSources: availableSourcesRef.current,
      movieDetails: movieDetailsRef.current,
      bangumiDetails: bangumiDetailsRef.current,
      currentEpisodeIndex: currentEpisodeIndexRef.current,
      searchTitle,
    });

    if (!payload) return;

    try {
      await savePlayRecord(
        payload.source,
        payload.id,
        payload.record,
        playRecordsRef.current ?? undefined,
      );

      lastSaveTimeRef.current = Date.now();
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  }, [
    artPlayerRef,
    availableSourcesRef,
    currentEpisodeIndexRef,
    currentIdRef,
    currentSourceRef,
    detailRef,
    videoDoubanIdRef,
    // playRecords removed from dependencies since we use ref
    searchTitle,
    videoTitleRef,
    lastSaveTimeRef,
  ]);

  // 站内跳转离开播放页不会触发 beforeunload / visibilitychange，卸载时补存一次。
  // 进度在调用瞬间同步读取，早于页面后续 effect 清理里的播放器销毁。
  const saveCurrentPlayProgressRef = useRef(saveCurrentPlayProgress);
  useEffect(() => {
    saveCurrentPlayProgressRef.current = saveCurrentPlayProgress;
  }, [saveCurrentPlayProgress]);
  useEffect(() => {
    return () => {
      void saveCurrentPlayProgressRef.current();
    };
  }, []);

  useEffect(() => {
    let unloadSavedAt = 0;

    const saveOnPageExit = () => {
      const now = Date.now();
      // beforeunload 与 pagehide 可能在桌面端连续触发，短窗口内去重避免重复发送 beacon
      if (now - unloadSavedAt < 1000) return;
      const payload = buildPlayProgressPayload({
        player: artPlayerRef.current,
        currentSource: currentSourceRef.current,
        currentId: currentIdRef.current,
        videoTitle: videoTitleRef.current,
        videoCover: videoCoverRef.current,
        videoDoubanId: videoDoubanIdRef.current,
        detail: detailRef.current,
        playRecords: playRecordsRef.current,
        availableSources: availableSourcesRef.current,
        movieDetails: movieDetailsRef.current,
        bangumiDetails: bangumiDetailsRef.current,
        currentEpisodeIndex: currentEpisodeIndexRef.current,
        searchTitle,
      });
      if (
        payload &&
        // 访客（未登录）不保存播放进度
        getAuthInfoFromBrowserCookie()?.username
      ) {
        unloadSavedAt = now;
        sendPlayProgressOnUnload(payload);
      }
    };

    // beforeunload 期间禁止调用 cleanupPlayer()：若用户取消关闭标签页或仅触发外部协议/附件下载，
    // 页面不会卸载，提前销毁播放器会导致当前播放直接黑屏中断。
    const handleBeforeUnload = () => {
      saveOnPageExit();
      releaseWakeLock();
    };

    // 移动端 Safari / iOS 依赖 pagehide 兜底上报；非 bfcache 真实卸载时同步释放播放器
    const handlePageHide = (event: PageTransitionEvent) => {
      saveOnPageExit();
      releaseWakeLock();
      if (!event.persisted) {
        cleanupPlayer();
      }
    };

    // 顶栏/侧栏/底栏/Logo 调用 saveProgressAndNavigate 时同步派发该事件，立即发送信标避免进度丢失
    const handleSavePlayProgressEvent = () => {
      saveOnPageExit();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlayProgress();
        releaseWakeLock();
      } else if (document.visibilityState === 'visible') {
        if (artPlayerRef.current && !artPlayerRef.current.paused) {
          requestWakeLock();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('savePlayProgress', handleSavePlayProgressEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener(
        'savePlayProgress',
        handleSavePlayProgressEvent,
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    artPlayerRef,
    availableSourcesRef,
    cleanupPlayer,
    currentEpisodeIndexRef,
    currentIdRef,
    currentSourceRef,
    detailRef,
    releaseWakeLock,
    requestWakeLock,
    saveCurrentPlayProgress,
    searchTitle,
    videoDoubanIdRef,
    videoTitleRef,
  ]);

  return { saveCurrentPlayProgress };
}
