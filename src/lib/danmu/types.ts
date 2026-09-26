export interface PlatformUrl {
  platform: string;
  url: string;
}

export interface DanmuItem {
  text: string;
  time: number;
  color?: string;
  mode?: number;
}

type KlmDanmuComment = {
  p?: string;
  m?: string;
  text?: string;
  t?: number;
};

type KlmDanmuResponse = {
  success?: boolean;
  errorCode?: number;
  count?: number;
  comments?: KlmDanmuComment[];
};

type KlmEpisode = {
  episodeId?: number | string;
  episodeTitle?: string;
};

type KlmEpisodeMatch = KlmEpisode & {
  animeTitle?: string;
};

type KlmMatchResponse = {
  success?: boolean;
  isMatched?: boolean;
  matches?: KlmEpisodeMatch[];
};

type KlmSearchEpisodesResponse = {
  success?: boolean;
  animes?: Array<{
    animeTitle?: string;
    episodes?: KlmEpisode[];
  }>;
};

type KlmResolvedEpisode = {
  episodeId: string;
  animeTitle?: string;
  episodeTitle?: string;
};

export type {
  KlmDanmuComment,
  KlmDanmuResponse,
  KlmEpisode,
  KlmEpisodeMatch,
  KlmMatchResponse,
  KlmResolvedEpisode,
  KlmSearchEpisodesResponse,
};
