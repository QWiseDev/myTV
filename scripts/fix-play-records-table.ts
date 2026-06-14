import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function fixPlayRecordsTable() {
  console.log('========================================');
  console.log('修复 play_records 表结构');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  console.log('\n1. 禁用 RLS...');
  await pgPool.query(`ALTER TABLE play_records DISABLE ROW LEVEL SECURITY`);
  console.log('✓ RLS 已禁用');

  console.log('\n2. 添加 user_id 列...');
  try {
    await pgPool.query(`
      ALTER TABLE play_records
      ADD COLUMN IF NOT EXISTS user_id uuid
    `);
    console.log('✓ user_id 列已添加');
  } catch (err: any) {
    console.log('  user_id 列可能已存在');
  }

  console.log('\n3. 迁移数据：根据 username 填充 user_id...');
  const updateResult = await pgPool.query(`
    UPDATE play_records
    SET user_id = profiles.id
    FROM profiles
    WHERE play_records.username = profiles.username
    AND play_records.user_id IS NULL
  `);
  console.log(`✓ 已更新 ${updateResult.rowCount} 条记录`);

  console.log('\n4. 添加外键约束...');
  try {
    await pgPool.query(`
      ALTER TABLE play_records
      DROP CONSTRAINT IF EXISTS play_records_user_id_fkey
    `);
    console.log('  旧外键约束已删除');
  } catch (err: any) {
    console.log('  外键约束不存在');
  }

  try {
    await pgPool.query(`
      ALTER TABLE play_records
      ADD CONSTRAINT play_records_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    `);
    console.log('✓ 外键约束已创建');
  } catch (err: any) {
    console.error('  外键约束创建失败:', err.message);
  }

  console.log('\n5. 删除 username 列...');
  try {
    await pgPool.query(`
      ALTER TABLE play_records
      DROP COLUMN IF EXISTS username
    `);
    console.log('✓ username 列已删除');
  } catch (err: any) {
    console.error('  删除 username 列失败:', err.message);
  }

  console.log('\n6. 更新唯一约束...');
  try {
    await pgPool.query(`
      ALTER TABLE play_records
      DROP CONSTRAINT IF EXISTS play_records_source_source_id_key
    `);
    console.log('  旧唯一约束已删除');
  } catch (err: any) {
    console.log('  唯一约束不存在');
  }

  try {
    await pgPool.query(`
      ALTER TABLE play_records
      ADD CONSTRAINT play_records_user_id_source_source_id_key
      UNIQUE (user_id, source, source_id)
    `);
    console.log('✓ 新唯一约束已创建');
  } catch (err: any) {
    console.error('  唯一约束创建失败:', err.message);
  }

  console.log('\n7. 重新启用 RLS...');
  await pgPool.query(`ALTER TABLE play_records ENABLE ROW LEVEL SECURITY`);
  console.log('✓ RLS 已重新启用');

  console.log('\n8. 验证表结构...');
  const { rows: columns } = await pgPool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'play_records'
    ORDER BY ordinal_position
  `);

  console.log('  当前表结构:');
  columns.forEach(col => {
    console.log(`    - ${col.column_name}: ${col.data_type}`);
  });

  console.log('\n========================================');
  console.log('✅ play_records 表修复完成！');
  console.log('========================================');

  await pgPool.end();
}

fixPlayRecordsTable().catch(console.error);
