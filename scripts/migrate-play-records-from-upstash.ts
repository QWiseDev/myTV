import { Redis } from '@upstash/redis';
import { Pool } from 'pg';

const UPSTASH_URL = process.env.UPSTASH_URL;
if (!UPSTASH_URL) {
  throw new Error('UPSTASH_URL env variable must be set');
}
const UPSTASH_TOKEN = process.env.UPSTASH_TOKEN;
if (!UPSTASH_TOKEN) {
  throw new Error('UPSTASH_TOKEN env variable must be set');
}
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const upstashRedis = new Redis({
  url: UPSTASH_URL,
  token: UPSTASH_TOKEN,
});

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

type UpstashPlayRecord = Record<string, any>;

async function getUserPlayRecordEntries(
  username: string
): Promise<Array<{ key: string; record: UpstashPlayRecord }>> {
  const hashRecords = await upstashRedis.hgetall<Record<string, UpstashPlayRecord>>(
    `u:${username}:prh`
  );

  if (hashRecords && Object.keys(hashRecords).length > 0) {
    return Object.entries(hashRecords).map(([key, record]) => ({
      key,
      record,
    }));
  }

  const legacyKeys = await upstashRedis.keys(`u:${username}:pr:*`);
  if (legacyKeys.length === 0) {
    return [];
  }

  const legacyValues = await upstashRedis.mget(...legacyKeys);
  const entries: Array<{ key: string; record: UpstashPlayRecord }> = [];

  legacyKeys.forEach((fullKey, index) => {
    const value = legacyValues[index] as UpstashPlayRecord | null;
    if (!value) {
      return;
    }

    const key = fullKey.replace(`u:${username}:pr:`, '');
    entries.push({ key, record: value });
  });

  return entries;
}

async function main() {
  console.log('========================================');
  console.log('从 Upstash 迁移播放记录到 Supabase');
  console.log('========================================\n');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ Supabase 数据库连接成功');
  } catch (err) {
    console.error('✗ Supabase 数据库连接失败:', err);
    process.exit(1);
  }

  try {
    const { rows: users } = await pgPool.query(`
      SELECT id, username
      FROM profiles
      ORDER BY username
    `);
    console.log(`✓ 找到 ${users.length} 个用户\n`);

    const usernameToIdMap = new Map<string, string>();
    users.forEach((user) => {
      usernameToIdMap.set(user.username, user.id);
    });

    console.log('开始从 Upstash 获取播放记录...\n');

    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const user of users) {
      console.log(`处理用户: ${user.username} (${user.id})`);

      const entries = await getUserPlayRecordEntries(user.username);
      console.log(`  找到 ${entries.length} 条播放记录`);

      if (entries.length === 0) {
        console.log('  没有播放记录，跳过\n');
        continue;
      }

      let migratedCount = 0;

      for (const { key, record } of entries) {
        const [source, id] = key.split('+');

        if (!source || !id) {
          console.log(`  ⚠ 跳过无效的 key: ${key}`);
          totalSkipped++;
          continue;
        }

        try {
          await pgPool.query(
            `
            INSERT INTO play_records (
              id,
              user_id,
              source,
              source_id,
              title,
              source_name,
              cover,
              year,
              episode_index,
              total_episodes,
              original_episodes,
              play_time,
              total_time,
              save_time,
              search_title,
              remarks,
              created_at,
              updated_at
            ) VALUES (
              gen_random_uuid(),
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            )
            ON CONFLICT (user_id, source, source_id) DO NOTHING
          `,
            [
              user.id,
              source,
              id,
              record.title || '',
              record.source_name || '',
              record.cover || '',
              record.year || '',
              record.index || record.episode_index || 0,
              record.total_episodes || 0,
              record.original_episodes || record.total_episodes || 0,
              record.play_time || 0,
              record.total_time || 0,
              new Date(record.save_time || Date.now()),
              record.search_title || '',
              record.remarks || '',
              new Date(record.save_time || Date.now()),
              new Date(record.save_time || Date.now()),
            ]
          );
          migratedCount++;
        } catch (err) {
          console.log(`  ⚠ 迁移失败: ${key}`, (err as Error).message);
          totalSkipped++;
        }
      }

      console.log(`  ✓ 迁移 ${migratedCount} 条记录\n`);
      totalMigrated += migratedCount;
    }

    console.log('========================================');
    console.log('迁移完成！');
    console.log(`  总计迁移: ${totalMigrated} 条记录`);
    console.log(`  跳过/失败: ${totalSkipped} 条记录`);
    console.log('========================================');
  } catch (err) {
    console.error('错误:', err);
  } finally {
    await pgPool.end();
  }
}

main();
