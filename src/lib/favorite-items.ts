import { parseStorageKey } from './storage-key';
import type { FavoriteItem, PlayRecord } from './types';

export interface FavoriteRecord {
  title: string;
  source_name: string;
  year: string;
  cover: string;
  total_episodes: number;
  save_time: number;
  search_title?: string;
  origin?: 'vod' | 'live';
}

export function buildFavoriteItems(
  allFavorites: Record<string, FavoriteRecord>,
  allPlayRecords?: Record<string, PlayRecord> | null,
): FavoriteItem[] {
  return Object.entries(allFavorites)
    .sort(([, a], [, b]) => b.save_time - a.save_time)
    .flatMap(([key, favorite]) => {
      const parsedKey = parseStorageKey(key);
      if (!parsedKey) {
        return [];
      }

      const playRecord = allPlayRecords?.[key];

      return [
        {
          currentEpisode: playRecord?.index,
          episodes: favorite.total_episodes,
          id: parsedKey.id,
          origin: favorite.origin,
          poster: favorite.cover,
          search_title: favorite.search_title,
          source: parsedKey.source,
          source_name: favorite.source_name,
          title: favorite.title,
          year: favorite.year,
        },
      ];
    });
}
