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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: false
    }
  }
);

async function analyze() {
  console.log('=== 检查 Supabase admin_config 表 ===\n');

  const { data, error } = await supabase
    .from('admin_config')
    .select('*');

  if (error) {
    console.error('查询失败:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('记录数量:', data.length);
    data.forEach((record, index) => {
      console.log(`\n记录 ${index + 1}:`);
      console.log('  ID:', record.id);
      console.log('  config 类型:', typeof record.config);
      console.log('  config 内容:', JSON.stringify(record.config, null, 2));

      if (typeof record.config === 'object') {
        const config = record.config as any;
        console.log('  SourceConfig 数量:', config.SourceConfig?.length || 0);
        console.log('  CustomCategories 数量:', config.CustomCategories?.length || 0);
        console.log('  LiveConfig 数量:', config.LiveConfig?.length || 0);
        console.log('  UserConfig.Users 数量:', config.UserConfig?.Users?.length || 0);
      }
    });
  } else {
    console.log('没有数据');
  }

  console.log('\n=== 检查是否有配置文件 ===\n');
  const possibleConfigFiles = [
    'config.json',
    'data/config.json',
    'config.json.backup',
    'admin_config.json',
  ];

  possibleConfigFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      console.log(`✓ 找到配置文件: ${file}`);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        console.log(`  api_site 数量: ${Object.keys(content.api_site || {}).length}`);
        if (content.api_site) {
          console.log('  api_site 列表:');
          Object.entries(content.api_site).forEach(([key, site]: [string, any]) => {
            console.log(`    - ${key}: ${site.name} (${site.api ? '有API' : '无API'})`);
          });
        }
      } catch (e) {
        console.log(`  解析失败:`, e);
      }
    }
  });

  console.log('\n=== 检查环境变量 ===\n');
  console.log('NEXT_PUBLIC_SITE_NAME:', process.env.NEXT_PUBLIC_SITE_NAME);
  console.log('NEXT_PUBLIC_STORAGE_TYPE:', process.env.NEXT_PUBLIC_STORAGE_TYPE);
  console.log('USERNAME:', process.env.USERNAME);
}

analyze().catch(console.error);
