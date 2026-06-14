import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const upstashUrl = process.env.UPSTASH_URL;
if (!upstashUrl) {
  throw new Error('UPSTASH_URL env variable must be set');
}
const upstashToken = process.env.UPSTASH_TOKEN;
if (!upstashToken) {
  throw new Error('UPSTASH_TOKEN env variable must be set');
}

const upstashRedis = new Redis({
  url: upstashUrl,
  token: upstashToken,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: false
    }
  }
);

async function migrateAdminConfig() {
  try {
    console.log('=== 从 Upstash 读取 admin:config ===\n');

    const config = await upstashRedis.get('admin:config');

    if (!config) {
      console.log('❌ Upstash 中没有 admin:config 数据');
      process.exit(1);
    }

    let configData: any = config;
    if (typeof config === 'string') {
      try {
        configData = JSON.parse(config);
        console.log('✓ 已解析 JSON');
      } catch (e) {
        console.error('❌ JSON 解析失败:', e);
        process.exit(1);
      }
    }

    console.log(`✓ 找到配置，包含 ${configData.SourceConfig?.length || 0} 个源`);

    console.log('\n=== 写入 Supabase admin_config 表 ===\n');

    const { data, error } = await supabase
      .from('admin_config')
      .upsert(
        { id: '00000000-0000-0000-0000-000000000001', config: configData },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('❌ 写入失败:', error);
      process.exit(1);
    }

    console.log('✓ 成功写入 Supabase');

    console.log('\n=== 验证写入结果 ===\n');

    const { data: verifyData, error: verifyError } = await supabase
      .from('admin_config')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (verifyError) {
      console.error('❌ 验证失败:', verifyError);
      process.exit(1);
    }

    const verifyConfig: any = typeof verifyData.config === 'string'
      ? JSON.parse(verifyData.config)
      : verifyData.config;

    console.log('✓ 验证成功');
    console.log(`  SourceConfig 数量: ${verifyConfig.SourceConfig?.length || 0}`);
    console.log(`  CustomCategories 数量: ${verifyConfig.CustomCategories?.length || 0}`);
    console.log(`  LiveConfig 数量: ${verifyConfig.LiveConfig?.length || 0}`);
    console.log(`  UserConfig.Users 数量: ${verifyConfig.UserConfig?.Users?.length || 0}`);

    if (verifyConfig.SourceConfig && verifyConfig.SourceConfig.length > 0) {
      console.log('\n前 5 个源:');
      verifyConfig.SourceConfig.slice(0, 5).forEach((site: any, index: number) => {
        console.log(`  [${index}] ${site.key} - ${site.name}`);
      });
    }

  } catch (e) {
    console.error('迁移失败:', e);
    process.exit(1);
  }
}

migrateAdminConfig();
