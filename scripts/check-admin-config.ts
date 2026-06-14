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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('缺少 Supabase 配置');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
});

async function checkAdminConfig() {
  try {
    const { data, error } = await supabase
      .from('admin_config')
      .select('*');

    if (error) {
      console.error('查询 admin_config 失败:', error);
      process.exit(1);
    }

    console.log('admin_config 数据:');
    console.log(JSON.stringify(data, null, 2));

    if (data && data.length > 0) {
      const config = data[0];
      const parsedValue = typeof config.config === 'string'
        ? JSON.parse(config.config)
        : config.config;

      console.log('\nSourceConfig 数量:', parsedValue.SourceConfig?.length || 0);
      if (parsedValue.SourceConfig && parsedValue.SourceConfig.length > 0) {
        console.log('源列表:');
        parsedValue.SourceConfig.forEach((site: any, index: number) => {
          console.log(`  [${index}] ${site.key} - ${site.name} (${site.api ? '有API' : '无API'})`);
        });
      } else {
        console.log('源列表为空');
      }
    } else {
      console.log('admin_config 表中没有数据');
    }
  } catch (e) {
    console.error('检查失败:', e);
    process.exit(1);
  }
}

checkAdminConfig();
