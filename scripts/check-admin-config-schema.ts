import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function checkSchema() {
  console.log('========================================');
  console.log('检查 admin_config 表结构');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  console.log('\n1. 查看 admin_config 表结构...');
  const { rows: columns } = await pgPool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'admin_config'
    ORDER BY ordinal_position
  `);

  console.log('  列:');
  columns.forEach(col => {
    console.log(`    - ${col.column_name}: ${col.data_type} (${col.is_nullable})`);
  });

  console.log('\n2. 查看 admin_config 表数据...');
  const { rows: adminData } = await pgPool.query('SELECT * FROM admin_config LIMIT 10');

  console.log(`  共 ${adminData.length} 条记录:`);
  adminData.forEach(row => {
    console.log('  -', JSON.stringify(row, null, 2));
  });

  await pgPool.end();
}

checkSchema().catch(console.error);
