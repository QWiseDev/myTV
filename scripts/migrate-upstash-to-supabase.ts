import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const UPSTASH_URL = process.env.UPSTASH_URL;
if (!UPSTASH_URL) {
  throw new Error('UPSTASH_URL env variable must be set');
}
const UPSTASH_TOKEN = process.env.UPSTASH_TOKEN;
if (!UPSTASH_TOKEN) {
  throw new Error('UPSTASH_TOKEN env variable must be set');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL env variable must be set');
}
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY env variable must be set');
}

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const upstashRedis = new Redis({
  url: UPSTASH_URL,
  token: UPSTASH_TOKEN,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

const usernameToUserId: Map<string, string> = new Map();

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      if (i === maxRetries - 1) throw err;
      console.log(`重试... (${i + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

async function disableRLS() {
  console.log('⚙️  临时禁用 RLS...');
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
    await pgPool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
  console.log('✓ RLS 已禁用');
}

async function enableRLS() {
  console.log('\n⚙️  重新启用 RLS...');
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
  }
  console.log('✓ RLS 已重新启用');
}

async function migrateUsers() {
  console.log('\n👤 迁移用户数据...');

  const keys = await withRetry(() => upstashRedis.keys('u:*:pwd'));
  const usernames = keys
    .map((k) => {
      const match = k.match(/^u:(.+?):pwd$/);
      return match ? match[1] : null;
    })
    .filter((u): u is string => u !== null);

  console.log(`  找到 ${usernames.length} 个用户`);

  for (const username of usernames) {
    const password = await withRetry(() => upstashRedis.get(`u:${username}:pwd`));

    try {
      await pgPool.query(
        `INSERT INTO profiles (username, role, banned, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash`,
        [username, 'user', false, password]
      );

      console.log(`    ✓ 用户 ${username}`);
    } catch (err: any) {
      console.error(`    用户 ${username} 迁移失败:`, err.message);
    }
  }

  console.log(`  已创建 ${usernames.length} 个用户记录`);

  return usernames;
}

type UpstashPlayRecord = Record<string, any>;

async function getPlayRecordEntriesFromUpstash(
  username: string
): Promise<Array<{ key: string; record: UpstashPlayRecord }>> {
  const hashRecords = await withRetry(() =>
    upstashRedis.hgetall<Record<string, UpstashPlayRecord>>(`u:${username}:prh`)
  );

  if (hashRecords && Object.keys(hashRecords).length > 0) {
    return Object.entries(hashRecords).map(([key, record]) => ({ key, record }));
  }

  const legacyKeys = await withRetry(() => upstashRedis.keys(`u:${username}:pr:*`));
  if (legacyKeys.length === 0) {
    return [];
  }

  const legacyValues = await withRetry(() => upstashRedis.mget(...legacyKeys));
  const entries: Array<{ key: string; record: UpstashPlayRecord }> = [];

  legacyKeys.forEach((fullKey, index) => {
    const record = legacyValues[index] as UpstashPlayRecord | null;
    if (!record) {
      return;
    }

    const match = fullKey.match(/^u:.+?:pr:(.+)$/);
    const key = match ? match[1] : '';
    if (!key) {
      return;
    }

    entries.push({ key, record });
  });

  return entries;
}

async function migratePlayRecords(usernames: string[]) {
  console.log('\n🎬 迁移播放记录...');

  let totalRecords = 0;

  for (const username of usernames) {
    const entries = await getPlayRecordEntriesFromUpstash(username);

    if (entries.length === 0) continue;

    for (const { key, record } of entries) {
      const [source, sourceId] = key.split('+', 2);
      if (!source || !sourceId) continue;

      try {
        await pgPool.query(
          `INSERT INTO play_records (username, source, source_id, title, source_name, cover, year, episode_index, total_episodes, original_episodes, play_time, total_time, save_time, search_title, remarks)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (username, source, source_id) DO UPDATE SET
             title = EXCLUDED.title,
             source_name = EXCLUDED.source_name,
             cover = EXCLUDED.cover,
             year = EXCLUDED.year,
             episode_index = EXCLUDED.episode_index,
             total_episodes = EXCLUDED.total_episodes,
             original_episodes = EXCLUDED.original_episodes,
             play_time = EXCLUDED.play_time,
             total_time = EXCLUDED.total_time,
             save_time = EXCLUDED.save_time,
             search_title = EXCLUDED.search_title,
             remarks = EXCLUDED.remarks`,
          [
            username,
            record.source || source,
            sourceId,
            record.title || '',
            record.source_name || source,
            record.cover || '',
            record.year || '',
            record.index || 0,
            record.total_episodes || 0,
            record.original_episodes,
            record.play_time || 0,
            record.total_time || 0,
            new Date(record.save_time || Date.now()).toISOString(),
            record.search_title || '',
            record.remarks || '',
          ]
        );
        totalRecords++;
      } catch (err: any) {
        console.error(`      播放记录 ${key} 迁移失败:`, err.message);
      }
    }

    console.log(`  ✓ 用户 ${username}: ${entries.length} 条播放记录`);
  }

  console.log(`  总计: ${totalRecords} 条播放记录`);
}

async function migrateFavorites(usernames: string[]) {
  console.log('\n⭐ 迁移收藏...');

  let totalFavorites = 0;

  for (const username of usernames) {
    const keys = await withRetry(() => upstashRedis.keys(`u:${username}:fav:*`));

    if (keys.length === 0) continue;

    const values = await withRetry(() => upstashRedis.mget(keys));

    for (let i = 0; i < keys.length; i++) {
      const favorite = values[i] as any;
      if (!favorite) continue;

      const match = keys[i].match(/^u:.+?:fav:(.+)$/);
      const key = match ? match[1] : '';

      const [source, sourceId] = key.split('+', 2);
      if (!source || !sourceId) continue;

      try {
        await pgPool.query(
          `INSERT INTO favorites (username, source, source_id, title, source_name, cover, year, total_episodes, search_title, origin, save_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (username, source, source_id) DO UPDATE SET
             title = EXCLUDED.title,
             source_name = EXCLUDED.source_name,
             cover = EXCLUDED.cover,
             year = EXCLUDED.year,
             total_episodes = EXCLUDED.total_episodes,
             search_title = EXCLUDED.search_title,
             origin = EXCLUDED.origin`,
          [
            username,
            source,
            sourceId,
            favorite.title || '',
            favorite.source_name || source,
            favorite.cover || '',
            favorite.year || '',
            favorite.total_episodes || 0,
            favorite.search_title || '',
            favorite.origin || 'vod',
            new Date(favorite.save_time || Date.now()).toISOString(),
          ]
        );
        totalFavorites++;
      } catch (err: any) {
        console.error(`      收藏 ${key} 迁移失败:`, err.message);
      }
    }

    console.log(`  ✓ 用户 ${username}: ${keys.length} 条收藏`);
  }

  console.log(`  总计: ${totalFavorites} 条收藏`);
}

async function migrateSearchHistory(usernames: string[]) {
  console.log('\n🔍 迁移搜索历史...');

  let totalHistory = 0;

  for (const username of usernames) {
    const keywords = await withRetry(() => upstashRedis.lrange(`u:${username}:sh`, 0, -1));

    if (keywords.length === 0) continue;

    for (const keyword of keywords) {
      try {
        await pgPool.query(
          `INSERT INTO search_history (username, keyword)
           VALUES ($1, $2)
           ON CONFLICT (username, keyword) DO NOTHING`,
          [username, keyword]
        );
        totalHistory++;
      } catch (err: any) {
        console.error(`      搜索关键词 "${keyword}" 迁移失败:`, err.message);
      }
    }

    console.log(`  ✓ 用户 ${username}: ${keywords.length} 条搜索历史`);
  }

  console.log(`  总计: ${totalHistory} 条搜索历史`);
}

type UpstashSkipConfig = Record<string, any>;

async function getSkipConfigEntriesFromUpstash(
  username: string
): Promise<Array<{ key: string; config: UpstashSkipConfig }>> {
  const hashConfigs = await withRetry(() =>
    upstashRedis.hgetall<Record<string, UpstashSkipConfig>>(`u:${username}:skiph`)
  );

  if (hashConfigs && Object.keys(hashConfigs).length > 0) {
    return Object.entries(hashConfigs).map(([key, config]) => ({ key, config }));
  }

  const legacyKeys = await withRetry(() => upstashRedis.keys(`u:${username}:skip:*`));
  if (legacyKeys.length === 0) {
    return [];
  }

  const legacyValues = await withRetry(() => upstashRedis.mget(...legacyKeys));
  const entries: Array<{ key: string; config: UpstashSkipConfig }> = [];

  legacyKeys.forEach((fullKey, index) => {
    const config = legacyValues[index] as UpstashSkipConfig | null;
    if (!config) {
      return;
    }

    const match = fullKey.match(/^u:.+?:skip:(.+)$/);
    const key = match ? match[1] : '';
    if (!key) {
      return;
    }

    entries.push({ key, config });
  });

  return entries;
}

async function migrateSkipConfigs(usernames: string[]) {
  console.log('\n⏭️  迁移跳过配置...');

  let totalConfigs = 0;

  for (const username of usernames) {
    const skipEntries = await getSkipConfigEntriesFromUpstash(username);
    const episodeSkipKeys = await withRetry(() =>
      upstashRedis.keys(`u:${username}:episodeskip:*`)
    );

    const allKeys = [
      ...skipEntries.map(({ key }) => `u:${username}:skip:${key}`),
      ...episodeSkipKeys,
    ];

    if (allKeys.length === 0) continue;

    const episodeSkipValues =
      episodeSkipKeys.length > 0
        ? await withRetry(() => upstashRedis.mget(...episodeSkipKeys))
        : [];

    const episodeEntries = episodeSkipKeys
      .map((fullKey, index) => {
        const config = episodeSkipValues[index] as UpstashSkipConfig | null;
        if (!config) {
          return null;
        }

        const match = fullKey.match(/^u:.+?:episodeskip:(.+)$/);
        const key = match ? match[1] : '';
        if (!key) {
          return null;
        }

        return { key, config };
      })
      .filter((entry): entry is { key: string; config: UpstashSkipConfig } => entry !== null);

    const allEntries = [...skipEntries, ...episodeEntries];

    for (const { key: sourceAndId, config } of allEntries) {
      const [source, id] = sourceAndId.split('+', 2);
      if (!source || !id) continue;

      try {
        await pgPool.query(
          `INSERT INTO episode_skip_configs (username, source, source_id, title, segments, updated_time)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (username, source, source_id) DO UPDATE SET
             title = EXCLUDED.title,
             segments = EXCLUDED.segments,
             updated_time = EXCLUDED.updated_time`,
          [
            username,
            source,
            id,
            config.title || '',
            JSON.stringify(config.segments || []),
            new Date(config.updated_time || Date.now()).toISOString(),
          ]
        );
        totalConfigs++;
      } catch (err: any) {
        console.error(`      跳过配置 ${sourceAndId} 迁移失败:`, err.message);
      }
    }

    console.log(`  ✓ 用户 ${username}: ${allEntries.length} 个跳过配置`);
  }

  console.log(`  总计: ${totalConfigs} 个跳过配置`);
}

async function migrateAdminConfig() {
  console.log('\n⚙️  迁移管理员配置...');

  const config = await withRetry(() => upstashRedis.get('admin:config'));

  if (!config) {
    console.log('  没有管理员配置');
    return;
  }

  const configData = typeof config === 'string' ? JSON.parse(config) : config;

  try {
    await pgPool.query(
      `INSERT INTO admin_config (config)
       VALUES ($1)
       ON CONFLICT (id) DO UPDATE SET
         config = EXCLUDED.config`,
      [JSON.stringify(configData)]
    );
    console.log('  ✓ 管理员配置迁移成功');
  } catch (err: any) {
    console.error('  管理员配置迁移失败:', err.message);
  }
}

async function migrateCache() {
  console.log('\n💾 迁移缓存数据...');

  const keys = await withRetry(() => upstashRedis.keys('cache:*'));

  if (keys.length === 0) {
    console.log('  没有缓存数据');
    return;
  }

  console.log(`  找到 ${keys.length} 个缓存项`);

  let migrated = 0;

  for (const key of keys) {
    const match = key.match(/^cache:(.+)$/);
    const cacheKey = match ? match[1] : key;

    const value = await withRetry(() => upstashRedis.get(key));

    try {
      await pgPool.query(
        `INSERT INTO cache_store (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value`,
        [cacheKey, JSON.stringify(value)]
      );
      migrated++;
    } catch (err: any) {
      console.error(`    缓存 ${cacheKey} 迁移失败:`, err.message);
    }
  }

  console.log(`  ✓ 迁移 ${migrated}/${keys.length} 个缓存项`);
}

async function main() {
  console.log('========================================');
  console.log('🚀 开始从 Upstash 迁移到 Supabase');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  await disableRLS();

  const usernames = await migrateUsers();
  await migratePlayRecords(usernames);
  await migrateFavorites(usernames);
  await migrateSearchHistory(usernames);
  await migrateSkipConfigs(usernames);
  await migrateAdminConfig();
  await migrateCache();

  await enableRLS();

  console.log('\n========================================');
  console.log('✅ 迁移完成！');
  console.log('========================================');

  await pgPool.end();
}

main().catch(console.error);
