import type Artplayer from 'artplayer';

import type { ArtPlayerLike } from './danmakuRuntime';

export type PlayArtplayer = Artplayer &
  ArtPlayerLike & {
    notice: {
      show: string;
    };
    $video?: HTMLVideoElement;
  };
