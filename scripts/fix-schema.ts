import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function fixSchema() {
  console.log('========================================');
  console.log('修复 Schema 外键约束');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  console.log('\n1. 禁用 RLS...');
  await pgPool.query(`ALTER TABLE profiles DISABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE play_records DISABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE favorites DISABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE episode_skip_configs DISABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE search_history DISABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE user_statistics DISABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE access_logs DISABLE ROW LEVEL SECURITY`);
  console.log('✓ RLS 已禁用');

  console.log('\n2. 删除 profiles 表外键约束...');
  try {
    await pgPool.query(`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey`);
    console.log('✓ 外键约束已删除');
  } catch (err: any) {
    console.log('  外键约束不存在或已删除');
  }

  console.log('\n3. 修改 play_records 外键约束...');
  try {
    await pgPool.query(`ALTER TABLE play_records DROP CONSTRAINT IF EXISTS play_records_user_id_fkey`);
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
    console.log('✓ 新外键约束已创建');
  } catch (err: any) {
    console.error('  外键约束创建失败:', err.message);
  }

  console.log('\n4. 修改 favorites 外键约束...');
  try {
    await pgPool.query(`ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_user_id_fkey`);
    console.log('  旧外键约束已删除');
  } catch (err: any) {
    console.log('  外键约束不存在');
  }

  try {
    await pgPool.query(`
      ALTER TABLE favorites
      ADD CONSTRAINT favorites_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    `);
    console.log('✓ 新外键约束已创建');
  } catch (err: any) {
    console.error('  外键约束创建失败:', err.message);
  }

  console.log('\n5. 修改 episode_skip_configs 外键约束...');
  try {
    await pgPool.query(`ALTER TABLE episode_skip_configs DROP CONSTRAINT IF EXISTS episode_skip_configs_user_id_fkey`);
    console.log('  旧外键约束已删除');
  } catch (err: any) {
    console.log('  外键约束不存在');
  }

  try {
    await pgPool.query(`
      ALTER TABLE episode_skip_configs
      ADD CONSTRAINT episode_skip_configs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    `);
    console.log('✓ 新外键约束已创建');
  } catch (err: any) {
    console.error('  外键约束创建失败:', err.message);
  }

  console.log('\n6. 修改 search_history 外键约束...');
  try {
    await pgPool.query(`ALTER TABLE search_history DROP CONSTRAINT IF EXISTS search_history_user_id_fkey`);
    console.log('  旧外键约束已删除');
  } catch (err: any) {
    console.log('  外键约束不存在');
  }

  try {
    await pgPool.query(`
      ALTER TABLE search_history
      ADD CONSTRAINT search_history_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    `);
    console.log('✓ 新外键约束已创建');
  } catch (err: any) {
    console.error('  外键约束创建失败:', err.message);
  }

  console.log('\n7. 修改 user_statistics 外键约束...');
  try {
    await pgPool.query(`ALTER TABLE user_statistics DROP CONSTRAINT IF EXISTS user_statistics_user_id_fkey`);
    console.log('  旧外键约束已删除');
  } catch (err: any) {
    console.log('  外键约束不存在');
  }

  try {
    await pgPool.query(`
      ALTER TABLE user_statistics
      ADD CONSTRAINT user_statistics_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    `);
    console.log('✓ 新外键约束已创建');
  } catch (err: any) {
    console.error('  外键约束创建失败:', err.message);
  }

  console.log('\n8. 修改 access_logs 外键约束...');
  try {
    await pgPool.query(`ALTER TABLE access_logs DROP CONSTRAINT IF EXISTS access_logs_user_id_fkey`);
    console.log('  旧外键约束已删除');
  } catch (err: any) {
    console.log('  外键约束不存在');
  }

  try {
    await pgPool.query(`
      ALTER TABLE access_logs
      ADD CONSTRAINT access_logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
    `);
    console.log('✓ 新外键约束已创建');
  } catch (err: any) {
    console.error('  外键约束创建失败:', err.message);
  }

  console.log('\n9. 重新启用 RLS...');
  await pgPool.query(`ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE play_records ENABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE favorites ENABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE episode_skip_configs ENABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE search_history ENABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY`);
  await pgPool.query(`ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY`);
  console.log('✓ RLS 已重新启用');

  console.log('\n========================================');
  console.log('✅ Schema 修复完成！');
  console.log('========================================');

  await pgPool.end();
}

fixSchema().catch(console.error);
