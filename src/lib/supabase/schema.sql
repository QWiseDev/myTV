-- Supabase Database Schema for myTV Project
-- 执行方式：在 Supabase SQL Editor 中执行此脚本

-- 1. 用户配置表 (存储管理员配置)
CREATE TABLE IF NOT EXISTS admin_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 用户扩展信息表 (关联 auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
  banned BOOLEAN DEFAULT FALSE,
  tvbox_token TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 播放记录
CREATE TABLE IF NOT EXISTS play_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 收藏夹
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  cover TEXT,
  year TEXT,
  total_episodes INTEGER NOT NULL,
  search_title TEXT,
  origin TEXT DEFAULT 'vod',
  save_time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 跳过配置
CREATE TABLE IF NOT EXISTS episode_skip_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 搜索历史
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 用户统计数据
CREATE TABLE IF NOT EXISTS user_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  total_watch_time BIGINT DEFAULT 0,
  total_plays INTEGER DEFAULT 0,
  total_movies INTEGER DEFAULT 0,
  last_play_time TIMESTAMPTZ,
  first_watch_date TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  first_login_time TIMESTAMPTZ,
  last_login_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 访问日志 (已启用)
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  username TEXT,
  action TEXT NOT NULL,
  page_url TEXT,
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  location JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 缓存存储
CREATE TABLE IF NOT EXISTS cache_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_play_records_user ON play_records(user_id);
CREATE INDEX IF NOT EXISTS idx_play_records_user_source ON play_records(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_source ON favorites(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_skip_configs_user ON episode_skip_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_statistics_user ON user_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_store_key ON cache_store(key);
CREATE INDEX IF NOT EXISTS idx_cache_store_expires ON cache_store(expires_at);

-- Row Level Security (RLS) 策略
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_skip_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_store ENABLE ROW LEVEL SECURITY;

-- profiles 表策略
CREATE POLICY "用户可以查看自己的 profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "用户可以更新自己的 profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- play_records 表策略
CREATE POLICY "用户可以管理自己的播放记录" ON play_records
  FOR ALL USING (auth.uid() = user_id);

-- favorites 表策略
CREATE POLICY "用户可以管理自己的收藏" ON favorites
  FOR ALL USING (auth.uid() = user_id);

-- episode_skip_configs 表策略
CREATE POLICY "用户可以管理自己的跳过配置" ON episode_skip_configs
  FOR ALL USING (auth.uid() = user_id);

-- search_history 表策略
CREATE POLICY "用户可以管理自己的搜索历史" ON search_history
  FOR ALL USING (auth.uid() = user_id);

-- user_statistics 表策略
CREATE POLICY "用户可以查看自己的统计" ON user_statistics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的统计" ON user_statistics
  FOR UPDATE USING (auth.uid() = user_id);

-- access_logs 表策略 (仅插入和查看自己的)
CREATE POLICY "用户可以插入访问日志" ON access_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "用户可以查看自己的访问日志" ON access_logs
  FOR SELECT USING (auth.uid() = user_id);

-- 管理员可查看所有访问日志 (需要额外配置)
CREATE POLICY "管理员可以查看所有访问日志" ON access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- cache_store 表策略
CREATE POLICY "所有用户可以操作缓存" ON cache_store
  FOR ALL USING (true);

-- 初始数据：插入默认管理员配置
INSERT INTO admin_config (config) VALUES ('{}')
ON CONFLICT DO NOTHING;

-- 初始化站长 profile (需要手动设置 user_id 为站长 auth.users id)
-- 示例：INSERT INTO profiles (id, username, role) VALUES ('<站长-user-id>', 'qiuwei', 'owner');
