import { Pool } from 'pg';

const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING;
if (!PG_CONNECTION_STRING) {
  throw new Error('PG_CONNECTION_STRING env variable must be set');
}

const pgPool = new Pool({ connectionString: PG_CONNECTION_STRING });

async function migrateUsers() {
  console.log('========================================');
  console.log('迁移用户数据 (直接数据库连接)');
  console.log('========================================');

  try {
    await pgPool.query('SELECT 1');
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.error('✗ 数据库连接失败:', err);
    process.exit(1);
  }

  console.log('\n1. 查询 admin_config 中的用户数据...');
  const { rows: adminConfigRecords } = await pgPool.query(`
    SELECT id, config
    FROM admin_config
  `);

  if (adminConfigRecords.length === 0) {
    console.log('  没有找到配置数据，退出');
    await pgPool.end();
    return;
  }

  let adminUsers: any[] = [];
  for (const record of adminConfigRecords) {
    const config = record.config;
    if (config && config.UserConfig && config.UserConfig.Users) {
      adminUsers = config.UserConfig.Users;
      break;
    }
  }

  console.log(`  找到 ${adminUsers.length} 个用户:`);
  adminUsers.forEach((user: any, index: number) => {
    console.log(`    ${index + 1}. ${user.username} (${user.role})`);
  });

  if (adminUsers.length === 0) {
    console.log('  没有找到用户数据，退出');
    await pgPool.end();
    return;
  }

  console.log('\n2. 查询 profiles 表中已存在的用户...');
  const { rows: existingProfiles } = await pgPool.query(`
    SELECT id, username
    FROM profiles
  `);

  const existingUsernames = new Set(existingProfiles.map(p => p.username));
  console.log(`  已有 ${existingProfiles.length} 个用户:`);
  existingProfiles.forEach(profile => {
    console.log(`    - ${profile.username} (ID: ${profile.id})`);
  });

  console.log('\n3. 禁用 RLS...');
  await pgPool.query(`ALTER TABLE profiles DISABLE ROW LEVEL SECURITY`);
  console.log('✓ RLS 已禁用');

  console.log('\n4. 开始迁移用户...');
  let migratedCount = 0;
  let skippedCount = 0;

  for (const adminUser of adminUsers) {
    if (!adminUser.username) {
      console.log(`  ⚠️  跳过: 用户没有 username`);
      skippedCount++;
      continue;
    }

    if (existingUsernames.has(adminUser.username)) {
      console.log(`  ⚠️  跳过: 用户 "${adminUser.username}" 已存在`);
      skippedCount++;
      continue;
    }

    try {
      const userId = crypto.randomUUID();
      const passwordHash = adminUser.password || '';
      const role = adminUser.role || 'user';
      const banned = adminUser.banned === 'true' || adminUser.banned === true;
      const now = new Date();

      await pgPool.query(`
        INSERT INTO profiles (id, username, password_hash, role, banned, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [userId, adminUser.username, passwordHash, role, banned, now, now]);

      console.log(`  ✓ 成功: ${adminUser.username} -> ${userId}`);
      migratedCount++;
    } catch (err: any) {
      console.error(`  ✗ 失败: ${adminUser.username} - ${err.message}`);
    }
  }

  console.log('\n5. 重新启用 RLS...');
  await pgPool.query(`ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`);
  console.log('✓ RLS 已重新启用');

  console.log('\n========================================');
  console.log('迁移结果:');
  console.log(`  成功: ${migratedCount} 个用户`);
  console.log(`  跳过: ${skippedCount} 个用户`);
  console.log('========================================');

  if (migratedCount > 0) {
    console.log('\n验证迁移结果:');
    const { rows: allProfiles } = await pgPool.query(`
      SELECT id, username, role, banned
      FROM profiles
      ORDER BY created_at DESC
    `);

    allProfiles.forEach(profile => {
      console.log(`  - ${profile.username} (${profile.role}) ${profile.banned ? '[已禁用]' : ''}`);
    });
  }

  await pgPool.end();
}

migrateUsers().catch(console.error);
