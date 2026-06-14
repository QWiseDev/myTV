/**
 * 分析 admin_config 中的 JSON 结构
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach((line) => {
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
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false } }
);

async function analyzeConfig() {
  console.log('=== 分析 admin_config 结构 ===\n');

  const { data } = await supabase
    .from('admin_config')
    .select('config')
    .single();

  if (!data) {
    console.log('没有配置数据');
    return;
  }

  let config = data.config;
  if (typeof config === 'string') {
    config = JSON.parse(config);
  }

  console.log('顶级键:');
  for (const [key, value] of Object.entries(config || {})) {
    if (Array.isArray(value)) {
      console.log(`  ${key}: 数组 (${value.length} 项)`);
      if (value.length > 0) {
        console.log(`    第一项: ${JSON.stringify(value[0]).substring(0, 100)}...`);
      }
    } else if (typeof value === 'object' && value !== null) {
      console.log(`  ${key}: 对象`);
      console.log(`    键: ${Object.keys(value).join(', ')}`);
    } else {
      console.log(`  ${key}: ${typeof value} (${String(value).substring(0, 50)})`);
    }
  }

  // 分析 SourceConfig
  console.log('\n=== SourceConfig 分析 ===');
  if (config.SourceConfig && Array.isArray(config.SourceConfig)) {
    console.log(`总数: ${config.SourceConfig.length}`);
    console.log('字段:');
    if (config.SourceConfig.length > 0) {
      const firstSource = config.SourceConfig[0];
      for (const key of Object.keys(firstSource)) {
        console.log(`  - ${key}`);
      }
    }
  }

  // 计算大小
  const configSize = JSON.stringify(config).length;
  const sourceConfigSize = JSON.stringify(config.SourceConfig).length;
  console.log(`\n配置总大小: ${(configSize / 1024).toFixed(2)} KB`);
  console.log(`SourceConfig 大小: ${(sourceConfigSize / 1024).toFixed(2)} KB`);
  console.log(`SourceConfig 占比: ${((sourceConfigSize / configSize) * 100).toFixed(1)}%`);
}

analyzeConfig().catch(console.error);
