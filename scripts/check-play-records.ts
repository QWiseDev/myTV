import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function main() {
  try {
    console.log('========================================');
    console.log('检查播放记录');
    console.log('========================================\n');

    const client = await pgPool.connect();

    try {
      console.log('1. 检查用户数据...');
      const { rows: users } = await client.query(`
        SELECT id, username, role
        FROM profiles
        ORDER BY username
      `);
      console.log('  用户数:', users.length);
      users.forEach(user => {
        console.log('    -', user.username, 'id:', user.id, 'role:', user.role);
      });

      console.log('\n2. 检查播放记录...');
      const { rows: records } = await client.query(`
        SELECT id, user_id, source, source_id, title, save_time
        FROM play_records
        ORDER BY save_time DESC
        LIMIT 20
      `);
      console.log('  播放记录数:', records.length);
      records.forEach(record => {
        const user = users.find(u => u.id === record.user_id);
        console.log(`    - ${record.title} (用户: ${user?.username || '未知'}, 来源: ${record.source}, ID: ${record.source_id})`);
      });

      console.log('\n3. 检查各用户的播放记录数...');
      const { rows: counts } = await client.query(`
        SELECT p.username, COUNT(pr.id) as record_count
        FROM profiles p
        LEFT JOIN play_records pr ON pr.user_id = p.id
        GROUP BY p.id, p.username
        ORDER BY record_count DESC
      `);
      counts.forEach(row => {
        console.log(`    ${row.username}: ${row.record_count} 条播放记录`);
      });

      console.log('\n4. 检查是否有 user_id 为空的记录...');
      const { rows: nullRecords } = await client.query(`
        SELECT COUNT(*) as count
        FROM play_records
        WHERE user_id IS NULL
      `);
      console.log(`  user_id 为空的记录数: ${nullRecords[0].count}`);

    } finally {
      client.release();
    }

    console.log('\n========================================');
    console.log('检查完成！');
    console.log('========================================');

  } catch (err) {
    console.error('错误:', err);
  } finally {
    await pgPool.end();
  }
}

main();
