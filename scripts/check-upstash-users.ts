import { Redis } from '@upstash/redis';
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

const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashRedisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!upstashRedisRestUrl || !upstashRedisRestToken) {
  console.error('❌ 缺少 Upstash 环境变量');
  console.log('UPSTASH_REDIS_REST_URL:', upstashRedisRestUrl ? '已设置' : '未设置');
  console.log('UPSTASH_REDIS_REST_TOKEN:', upstashRedisRestToken ? '已设置' : '未设置');
  process.exit(1);
}

const redis = new Redis({
  url: upstashRedisRestUrl,
  token: upstashRedisRestToken,
});

async function checkUsers() {
  console.log('=== 检查 Upstash 中的用户数据 ===\n');

  try {
    const userKey = 'user';
    const userData = await redis.get(userKey);

    if (!userData) {
      console.log('❌ Upstash 中没有用户数据 (key: user)');
      return;
    }

    console.log('✅ 找到用户数据:');
    console.log('   类型:', typeof userData);
    console.log('   内容:', JSON.stringify(userData, null, 2));
  } catch (error) {
    console.error('❌ 获取用户数据失败:', error);
  }
}

checkUsers().then(() => {
  console.log('\n✓ 检查完成');
});
