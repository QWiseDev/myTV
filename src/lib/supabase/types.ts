export type Tables = {
  profiles: {
    Row: {
      id: string;
      username: string;
      role: 'owner' | 'admin' | 'user';
      banned: boolean;
      tvbox_token: string | null;
      password_hash: string | null;
      created_at: Date;
      updated_at: Date;
    };
    Insert: {
      id: string;
      username: string;
      role?: 'owner' | 'admin' | 'user';
      banned?: boolean;
      tvbox_token?: string | null;
      password_hash?: string | null;
      created_at?: Date;
      updated_at?: Date;
    };
    Update: {
      id?: string;
      username?: string;
      role?: 'owner' | 'admin' | 'user';
      banned?: boolean;
      tvbox_token?: string | null;
      password_hash?: string | null;
      created_at?: Date;
      updated_at?: Date;
    };
  };
  play_records: {
    Row: {
      id: string;
      user_id: string;
      source: string;
      source_id: string;
      title: string;
      source_name: string;
      cover: string | null;
      year: string | null;
      episode_index: number;
      total_episodes: number;
      original_episodes: number | null;
      play_time: number;
      total_time: number;
      save_time: Date;
      search_title: string | null;
      remarks: string | null;
      created_at: Date;
      updated_at: Date;
    };
  };
  favorites: {
    Row: {
      id: string;
      user_id: string;
      source: string;
      source_id: string;
      source_name: string;
      title: string;
      cover: string | null;
      year: string | null;
      total_episodes: number;
      search_title: string | null;
      origin: string;
      save_time: Date;
      created_at: Date;
    };
  };
  episode_skip_configs: {
    Row: {
      id: string;
      user_id: string;
      source: string;
      source_id: string;
      title: string;
      segments: any;
      updated_time: Date;
      created_at: Date;
    };
  };
  search_history: {
    Row: {
      id: string;
      user_id: string;
      keyword: string;
      created_at: Date;
    };
  };
  user_statistics: {
    Row: {
      id: string;
      user_id: string;
      total_watch_time: number;
      total_plays: number;
      total_movies: number;
      last_play_time: Date | null;
      first_watch_date: Date | null;
      login_count: number;
      first_login_time: Date | null;
      last_login_time: Date | null;
      created_at: Date;
      updated_at: Date;
    };
  };
  access_logs: {
    Row: {
      id: string;
      user_id: string | null;
      username: string | null;
      action: string;
      page_url: string | null;
      ip_address: string | null;
      user_agent: string | null;
      referrer: string | null;
      location: any;
      created_at: Date;
    };
  };
  admin_config: {
    Row: {
      id: string;
      config: any;
      created_at: Date;
      updated_at: Date;
    };
  };
};

export type Profile = Tables['profiles']['Row'];
export type PlayRecord = Tables['play_records']['Row'];
export type Favorite = Tables['favorites']['Row'];
export type EpisodeSkipConfig = Tables['episode_skip_configs']['Row'];
export type SearchHistory = Tables['search_history']['Row'];
export type UserStatistics = Tables['user_statistics']['Row'];
export type AccessLog = Tables['access_logs']['Row'];

export type UserRole = 'owner' | 'admin' | 'user';
export type FavoriteOrigin = 'vod' | 'live';
