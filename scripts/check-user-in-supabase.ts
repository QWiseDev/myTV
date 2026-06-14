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
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '已设置' : '未设置');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseKey ? '已设置' : '未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
  console.log('=== 检查 Supabase profiles 表中的用户 ===\n');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ 查询 profiles 表失败:', error);
    return;
  }

  console.log(`找到 ${profiles.length} 个用户:\n`);

  profiles.forEach((profile: any, i: number) => {
    console.log(`[${i + 1}] 用户名: ${profile.username}`);
    console.log(`    ID: ${profile.id}`);
    console.log(`    角色: ${profile.role}`);
    console.log(`    禁用: ${profile.banned ? '是' : '否'}`);
    console.log(`    创建时间: ${profile.created_at}`);
    console.log();
  });

  console.log('=== 检查特定用户 ===\n');

  const targetUsername = 'qiuwei';
  const { data: qiuweiProfile, error: qiuweiError } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', targetUsername)
    .single();

  if (qiuweiError || !qiuweiProfile) {
    console.log(`❌ 用户 "${targetUsername}" 不存在于 profiles 表中`);
  } else {
    console.log(`✅ 用户 "${targetUsername}" 存在:`);
    console.log(`    ID: ${qiuweiProfile.id}`);
    console.log(`    角色: ${qiuweiProfile.role}`);
    console.log(`    禁用: ${qiuweiProfile.banned ? '是' : '否'}`);
  }
}

checkUsers().then(() => {
  console.log('\n✓ 检查完成');
});
