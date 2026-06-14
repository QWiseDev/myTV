import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';

function loadEnv(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          process.env[key.trim()] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
  } catch (e) {
    console.error('加载 .env 文件失败:', e);
  }
}

loadEnv(path.join(__dirname, '../.env'));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 Supabase 环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateUsers() {
  console.log('=== 从 admin_config 迁移用户到 profiles 表 ===\n');

  const { data: adminConfig, error } = await supabase
    .from('admin_config')
    .select('config')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !adminConfig) {
    console.error('❌ 获取 admin_config 失败:', error);
    return;
  }

  let config: any;
  if (typeof adminConfig.config === 'string') {
    config = JSON.parse(adminConfig.config);
  } else {
    config = adminConfig.config;
  }

  if (!config.UserConfig || !config.UserConfig.Users) {
    console.log('❌ admin_config 中没有 UserConfig.Users 数据');
    return;
  }

  const users = config.UserConfig.Users;
  console.log(`找到 ${users.length} 个用户需要迁移:\n`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    console.log(`正在迁移用户: ${user.username}`);

    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', user.username)
      .single();

    if (existingUser) {
      console.log(`  ⚠️  用户 ${user.username} 已存在，跳过\n`);
      continue;
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const passwordHash = user.password_hash || 
                        createHash('sha256').update('default123').digest('hex');

    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: user.username,
        password_hash: passwordHash,
        role: user.role || 'user',
        banned: user.banned || false,
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      console.error(`  ❌ 迁移失败: ${insertError.message}\n`);
      failCount++;
    } else {
      console.log(`  ✅ 迁移成功\n`);
      successCount++;
    }
  }

  console.log('=== 迁移结果 ===');
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${failCount}`);
  console.log(`跳过: ${users.length - successCount - failCount}`);
}

migrateUsers().then(() => {
  console.log('\n✓ 迁移完成');
});
