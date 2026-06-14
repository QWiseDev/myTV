-- Supabase Schema v3 - 基于 Upstash 实际数据结构
-- Created: 2025-12-30

-- 清理旧表
DROP TABLE IF EXISTS access_logs CASCADE;
DROP TABLE IF EXISTS user_statistics CASCADE;
DROP TABLE IF EXISTS cache_store CASCADE;
DROP TABLE IF EXISTS search_history CASCADE;
DROP TABLE IF EXISTS episode_skip_configs CASCADE;
DROP TABLE IF EXISTS favorites CASCADE;
DROP TABLE IF EXISTS play_records CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 1. 用户表 (profiles)
-- 对应 upstash key: u:{username}:pwd
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
  banned BOOLEAN DEFAULT FALSE,
  tvbox_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 播放记录 (play_records)
-- 对应 upstash key: u:{username}:pr:{source}+{id}
CREATE TABLE play_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  cover TEXT,
  year TEXT,
  episode_index INTEGER NOT NULL,
  total_episodes INTEGER NOT NULL,
  original_episodes INTEGER,
  play_time INTEGER DEFAULT 0,
  total_time INTEGER DEFAULT 0,
  save_time TIMESTAMPTZ DEFAULT NOW(),
  search_title TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_play_record UNIQUE (username, source, source_id)
);

-- 3. 跳过配置 (episode_skip_configs) - 支持两种格式
-- 对应 upstash key: u:{username}:skip:{source}+{id}
CREATE TABLE episode_skip_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  source TEXT,
  source_id TEXT,
  title TEXT,
  enable BOOLEAN DEFAULT TRUE,
  intro_time NUMERIC DEFAULT 0,
  outro_time NUMERIC DEFAULT 0,
  segments JSONB DEFAULT '[]'::jsonb,
  updated_time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_skip_config UNIQUE (username, source, source_id)
);

-- 4. 搜索历史 (search_history)
-- 对应 upstash key: u:{username}:sh (List结构)
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_search_history UNIQUE (username, keyword)
);

-- 5. 用户统计数据 (user_statistics)
-- 对应 upstash key: user_login_stats:{username}
CREATE TABLE user_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  login_count INTEGER DEFAULT 0,
  first_login_time TIMESTAMPTZ,
  last_login_time TIMESTAMPTZ,
  last_login_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 访问日志 (access_logs)
-- 对应 upstash key: al:{timestamp}_{random}
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  page_url TEXT,
  timestamp BIGINT,
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 管理员配置 (admin_config)
-- 对应 upstash key: admin:config
CREATE TABLE admin_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 缓存存储 (cache_store)
-- 对应 upstash key: cache:{key}
CREATE TABLE cache_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_play_records_username ON play_records(username);
CREATE INDEX idx_play_records_source_id ON play_records(source, source_id);
CREATE INDEX idx_skip_configs_username ON episode_skip_configs(username);
CREATE INDEX idx_skip_configs_source_id ON episode_skip_configs(source, source_id);
CREATE INDEX idx_search_history_username ON search_history(username);
CREATE INDEX idx_user_statistics_username ON user_statistics(username);
CREATE INDEX idx_access_logs_username ON access_logs(username);
CREATE INDEX idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX idx_access_logs_timestamp ON access_logs(timestamp DESC);
CREATE INDEX idx_access_logs_created ON access_logs(created_at DESC);
CREATE INDEX idx_access_logs_action ON access_logs(action);
CREATE INDEX idx_cache_store_key ON cache_store(key);
CREATE INDEX idx_cache_store_expires ON cache_store(expires_at);

-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_skip_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_store ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "用户可以查看自己的 profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "用户可以更新自己的 profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "管理员可以管理所有用户" ON profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "用户可以管理自己的播放记录" ON play_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.username = play_records.username
    )
  );

CREATE POLICY "用户可以管理自己的跳过配置" ON episode_skip_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.username = episode_skip_configs.username
    )
  );

CREATE POLICY "用户可以管理自己的搜索历史" ON search_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.username = search_history.username
    )
  );

CREATE POLICY "用户可以查看自己的统计数据" ON user_statistics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.username = user_statistics.username
    )
  );

CREATE POLICY "访问日志所有人可写" ON access_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "管理员可以查看所有访问日志" ON access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "所有人可以读写配置" ON admin_config
  FOR ALL USING (true);

CREATE POLICY "所有人可以读写缓存" ON cache_store
  FOR ALL USING (true);
