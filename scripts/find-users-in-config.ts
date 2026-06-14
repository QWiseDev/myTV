import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function findUsers() {
  console.log('========================================');
  console.log('查找用户配置');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  console.log('\n1. 查询所有 admin_config 记录...');
  const { rows: adminData } = await pgPool.query('SELECT id, config FROM admin_config');

  console.log(`  共 ${adminData.length} 条记录:`);
  
  let usersFound = false;
  let userConfig: any = null;
  
  for (let i = 0; i < adminData.length; i++) {
    const record = adminData[i];
    const config = record.config;
    
    console.log(`\n  记录 ${i + 1} (ID: ${record.id}):`);
    console.log(`    配置键:`, Object.keys(config).join(', '));
    
    if (config && config.UserConfig && config.UserConfig.Users) {
      const users = config.UserConfig.Users;
      console.log(`    ✓ 找到 ${users.length} 个用户:`);
      users.forEach((user: any, index: number) => {
        console.log(`      ${index + 1}. ${user.username} (${user.role})`);
      });
      usersFound = true;
      userConfig = config;
    }
  }

  if (!usersFound) {
    console.log('\n  ⚠️  未找到用户配置');
  }

  console.log('\n========================================');

  if (usersFound && userConfig) {
    console.log('找到用户配置，准备迁移...');
    console.log('用户配置 ID:', userConfig.id);
  }

  await pgPool.end();
}

findUsers().catch(console.error);
