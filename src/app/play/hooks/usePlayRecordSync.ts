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
  isInitialLoad: boolean;
  isRestoringFromRecord: boolean;
  isEpisodeChanging: boolean;
  isSourceChanging: boolean;
  isSameEpisodeRecord: boolean;
}

export function shouldRestorePlayRecordTime({
  targetTime,
  isInitialLoad,
  isRestoringFromRecord,
  isEpisodeChanging,
  isSourceChanging,
  isSameEpisodeRecord,
}: ShouldRestorePlayRecordTimeOptions): boolean {
  if (typeof targetTime !== 'number' || targetTime <= 0) {
    return false;
  }

  return (
    isInitialLoad ||
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
  // 使用 useRef 来跟踪上次的播放记录，避免引用变化导致的无限循环
  const lastPlayRecordsRef = useRef<Record<string, PlayRecord> | null>(null);

  useEffect(() => {
    if (!currentSource || !currentId || !playRecords || totalEpisodes <= 0) {
      return;
    }

    try {
      const key = generateStorageKey(currentSource, currentId);
      const record = playRecords[key];

      // 🔧 修复：检查播放记录是否真的发生了变化，避免引用变化导致的无限循环
      const lastRecord = lastPlayRecordsRef.current?.[key];

      // 只有当两个记录都存在且内容完全相同时才跳过
      if (
        lastRecord &&
        record &&
        JSON.stringify(lastRecord) === JSON.stringify(record)
      ) {
        // 播放记录内容没有变化，跳过处理
        return;
      }

      // 更新上次播放记录的引用
      lastPlayRecordsRef.current = { ...playRecords };

      if (playRecordKeyRef.current !== key) {
        playRecordKeyRef.current = key;
        playRecordAppliedRef.current = false;
      }

      if (playRecordAppliedRef.current || !record) {
        return;
      }

      const targetIndex = record.index - 1;
      const targetTime = record.play_time;

      console.log('[PlayRecordSync] 收到播放记录', {
        key,
        targetIndex,
        targetTime,
        totalEpisodes,
        currentEpisodeIndex: currentEpisodeIndexRef.current,
      });

      if (
        targetIndex >= 0 &&
        targetIndex < totalEpisodes &&
        targetIndex !== currentEpisodeIndexRef.current
      ) {
        console.log('[PlayRecordSync] 更新当前集数到记录值', targetIndex + 1);
        isRestoringFromRecordRef.current = true;
        setCurrentEpisodeIndex(targetIndex);
      }

      const urlParams = new URLSearchParams(window.location.search);
      const urlIndex = parseInt(urlParams.get('episode') || '0', 10);
      const isInitialLoad = urlIndex > 0 && urlIndex === targetIndex + 1;
      const isSameEpisodeRecord =
        targetIndex === currentEpisodeIndexRef.current;

      // 首次挂载时 useEpisodeDanmuSync 会先标记一次“集数切换”以装载 URL。
      // 如果播放记录正好是当前集，仍应恢复进度，否则刷新首集会从头播放。
      const shouldRestoreTime = shouldRestorePlayRecordTime({
        targetTime,
        isInitialLoad,
        isRestoringFromRecord: isRestoringFromRecordRef.current,
        isEpisodeChanging: isEpisodeChangingRef.current,
        isSourceChanging: isSourceChangingRef.current,
        isSameEpisodeRecord,
      });

      if (shouldRestoreTime) {
        console.log('[PlayRecordSync] 写入待恢复进度', targetTime);
        resumeTimeRef.current = targetTime;
        isRestoringFromRecordRef.current = true;

        // 🔥 关键修复：如果播放器已经就绪，尝试立即恢复进度
        if (artPlayerRef?.current) {
          const player = artPlayerRef.current;

          // 🎯 使用多种方式获取视频时长,确保能够获取到有效值
          const duration =
            player.duration ||
            player.video?.duration ||
            player?.$video?.duration ||
            0;

          // 🔥 修复：即使 duration 为 0，也要设置 currentTime
          // 因为视频可能还在加载中，直接设置 currentTime 会让播放器在加载完成后跳转到该位置
          if (player.video || player.$video) {
            let target = targetTime;

            // 只有在知道视频时长的情况下才调整目标时间
            if (duration && !Number.isNaN(duration) && duration > 0) {
              if (target >= duration - 2) {
                target = Math.max(0, duration - 5);
              }
            }

            try {
              console.log('[PlayRecordSync] 即时恢复尝试', {
                duration: duration || '未知',
                target,
                videoElement: player.video || player.$video,
                readyState: (player.video || player.$video)?.readyState,
              });

              // 🔥 直接设置 video 元素的 currentTime，更可靠
              const videoElement = player.video || player.$video;
              if (videoElement) {
                videoElement.currentTime = target;
                console.log('✅ 已设置视频元素的 currentTime:', target);
              }

              // 同时也设置播放器的 currentTime（双重保障）
              player.currentTime = target;

              // 🔥 关键：只有在视频已经加载了足够数据时才清空 resumeTimeRef
              // readyState >= 2 表示至少有当前帧的数据
              const readyState = videoElement?.readyState || 0;
              if (readyState >= 2) {
                resumeTimeRef.current = null;
                isRestoringFromRecordRef.current = false;
                console.log('✅ 即时恢复播放进度成功:', targetTime);
              } else {
                console.log(
                  '⏳ 视频尚未准备好，保留 resumeTimeRef 等待 canplay 事件',
                );
              }
            } catch (error) {
              console.warn('即时恢复播放进度失败，将等待播放器事件:', error);
              // 保留 resumeTimeRef，等待 video:canplay 事件再次恢复
            }
          } else {
            console.log(
              '⏳ 播放器视频元素尚未创建，保留 resumeTimeRef 等待 canplay 事件',
            );
          }
        } else {
          console.log('⏳ 播放器尚未初始化，保留 resumeTimeRef 等待播放器就绪');
        }
      }

      // 🎯 集数变化时更新状态，重置恢复标记避免循环
      if (
        targetIndex >= 0 &&
        targetIndex < totalEpisodes &&
        targetIndex !== currentEpisodeIndexRef.current
      ) {
        console.log('[PlayRecordSync] 检测到集数变化，重置恢复标记');
        isRestoringFromRecordRef.current = false; // 确保用户手动操作时重置恢复标记
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
