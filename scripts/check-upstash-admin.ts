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

const redis = new Redis({
  url: process.env.UPSTASH_URL || '',
  token: process.env.UPSTASH_TOKEN || '',
});

async function checkAdminConfig() {
  try {
    const keys = await redis.keys('admin*');
    console.log('Upstash 中的 admin 相关键:');
    console.log(keys);

    for (const key of keys) {
      const type = await redis.type(key);
      console.log(`\n键: ${key}`);
      console.log(`类型: ${type}`);

      if (type === 'string') {
        const value = await redis.get(key);
        console.log('值:', JSON.stringify(value, null, 2));
      } else if (type === 'hash') {
        const hash = await redis.hgetall(key);
        console.log('Hash 值:', JSON.stringify(hash, null, 2));
      }
    }
  } catch (e) {
    console.error('检查失败:', e);
    process.exit(1);
  }
}

checkAdminConfig();
