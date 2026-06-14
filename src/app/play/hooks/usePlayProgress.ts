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
    if (
      !artPlayerRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const player = artPlayerRef.current;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      const key = generateStorageKey(
        currentSourceRef.current,
        currentIdRef.current,
      );
      const existingRecord = playRecordsRef.current?.[key];
      const currentTotalEpisodes = detailRef.current?.episodes.length || 1;
      const titleToSave =
        videoTitleRef.current ||
        detailRef.current?.title ||
        existingRecord?.title ||
        searchTitle ||
        existingRecord?.search_title ||
        '';

      if (!titleToSave) {
        return;
      }

      const sourceFromList = availableSourcesRef.current?.find(
        (s) =>
          s.source === currentSourceRef.current &&
          s.id === currentIdRef.current,
      );
      const remarksToSave =
        sourceFromList?.remarks || detailRef.current?.remarks;

      await savePlayRecord(
        currentSourceRef.current,
        currentIdRef.current,
        {
          title: titleToSave,
          source_name:
            detailRef.current?.source_name || existingRecord?.source_name || '',
          year: detailRef.current?.year || existingRecord?.year || '',
          douban_id:
            detailRef.current?.douban_id ||
            videoDoubanIdRef.current ||
            existingRecord?.douban_id,
          cover: detailRef.current?.poster || existingRecord?.cover || '',
          index: currentEpisodeIndexRef.current + 1,
          total_episodes: currentTotalEpisodes,
          original_episodes: existingRecord?.original_episodes,
          play_time: Math.floor(currentTime),
          total_time: Math.floor(duration),
          save_time: Date.now(),
          search_title:
            searchTitle || existingRecord?.search_title || titleToSave,
          remarks: remarksToSave,
        },
        playRecordsRef.current ?? undefined,
      );

      lastSaveTimeRef.current = Date.now();
      console.log('播放进度已保存:', {
        title: titleToSave,
        episode: currentEpisodeIndexRef.current + 1,
        year: detailRef.current?.year || existingRecord?.year,
        douban_id:
          detailRef.current?.douban_id ||
          videoDoubanIdRef.current ||
          existingRecord?.douban_id,
        progress: `${Math.floor(currentTime)}/${Math.floor(duration)}`,
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
      saveCurrentPlayProgress();
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
    cleanupPlayer,
    releaseWakeLock,
    requestWakeLock,
    saveCurrentPlayProgress,
  ]);

  return { saveCurrentPlayProgress };
}
