import { MutableRefObject, useEffect, useRef } from 'react';

import { generateStorageKey } from '@/lib/db.client';
import type { PlayRecord } from '@/lib/types';

import type { ArtPlayerLike } from '../utils/danmakuRuntime';

interface UsePlayRecordSyncOptions {
  currentSource: string | null;
  currentId: string | null;
  totalEpisodes: number;
  playRecords: Record<string, PlayRecord> | null;
  currentEpisodeIndexRef: MutableRefObject<number>;
  isEpisodeChangingRef: MutableRefObject<boolean>;
  isSourceChangingRef: MutableRefObject<boolean>;
  setCurrentEpisodeIndex: (index: number) => void;
  resumeTimeRef: MutableRefObject<number | null>;
  playRecordKeyRef: MutableRefObject<string | null>;
  playRecordAppliedRef: MutableRefObject<boolean>;
  artPlayerRef?: MutableRefObject<ArtPlayerLike | null>;
  isRestoringFromRecordRef: MutableRefObject<boolean>;
}

interface ShouldRestorePlayRecordTimeOptions {
  targetTime: number;
  isRestoringFromRecord: boolean;
  isEpisodeChanging: boolean;
  isSourceChanging: boolean;
  isSameEpisodeRecord: boolean;
}

export function shouldRestorePlayRecordTime({
  targetTime,
  isRestoringFromRecord,
  isEpisodeChanging,
  isSourceChanging,
  isSameEpisodeRecord,
}: ShouldRestorePlayRecordTimeOptions): boolean {
  if (typeof targetTime !== 'number' || targetTime <= 0) {
    return false;
  }

  return (
    isRestoringFromRecord ||
    (!isSourceChanging && (isSameEpisodeRecord || !isEpisodeChanging))
  );
}

/**
 * 负责在页面初始化时同步播放记录，避免切换集数时被旧记录覆盖。
 */
export const usePlayRecordSync = ({
  currentSource,
  currentId,
  totalEpisodes,
  playRecords,
  currentEpisodeIndexRef,
  isEpisodeChangingRef,
  isSourceChangingRef,
  setCurrentEpisodeIndex,
  resumeTimeRef,
  playRecordKeyRef,
  playRecordAppliedRef,
  artPlayerRef,
  isRestoringFromRecordRef,
}: UsePlayRecordSyncOptions) => {
  // 使用 useRef 来跟踪上次应用的播放记录，避免引用变化导致的重复处理
  const lastRecordRef = useRef<{ key: string; record: PlayRecord } | null>(
    null,
  );

  useEffect(() => {
    if (!currentSource || !currentId || !playRecords || totalEpisodes <= 0) {
      return;
    }

    try {
      const key = generateStorageKey(currentSource, currentId);
      const record = playRecords[key];

      const lastEntry = lastRecordRef.current;
      const lastRecord = lastEntry?.key === key ? lastEntry.record : undefined;

      // 仅比较关键字段，避免每次渲染深拷贝与 JSON.stringify
      if (
        lastRecord &&
        record &&
        lastRecord.index === record.index &&
        lastRecord.play_time === record.play_time &&
        lastRecord.save_time === record.save_time
      ) {
        return;
      }

      lastRecordRef.current = record ? { key, record } : null;

      if (playRecordKeyRef.current !== key) {
        playRecordKeyRef.current = key;
        playRecordAppliedRef.current = false;
      }

      if (playRecordAppliedRef.current || !record) {
        return;
      }

      const targetIndex = record.index - 1;
      const targetTime = record.play_time;
      const isValidTargetEpisode =
        targetIndex >= 0 && targetIndex < totalEpisodes;
      const isSameEpisodeRecord =
        targetIndex === currentEpisodeIndexRef.current;

      if (isValidTargetEpisode && !isSameEpisodeRecord) {
        isRestoringFromRecordRef.current = true;
        setCurrentEpisodeIndex(targetIndex);
      }

      // 首次挂载时 useEpisodeDanmuSync 会先标记一次“集数切换”以装载 URL。
      // 如果播放记录正好是当前集，仍应恢复进度，否则刷新首集会从头播放。
      const shouldRestoreTime = shouldRestorePlayRecordTime({
        targetTime,
        isRestoringFromRecord: isRestoringFromRecordRef.current,
        isEpisodeChanging: isEpisodeChangingRef.current,
        isSourceChanging: isSourceChangingRef.current,
        isSameEpisodeRecord,
      });

      if (shouldRestoreTime) {
        resumeTimeRef.current = targetTime;
        isRestoringFromRecordRef.current = true;

        // 仅当播放器当前已在播放目标集时才尝试即时 seek；
        // 若即将切换到其他集，必须保留 resumeTimeRef 交由目标集的 video:canplay 消费，
        // 避免误 seek 旧集并提前清空 resumeTimeRef 导致目标集从 00:00 起播。
        if (isSameEpisodeRecord && artPlayerRef?.current) {
          const player = artPlayerRef.current;

          const duration =
            player.duration ||
            player.video?.duration ||
            player?.$video?.duration ||
            0;

          if (player.video || player.$video) {
            let target = targetTime;

            if (duration && !Number.isNaN(duration) && duration > 0) {
              if (target >= duration - 2) {
                target = Math.max(0, duration - 5);
              }
            }

            try {
              const videoElement = player.video || player.$video;
              if (videoElement) {
                videoElement.currentTime = target;
              }

              player.currentTime = target;

              const readyState = videoElement?.readyState || 0;
              if (readyState >= 2) {
                resumeTimeRef.current = null;
                isRestoringFromRecordRef.current = false;
              }
            } catch (error) {
              console.warn('即时恢复播放进度失败，将等待播放器事件:', error);
            }
          }
        }
      } else if (isValidTargetEpisode && !isSameEpisodeRecord) {
        // 无有效续播时间时无需继续保持恢复标记
        isRestoringFromRecordRef.current = false;
      }

      playRecordAppliedRef.current = true;
    } catch (error) {
      console.error('读取播放记录失败:', error);
    }
  }, [
    currentSource,
    currentId,
    playRecords,
    totalEpisodes,
    currentEpisodeIndexRef,
    isEpisodeChangingRef,
    isSourceChangingRef,
    setCurrentEpisodeIndex,
    resumeTimeRef,
    playRecordKeyRef,
    playRecordAppliedRef,
    artPlayerRef,
    isRestoringFromRecordRef,
  ]);
};
