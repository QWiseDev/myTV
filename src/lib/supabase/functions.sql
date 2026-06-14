-- 数据库函数和触发器
-- 执行方式：在 Supabase SQL Editor 中执行此脚本

-- ============================================
-- 搜索历史管理函数
-- ============================================

-- 添加搜索历史（自动去重和限制数量）
CREATE OR REPLACE FUNCTION add_search_history(
  p_user_id UUID,
  p_keyword TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS void AS $$
BEGIN
  -- 先删除已有的相同关键词
  DELETE FROM search_history
  WHERE user_id = p_user_id AND keyword = p_keyword;

  -- 插入新记录
  INSERT INTO search_history (user_id, keyword)
  VALUES (p_user_id, p_keyword);

  -- 删除超出限制的旧记录
  DELETE FROM search_history
  WHERE user_id = p_user_id
  AND id NOT IN (
    SELECT id FROM search_history
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT p_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 用户登录统计更新函数
-- ============================================

CREATE OR REPLACE FUNCTION update_user_login_stats(
  p_user_id UUID,
  p_login_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS void AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- 查找或创建用户统计记录
  SELECT * INTO v_stats
  FROM user_statistics
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- 创建新记录
    INSERT INTO user_statistics (
      user_id,
      login_count,
      first_login_time,
      last_login_time
    ) VALUES (
      p_user_id,
      1,
      p_login_time,
      p_login_time
    );
  ELSE
    -- 更新现有记录
    UPDATE user_statistics SET
      login_count = COALESCE(login_count, 0) + 1,
      last_login_time = p_login_time,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 如果是首次登录时间未设置，则设置
    UPDATE user_statistics SET
      first_login_time = COALESCE(first_login_time, p_login_time)
    WHERE user_id = p_user_id
    AND first_login_time IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 自动创建 profile 触发器
-- (当新用户通过 Supabase Auth 注册时自动创建 profile)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', new.email),
    'user'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 如果触发器已存在则先删除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 重新创建触发器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 更新时间戳触发器
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为需要自动更新 updated_at 的表添加触发器
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_play_records_updated_at ON play_records;
DROP TRIGGER IF EXISTS update_favorites_updated_at ON favorites;
DROP TRIGGER IF EXISTS update_episode_skip_configs_updated_at ON episode_skip_configs;
DROP TRIGGER IF EXISTS update_user_statistics_updated_at ON user_statistics;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_play_records_updated_at
  BEFORE UPDATE ON play_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_episode_skip_configs_updated_at
  BEFORE UPDATE ON episode_skip_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_statistics_updated_at
  BEFORE UPDATE ON user_statistics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 访问日志统计视图
-- ============================================

CREATE OR REPLACE VIEW daily_access_stats AS
SELECT
  DATE(created_at) as date,
  action,
  COUNT(*) as count,
  COUNT(DISTINCT username) as unique_users
FROM access_logs
GROUP BY DATE(created_at), action
ORDER BY date DESC, action;

-- ============================================
-- 用户活跃度统计视图
-- ============================================

CREATE OR REPLACE VIEW user_activity_stats AS
SELECT
  p.username,
  p.role,
  p.banned,
  COALESCE(us.login_count, 0) as login_count,
  COALESCE(us.total_watch_time, 0) as total_watch_time,
  COALESCE(us.total_plays, 0) as total_plays,
  us.last_login_time,
  us.first_login_time,
  p.created_at as profile_created_at
FROM profiles p
LEFT JOIN user_statistics us ON p.id = us.user_id
ORDER BY us.last_login_time DESC NULLS LAST;
