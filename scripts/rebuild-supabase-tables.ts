import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function dropTables() {
  console.log('========================================');
  console.log('🗑️  删除现有表...');
  console.log('========================================\n');

  const tables = [
    'cache_store',
    'access_logs',
    'user_statistics',
    'search_history',
    'episode_skip_configs',
    'favorites',
    'play_records',
    'profiles',
    'admin_config'
  ];

  for (const table of tables) {
    try {
      await pgPool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`  ✓ 已删除表: ${table}`);
    } catch (err: any) {
      console.error(`  ✗ 删除表 ${table} 失败:`, err.message);
    }
  }
}

async function createTables() {
  console.log('\n========================================');
  console.log('🏗️  创建新表...');
  console.log('========================================\n');

  await pgPool.query(`
    CREATE TABLE admin_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  ✓ 已创建表: admin_config');

  await pgPool.query(`
    CREATE TABLE profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
      banned BOOLEAN DEFAULT FALSE,
      tvbox_token TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  ✓ 已创建表: profiles');

  await pgPool.query(`
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
    )
  `);
  console.log('  ✓ 已创建表: play_records');

  await pgPool.query(`
    CREATE TABLE favorites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL,
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
      CONSTRAINT unique_favorite UNIQUE (username, source, source_id)
    )
  `);
  console.log('  ✓ 已创建表: favorites');

  await pgPool.query(`
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
    )
  `);
  console.log('  ✓ 已创建表: episode_skip_configs');

  await pgPool.query(`
    CREATE TABLE search_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL,
      keyword TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT unique_search_history UNIQUE (username, keyword)
    )
  `);
  console.log('  ✓ 已创建表: search_history');

  await pgPool.query(`
    CREATE TABLE user_statistics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      login_count INTEGER DEFAULT 0,
      first_login_time TIMESTAMPTZ,
      last_login_time TIMESTAMPTZ,
      last_login_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  ✓ 已创建表: user_statistics');

  await pgPool.query(`
    CREATE TABLE access_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT,
      action TEXT NOT NULL,
      page_url TEXT,
      ip_address INET,
      user_agent TEXT,
      referrer TEXT,
      location JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  ✓ 已创建表: access_logs');

  await pgPool.query(`
    CREATE TABLE cache_store (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  ✓ 已创建表: cache_store');
}

async function createIndexes() {
  console.log('\n========================================');
  console.log('📊 创建索引...');
  console.log('========================================\n');

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_play_records_username ON play_records(username)',
    'CREATE INDEX IF NOT EXISTS idx_play_records_source_id ON play_records(source, source_id)',
    'CREATE INDEX IF NOT EXISTS idx_favorites_username ON favorites(username)',
    'CREATE INDEX IF NOT EXISTS idx_favorites_source_id ON favorites(source, source_id)',
    'CREATE INDEX IF NOT EXISTS idx_skip_configs_username ON episode_skip_configs(username)',
    'CREATE INDEX IF NOT EXISTS idx_skip_configs_source_id ON episode_skip_configs(source, source_id)',
    'CREATE INDEX IF NOT EXISTS idx_search_history_username ON search_history(username)',
    'CREATE INDEX IF NOT EXISTS idx_user_statistics_username ON user_statistics(username)',
    'CREATE INDEX IF NOT EXISTS idx_access_logs_username ON access_logs(username)',
    'CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_cache_store_key ON cache_store(key)',
    'CREATE INDEX IF NOT EXISTS idx_cache_store_expires ON cache_store(expires_at)'
  ];

  for (const indexSQL of indexes) {
    try {
      await pgPool.query(indexSQL);
      console.log(`  ✓ 已创建索引`);
    } catch (err: any) {
      console.error(`  ✗ 创建索引失败:`, err.message);
    }
  }
}

async function setupRLS() {
  console.log('\n========================================');
  console.log('🔐 设置 RLS 策略...');
  console.log('========================================\n');

  const tables = [
    'profiles',
    'play_records',
    'favorites',
    'episode_skip_configs',
    'search_history',
    'user_statistics',
    'access_logs',
    'cache_store'
  ];

  for (const table of tables) {
    await pgPool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    console.log(`  ✓ 已启用 RLS: ${table}`);
  }

  console.log('\n  profiles 表策略');
  await pgPool.query(`
    CREATE POLICY "用户可以查看自己的 profile" ON profiles
    FOR SELECT USING (auth.uid() = id)
  `);
  await pgPool.query(`
    CREATE POLICY "用户可以更新自己的 profile" ON profiles
    FOR UPDATE USING (auth.uid() = id)
  `);
  console.log('    ✓ profiles RLS 策略已创建');

  console.log('\n  play_records 表策略');
  await pgPool.query(`
    CREATE POLICY "用户可以管理自己的播放记录" ON play_records
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.username = play_records.username
      )
    )
  `);
  console.log('    ✓ play_records RLS 策略已创建');

  console.log('\n  favorites 表策略');
  await pgPool.query(`
    CREATE POLICY "用户可以管理自己的收藏" ON favorites
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.username = favorites.username
      )
    )
  `);
  console.log('    ✓ favorites RLS 策略已创建');

  console.log('\n  episode_skip_configs 表策略');
  await pgPool.query(`
    CREATE POLICY "用户可以管理自己的跳过配置" ON episode_skip_configs
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.username = episode_skip_configs.username
      )
    )
  `);
  console.log('    ✓ episode_skip_configs RLS 策略已创建');

  console.log('\n  search_history 表策略');
  await pgPool.query(`
    CREATE POLICY "用户可以管理自己的搜索历史" ON search_history
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.username = search_history.username
      )
    )
  `);
  console.log('    ✓ search_history RLS 策略已创建');

  console.log('\n  user_statistics 表策略');
  await pgPool.query(`
    CREATE POLICY "用户可以查看自己的统计" ON user_statistics
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.username = user_statistics.username
      )
    )
  `);
  await pgPool.query(`
    CREATE POLICY "用户可以更新自己的统计" ON user_statistics
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.username = user_statistics.username
      )
    )
  `);
  console.log('    ✓ user_statistics RLS 策略已创建');

  console.log('\n  access_logs 表策略');
  await pgPool.query(`
    CREATE POLICY "用户可以插入访问日志" ON access_logs
    FOR INSERT WITH CHECK (true)
  `);
  await pgPool.query(`
    CREATE POLICY "用户可以查看自己的访问日志" ON access_logs
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.username = access_logs.username
      )
    )
  `);
  await pgPool.query(`
    CREATE POLICY "管理员可以查看所有访问日志" ON access_logs
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'owner')
      )
    )
  `);
  console.log('    ✓ access_logs RLS 策略已创建');

  console.log('\n  admin_config 表策略');
  await pgPool.query(`
    CREATE POLICY "所有人可以读写配置" ON admin_config
    FOR ALL USING (true)
  `);
  console.log('    ✓ admin_config RLS 策略已创建');

  console.log('\n  cache_store 表策略');
  await pgPool.query(`
    CREATE POLICY "所有用户可以操作缓存" ON cache_store
    FOR ALL USING (true)
  `);
  console.log('    ✓ cache_store RLS 策略已创建');
}

async function insertInitialData() {
  console.log('\n========================================');
  console.log('📝 插入初始数据...');
  console.log('========================================\n');

  try {
    await pgPool.query(
      `INSERT INTO admin_config (config) VALUES ('{}')`
    );
    console.log('  ✓ 已插入默认管理员配置');
  } catch (err: any) {
    console.error('  ✗ 插入管理员配置失败:', err.message);
  }
}

async function verifyTables() {
  console.log('\n========================================');
  console.log('✅ 验证表结构...');
  console.log('========================================\n');

  const tables = [
    'admin_config',
    'profiles',
    'play_records',
    'favorites',
    'episode_skip_configs',
    'search_history',
    'user_statistics',
    'access_logs',
    'cache_store'
  ];

  for (const table of tables) {
    const result = await pgPool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables
      WHERE table_name = '${table}'
    `);
    if (result.rows[0].count > 0) {
      console.log(`  ✓ 表 ${table} 已存在`);
    } else {
      console.log(`  ✗ 表 ${table} 不存在`);
    }
  }

  console.log('\n  验证唯一约束');
  const constraints = [
    { table: 'play_records', name: 'unique_play_record', columns: ['username', 'source', 'source_id'] },
    { table: 'favorites', name: 'unique_favorite', columns: ['username', 'source', 'source_id'] },
    { table: 'episode_skip_configs', name: 'unique_skip_config', columns: ['username', 'source', 'source_id'] },
    { table: 'search_history', name: 'unique_search_history', columns: ['username', 'keyword'] }
  ];

  for (const constraint of constraints) {
    const result = await pgPool.query(`
      SELECT COUNT(*) as count FROM information_schema.table_constraints
      WHERE table_name = '${constraint.table}' AND constraint_name = '${constraint.name}'
    `);
    if (result.rows[0].count > 0) {
      console.log(`    ✓ ${constraint.table}.${constraint.name} 已存在`);
    } else {
      console.log(`    ✗ ${constraint.table}.${constraint.name} 不存在`);
    }
  }
}

async function main() {
  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功\n');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  try {
    await dropTables();
    await createTables();
    await createIndexes();
    await setupRLS();
    await insertInitialData();
    await verifyTables();

    console.log('\n========================================');
    console.log('✅ Supabase 表结构重建完成！');
    console.log('========================================\n');
  } catch (err: any) {
    console.error('\n✗ 重建失败:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
