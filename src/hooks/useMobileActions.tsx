import {
  ExternalLink,
  Heart,
  Link,
  PlayCircleIcon,
  Trash2,
} from 'lucide-react';
import React, { useMemo } from 'react';

import { VideoCardConfig } from '@/lib/video-card-utils';

const createMobileActionEvent = (): React.MouseEvent =>
  ({
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }) as React.MouseEvent;

export interface MobileAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: 'primary' | 'danger' | 'default';
  disabled?: boolean;
}

interface UseMobileActionsParams {
  config: VideoCardConfig;
  from: string;
  origin?: 'vod' | 'live';
  source?: string;
  id?: string;
  doubanId?: number;
  isBangumi?: boolean;
  isAggregate?: boolean;
  favorited: boolean;
  searchFavorited: boolean | null;
  onPlay: () => void;
  onPlayNewTab: () => void;
  onToggleFavorite: (e: React.MouseEvent) => Promise<void>;
  onDeleteRecord: (e: React.MouseEvent) => Promise<void>;
}

/**
 * 生成移动端操作菜单配置的 Hook
 */
export function useMobileActions({
  config,
  from,
  origin = 'vod',
  source,
  id,
  doubanId,
  isBangumi = false,
  favorited,
  searchFavorited,
  onPlay,
  onPlayNewTab,
  onToggleFavorite,
  onDeleteRecord,
}: UseMobileActionsParams): MobileAction[] {
  return useMemo(() => {
    const actions: MobileAction[] = [];

    // 播放操作
    if (config.showPlayButton) {
      actions.push({
        id: 'play',
        label: origin === 'live' ? '观看直播' : '播放',
        icon: <PlayCircleIcon size={20} />,
        onClick: onPlay,
        color: 'primary',
      });

      actions.push({
        id: 'play-new-tab',
        label: origin === 'live' ? '新标签页观看' : '新标签页播放',
        icon: <ExternalLink size={20} />,
        onClick: onPlayNewTab,
        color: 'default',
      });
    }

    // 收藏/取消收藏操作
    if (config.showHeart && from !== 'douban' && source && id) {
      const currentFavorited = from === 'search' ? searchFavorited : favorited;

      if (from === 'search') {
        if (searchFavorited !== null) {
          actions.push({
            id: 'favorite',
            label: currentFavorited ? '取消收藏' : '添加收藏',
            icon: currentFavorited ? (
              <Heart size={20} className='fill-red-600 stroke-red-600' />
            ) : (
              <Heart size={20} className='fill-transparent stroke-red-500' />
            ),
            onClick: () => {
              void onToggleFavorite(createMobileActionEvent());
            },
            color: currentFavorited ? 'danger' : 'default',
          });
        } else {
          actions.push({
            id: 'favorite-loading',
            label: '收藏加载中...',
            icon: <Heart size={20} />,
            onClick: () => undefined,
            disabled: true,
          });
        }
      } else {
        actions.push({
          id: 'favorite',
          label: currentFavorited ? '取消收藏' : '添加收藏',
          icon: currentFavorited ? (
            <Heart size={20} className='fill-red-600 stroke-red-600' />
          ) : (
            <Heart size={20} className='fill-transparent stroke-red-500' />
          ),
          onClick: () => {
            void onToggleFavorite(createMobileActionEvent());
          },
          color: currentFavorited ? 'danger' : 'default',
        });
      }
    }

    // 删除播放记录操作
    if (config.showCheckCircle && from === 'playrecord' && source && id) {
      actions.push({
        id: 'delete',
        label: '删除记录',
        icon: <Trash2 size={20} />,
        onClick: () => {
          void onDeleteRecord(createMobileActionEvent());
        },
        color: 'danger',
      });
    }

    // 豆瓣/Bangumi 链接
    if (config.showDoubanLink && doubanId && doubanId !== 0) {
      actions.push({
        id: 'douban',
        label: isBangumi ? 'Bangumi 详情' : '豆瓣详情',
        icon: <Link size={20} />,
        onClick: () => {
          const url = isBangumi
            ? `https://bgm.tv/subject/${doubanId}`
            : `https://movie.douban.com/subject/${doubanId}`;
          window.open(url, '_blank', 'noopener,noreferrer');
        },
        color: 'default',
      });
    }

    return actions;
  }, [
    config,
    from,
    origin,
    source,
    id,
    doubanId,
    isBangumi,
    favorited,
    searchFavorited,
    onPlay,
    onPlayNewTab,
    onToggleFavorite,
    onDeleteRecord,
  ]);
}
