import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

async function executeSqlFile(pool: Pool, filePath: string): Promise<void> {
  const sql = readFileSync(filePath, 'utf-8');

  console.log(`\n执行 ${filePath}...`);

  const statements: string[] = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarQuoteTag = '';

  let pos = 0;
  while (pos < sql.length) {
    const char = sql[pos];

    if (!inDollarQuote && char === '-' && pos + 1 < sql.length && sql[pos + 1] === '-') {
      while (pos < sql.length && sql[pos] !== '\n') {
        pos++;
      }
      continue;
    }

    if (!inDollarQuote && char === '/' && pos + 1 < sql.length && sql[pos + 1] === '*') {
      pos += 2;
      while (pos < sql.length - 1) {
        if (sql[pos] === '*' && sql[pos + 1] === '/') {
          pos += 2;
          break;
        }
        pos++;
      }
      continue;
    }

    if (char === '$' && pos + 1 < sql.length && sql[pos + 1] === '$') {
      if (!inDollarQuote) {
        inDollarQuote = true;
        let tag = '';
        let i = pos + 2;
        while (i < sql.length && sql[i] !== '$') {
          tag += sql[i];
          i++;
        }
        if (i < sql.length && sql[i] === '$') {
          dollarQuoteTag = tag;
          currentStatement += char + sql[pos + 1] + tag + sql[i];
          pos = i + 1;
          continue;
        }
      } else {
        let endTag = '';
        let i = pos + 2;
        while (i < sql.length && sql[i] !== '$') {
          endTag += sql[i];
          i++;
        }
        if (endTag === dollarQuoteTag && i < sql.length && sql[i] === '$') {
          inDollarQuote = false;
          currentStatement += char + sql[pos + 1] + endTag + sql[i];
          pos = i + 1;
          continue;
        }
      }
    }

    currentStatement += char;

    if (!inDollarQuote && char === ';') {
      const statement = currentStatement.trim();
      if (statement.length > 5 && !statement.startsWith('--') && !statement.startsWith('/*')) {
        statements.push(statement);
      }
      currentStatement = '';
    }

    pos++;
  }

  if (currentStatement.trim().length > 5) {
    statements.push(currentStatement.trim());
  }

  let successCount = 0;
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    try {
      await pool.query(statement);
      successCount++;
    } catch (error: any) {
      const ignoredErrors = ['42P07', '42710', '42P01', '42P16', '42701', '42P04'];
      if (!ignoredErrors.includes(error.code)) {
        console.error(`语句 ${i + 1} 执行失败:`, error.message);
        console.error(`语句内容:`, statement.substring(0, 200) + '...');
        throw error;
      }
    }
  }

  console.log(`✓ ${filePath} 执行完成 (${successCount}/${statements.length} 语句成功)`);
}

async function setupSupabase(): Promise<void> {
  const pool = new Pool({ connectionString });

  try {
    console.log('连接 Supabase 数据库...');
    await pool.query('SELECT 1');
    console.log('✓ 数据库连接成功');

    const schemaPath = join(process.cwd(), 'src/lib/supabase/schema.sql');
    await executeSqlFile(pool, schemaPath);

    const functionsPath = join(process.cwd(), 'src/lib/supabase/functions.sql');
    await executeSqlFile(pool, functionsPath);

    console.log('\n✓ 所有表和函数创建完成');
  } catch (error: any) {
    console.error('设置失败:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

setupSupabase()
  .then(() => {
    console.log('\n✓ Supabase 初始化完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ 初始化失败:', error);
    process.exit(1);
  });
