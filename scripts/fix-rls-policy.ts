import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function main() {
  console.log('========================================');
  console.log('修复 RLS 策略');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  try {
    console.log('\n1. 查看当前的 RLS 策略...');
    const { rows } = await pgPool.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE tablename = 'play_records'
    `);

    rows.forEach(row => {
      console.log('  策略:', row.policyname);
      console.log('    使用表达式:', row.qual);
    });

    console.log('\n2. 删除旧策略...');
    await pgPool.query(`DROP POLICY IF EXISTS "用户可以管理自己的播放记录" ON play_records`);
    console.log('  ✓ 旧策略已删除');

    console.log('\n3. 创建新策略 (使用 user_id)...');
    await pgPool.query(`
      CREATE POLICY "用户可以管理自己的播放记录"
      ON play_records
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)
    `);
    console.log('  ✓ 新策略已创建');

    console.log('\n4. 删除索引 idx_play_records_username...');
    await pgPool.query(`DROP INDEX IF EXISTS idx_play_records_username`);
    console.log('  ✓ 索引已删除');

    console.log('\n5. 删除 username 列...');
    await pgPool.query(`ALTER TABLE play_records DROP COLUMN IF EXISTS username`);
    console.log('  ✓ username 列已删除');

    console.log('\n6. 创建新的唯一索引...');
    await pgPool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_play_record
      ON play_records (user_id, source, source_id)
    `);
    console.log('  ✓ 新的唯一索引已创建 (user_id, source, source_id)');

    console.log('\n7. 验证表结构...');
    const { rows: columns } = await pgPool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'play_records'
      ORDER BY ordinal_position
    `);

    console.log('  当前列:');
    columns.forEach(row => {
      console.log('    -', row.column_name, ':', row.data_type);
    });

    console.log('\n8. 验证 RLS 策略...');
    const { rows: policies } = await pgPool.query(`
      SELECT policyname, qual, with_check
      FROM pg_policies
      WHERE tablename = 'play_records'
    `);

    console.log('  当前策略:');
    policies.forEach(row => {
      console.log('    -', row.policyname);
      console.log('      USING:', row.qual);
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
