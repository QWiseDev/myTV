import type { SkipSegment } from '@/lib/db.client';

export interface SkipBatchSettings {
  openingStart: string;
  openingEnd: string;
  endingMode: 'remaining' | 'absolute';
  endingStart: string;
  endingEnd: string;
  autoSkip: boolean;
  autoNextEpisode: boolean;
}

export type NewSkipSegment = Partial<SkipSegment>;
