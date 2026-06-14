import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function checkSchema() {
  console.log('========================================');
  console.log('检查 play_records 表结构');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  console.log('\n1. 查看 play_records 表结构...');
  const { rows: columns } = await pgPool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'play_records'
    ORDER BY ordinal_position
  `);

  console.log('  列:');
  columns.forEach(col => {
    console.log(`    - ${col.column_name}: ${col.data_type} (${col.is_nullable})`);
  });

  console.log('\n2. 查看数据数量...');
  const { rows: countResult } = await pgPool.query('SELECT COUNT(*) as count FROM play_records');
  console.log(`  共 ${countResult[0].count} 条记录`);

  await pgPool.end();
}

checkSchema().catch(console.error);
