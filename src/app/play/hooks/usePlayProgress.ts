'use client';

import { MutableRefObject, useCallback, useEffect, useRef } from 'react';

import { generateStorageKey, savePlayRecord } from '@/lib/db.client';
import type { PlayRecord, SearchResult } from '@/lib/types';

import type { ArtPlayerLike } from '../utils/danmakuRuntime';

interface UsePlayProgressOptions {
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  currentSourceRef: MutableRefObject<string>;
  currentIdRef: MutableRefObject<string>;
  videoTitleRef: MutableRefObject<string>;
  videoDoubanIdRef: MutableRefObject<number | null | undefined>;
  detailRef: MutableRefObject<SearchResult | null>;
  playRecords: Record<string, PlayRecord> | null;
  availableSourcesRef: MutableRefObject<SearchResult[]>;
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
  videoDoubanId: number | null | undefined;
  detail: SearchResult | null;
  playRecords: Record<string, PlayRecord> | null;
  availableSources: SearchResult[];
  currentEpisodeIndex: number;
  searchTitle: string;
};

export function buildPlayProgressPayload({
  player,
  currentSource,
  currentId,
  videoTitle,
  videoDoubanId,
  detail,
  playRecords,
  availableSources,
  currentEpisodeIndex,
  searchTitle,
}: BuildPlayProgressPayloadOptions): PlayProgressPayload | null {
  if (!player || !currentSource || !currentId || !detail?.source_name) {
    return null;
  }

  const currentTime = player.currentTime || 0;
  const duration = player.duration || 0;

  if (currentTime < 1 || !duration) {
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

  return {
    source: currentSource,
    id: currentId,
    key,
    record: {
      title: titleToSave,
      source_name: detail.source_name || existingRecord?.source_name || '',
      year: detail.year || existingRecord?.year || '',
      douban_id: detail.douban_id || videoDoubanId || existingRecord?.douban_id,
      cover: detail.poster || existingRecord?.cover || '',
      index: currentEpisodeIndex + 1,
      total_episodes: currentTotalEpisodes,
      original_episodes: existingRecord?.original_episodes,
      play_time: Math.floor(currentTime),
      total_time: Math.floor(duration),
      save_time: Date.now(),
      search_title: searchTitle || existingRecord?.search_title || titleToSave,
      remarks: remarksToSave,
    },
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
  videoDoubanIdRef,
  detailRef,
  playRecords,
  availableSourcesRef,
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

  const saveCurrentPlayProgress = useCallback(async () => {
    const payload = buildPlayProgressPayload({
      player: artPlayerRef.current,
      currentSource: currentSourceRef.current,
      currentId: currentIdRef.current,
      videoTitle: videoTitleRef.current,
      videoDoubanId: videoDoubanIdRef.current,
      detail: detailRef.current,
      playRecords: playRecordsRef.current,
      availableSources: availableSourcesRef.current,
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
      console.log('播放进度已保存:', {
        title: payload.record.title,
        episode: payload.record.index,
        year: payload.record.year,
        douban_id: payload.record.douban_id,
        progress: `${payload.record.play_time}/${payload.record.total_time}`,
      });
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

  useEffect(() => {
    const handleBeforeUnload = () => {
      const payload = buildPlayProgressPayload({
        player: artPlayerRef.current,
        currentSource: currentSourceRef.current,
        currentId: currentIdRef.current,
        videoTitle: videoTitleRef.current,
        videoDoubanId: videoDoubanIdRef.current,
        detail: detailRef.current,
        playRecords: playRecordsRef.current,
        availableSources: availableSourcesRef.current,
        currentEpisodeIndex: currentEpisodeIndexRef.current,
        searchTitle,
      });
      if (payload) {
        sendPlayProgressOnUnload(payload);
      }
      releaseWakeLock();
      cleanupPlayer();
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
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
