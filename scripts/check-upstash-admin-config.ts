import { Redis } from '@upstash/redis';
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

// 使用之前提供的 Upstash 凭据
const upstashUrl = process.env.UPSTASH_URL;
if (!upstashUrl) {
  throw new Error('UPSTASH_URL env variable must be set');
}
const upstashToken = process.env.UPSTASH_TOKEN;
if (!upstashToken) {
  throw new Error('UPSTASH_TOKEN env variable must be set');
}

const redis = new Redis({
  url: upstashUrl,
  token: upstashToken,
});

async function checkUpstashAdminConfig() {
  try {
    console.log('=== 检查 Upstash 中的 admin:config ===\n');

    const config = await redis.get('admin:config');

    if (!config) {
      console.log('❌ Upstash 中没有 admin:config 数据');
    } else {
      console.log('✓ 找到 admin:config');
      console.log('类型:', typeof config);

      let configData = config;
      if (typeof config === 'string') {
        try {
          configData = JSON.parse(config);
          console.log('✓ 已解析 JSON');
        } catch (e) {
          console.error('❌ JSON 解析失败:', e);
          return;
        }
      }

      console.log('\n配置内容:');
      console.log(JSON.stringify(configData, null, 2));

      if (typeof configData === 'object') {
        const c = configData as any;
        console.log('\n=== 配置统计 ===');
        console.log('SourceConfig 数量:', c.SourceConfig?.length || 0);
        console.log('CustomCategories 数量:', c.CustomCategories?.length || 0);
        console.log('LiveConfig 数量:', c.LiveConfig?.length || 0);
        console.log('UserConfig.Users 数量:', c.UserConfig?.Users?.length || 0);

        if (c.SourceConfig && c.SourceConfig.length > 0) {
          console.log('\n源列表:');
          c.SourceConfig.forEach((site: any, index: number) => {
            console.log(`  [${index}] ${site.key} - ${site.name} (${site.api ? '有API' : '无API'})`);
          });
        }
      }
    }

    console.log('\n=== 检查所有以 admin: 开头的键 ===\n');
    const adminKeys = await redis.keys('admin:*');
    console.log('找到的 admin 键:', adminKeys);

  } catch (e) {
    console.error('检查失败:', e);
    process.exit(1);
  }
}

checkUpstashAdminConfig();
