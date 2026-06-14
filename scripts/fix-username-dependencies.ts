import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function main() {
  try {
    console.log('开始查找依赖 username 列的对象...\n');

    const client = await pgPool.connect();

    try {
      console.log('1. 查找包含 username 的索引...');
      const indexResult = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'play_records'
        AND indexdef LIKE '%username%'
      `);
      console.log('索引:', indexResult.rows.length, '个');
      indexResult.rows.forEach(row => {
        console.log('  -', row.indexname);
      });

      console.log('\n2. 查找包含 username 的约束...');
      const constraintResult = await client.query(`
        SELECT conname, contype
        FROM pg_constraint
        WHERE conrelid = 'play_records'::regclass
        AND conname LIKE '%username%'
      `);
      console.log('约束:', constraintResult.rows.length, '个');
      constraintResult.rows.forEach(row => {
        console.log('  -', row.conname, '类型:', row.contype);
      });

      console.log('\n3. 查找使用 play_records.username 的视图...');
      const viewResult = await client.query(`
        SELECT viewname, definition
        FROM pg_views
        WHERE definition LIKE '%play_records%'
        AND definition LIKE '%username%'
      `);
      console.log('视图:', viewResult.rows.length, '个');
      viewResult.rows.forEach(row => {
        console.log('  -', row.viewname);
      });

      console.log('\n4. 查找使用 play_records.username 的函数...');
      const funcResult = await client.query(`
        SELECT proname, prosrc
        FROM pg_proc
        WHERE prosrc LIKE '%play_records%'
        AND prosrc LIKE '%username%'
      `);
      console.log('函数:', funcResult.rows.length, '个');
      funcResult.rows.forEach(row => {
        console.log('  -', row.proname);
      });

      console.log('\n5. 查找包含 username 的触发器...');
      const triggerResult = await client.query(`
        SELECT tgname, tgrelid::regclass as tablename
        FROM pg_trigger
        WHERE tgrelid = 'play_records'::regclass
        AND tgname LIKE '%username%'
      `);
      console.log('触发器:', triggerResult.rows.length, '个');
      triggerResult.rows.forEach(row => {
        console.log('  -', row.tgname);
      });

      console.log('\n6. 检查 play_records 表的列依赖...');
      const columnResult = await client.query(`
        SELECT attname, atttypid::regtype, attnum
        FROM pg_attribute
        WHERE attrelid = 'play_records'::regclass
        AND attnum > 0
        AND NOT attisdropped
        ORDER BY attnum
      `);
      console.log('当前表列:');
      columnResult.rows.forEach(row => {
        console.log('  -', row.attname, '类型:', row.atttypid);
      });

    } finally {
      client.release();
    }

    console.log('\n检查完成！');

  } catch (err) {
    console.error('错误:', err);
  } finally {
    await pgPool.end();
  }
}

main();
