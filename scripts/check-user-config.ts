import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';

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

async function checkUserConfig() {
  console.log('=== 检查 admin_config 中的用户配置 ===\n');

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
  console.log(`找到 ${users.length} 个用户:\n`);

  users.forEach((user: any, i: number) => {
    console.log(`[${i + 1}] 用户名: ${user.username}`);
    console.log(`    角色: ${user.role}`);
    console.log(`    禁用: ${user.banned ? '是' : '否'}`);
    if (user.enabledApis) {
      console.log(`    启用的 API 数量: ${user.enabledApis.length}`);
    }
    console.log();
  });

  console.log('=== 检查特定用户 ===\n');

  const targetUsername = 'qiuwei';
  const targetUser = users.find((u: any) => u.username === targetUsername);

  if (!targetUser) {
    console.log(`❌ 用户 "${targetUsername}" 不存在于 UserConfig.Users 中`);
  } else {
    console.log(`✅ 用户 "${targetUsername}" 存在于 UserConfig.Users 中:`);
    console.log(`    角色: ${targetUser.role}`);
    console.log(`    禁用: ${targetUser.banned ? '是' : '否'}`);
    if (targetUser.enabledApis) {
      console.log(`    启用的 API 数量: ${targetUser.enabledApis.length}`);
      console.log(`    启用的 API: ${targetUser.enabledApis.slice(0, 5).join(', ')}${targetUser.enabledApis.length > 5 ? '...' : ''}`);
    }
  }
}

checkUserConfig().then(() => {
  console.log('\n✓ 检查完成');
});
