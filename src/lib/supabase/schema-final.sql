-- Supabase Database Schema (Final Version) for myTV Project
-- 统一版本：解决 schema 不一致问题
-- 执行方式：在 Supabase SQL Editor 中执行此脚本

-- ============================================
-- 1. 管理员配置表 (全局唯一配置)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 确保只有一条配置记录的约束（通过触发器实现）
CREATE OR REPLACE FUNCTION check_admin_config_single_row()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM admin_config) >= 1 THEN
    RAISE EXCEPTION 'admin_config 表只能有一条记录，请使用 UPDATE 而不是 INSERT';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_admin_config ON admin_config;
CREATE TRIGGER ensure_single_admin_config
  BEFORE INSERT ON admin_config
  FOR EACH ROW
  EXECUTE FUNCTION check_admin_config_single_row();

-- ============================================
-- 2. 用户表 (独立用户系统，不依赖 auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
  banned BOOLEAN DEFAULT FALSE,
  tvbox_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. 播放记录
-- ============================================
CREATE TABLE IF NOT EXISTS play_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
  CONSTRAINT unique_play_record UNIQUE (user_id, source, source_id)
);

-- ============================================
-- 4. 收藏夹
-- ============================================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_favorite UNIQUE (user_id, source, source_id)
);

-- ============================================
-- 5. 跳过片头片尾配置
-- ============================================
CREATE TABLE IF NOT EXISTS episode_skip_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_skip_config UNIQUE (user_id, source, source_id)
);

-- ============================================
-- 6. 搜索历史
-- ============================================
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_search_history UNIQUE (user_id, keyword)
);

-- ============================================
-- 7. 用户统计数据
-- ============================================
CREATE TABLE IF NOT EXISTS user_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
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

-- ============================================
-- 8. 访问日志
-- ============================================
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

-- ============================================
-- 9. 缓存存储
-- ============================================
CREATE TABLE IF NOT EXISTS cache_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 索引优化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_play_records_user ON play_records(user_id);
CREATE INDEX IF NOT EXISTS idx_play_records_user_source ON play_records(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_source ON favorites(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_skip_configs_user ON episode_skip_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_skip_configs_user_source ON episode_skip_configs(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_statistics_user ON user_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_store_key ON cache_store(key);
CREATE INDEX IF NOT EXISTS idx_cache_store_expires ON cache_store(expires_at);

-- ============================================
-- Row Level Security (RLS) - 使用 service_role 绕过
-- 注意：由于使用独立用户系统，RLS 策略需要调整
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_skip_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_store ENABLE ROW LEVEL SECURITY;

-- 由于使用 anon key + 独立用户系统，需要允许所有操作
-- 实际权限控制在应用层实现
CREATE POLICY "允许所有操作" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON play_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON favorites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON episode_skip_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON search_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON user_statistics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON access_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON admin_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "允许所有操作" ON cache_store FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 初始数据
-- ============================================
-- 插入默认管理员配置（如果不存在）
INSERT INTO admin_config (config) 
SELECT '{}'::jsonb 
WHERE NOT EXISTS (SELECT 1 FROM admin_config);
