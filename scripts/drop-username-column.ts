import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function main() {
  console.log('========================================');
  console.log('删除 username 列及其依赖');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  try {
    console.log('\n1. 删除约束 unique_play_record...');
    await pgPool.query(`ALTER TABLE play_records DROP CONSTRAINT IF EXISTS unique_play_record`);
    console.log('  ✓ 约束已删除');

    console.log('\n2. 删除索引 idx_play_records_username...');
    await pgPool.query(`DROP INDEX IF EXISTS idx_play_records_username`);
    console.log('  ✓ 索引已删除');

    console.log('\n3. 删除 username 列...');
    await pgPool.query(`ALTER TABLE play_records DROP COLUMN IF EXISTS username`);
    console.log('  ✓ username 列已删除');

    console.log('\n4. 创建新的唯一索引...');
    await pgPool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_play_record
      ON play_records (user_id, source, source_id)
    `);
    console.log('  ✓ 新的唯一索引已创建 (user_id, source, source_id)');

    console.log('\n5. 验证表结构...');
    const { rows } = await pgPool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'play_records'
      ORDER BY ordinal_position
    `);

    console.log('  当前列:');
    rows.forEach(row => {
      console.log('    -', row.column_name, ':', row.data_type);
    });

    console.log('\n========================================');
    console.log('✓ 所有操作完成！');
    console.log('========================================');

  } catch (err) {
    console.error('\n✗ 错误:', err);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
