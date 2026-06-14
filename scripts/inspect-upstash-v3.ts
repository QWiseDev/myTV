import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_URL!,
  token: process.env.UPSTASH_TOKEN!,
});

async function main() {
  const keys = await redis.keys('*');
  
  console.log('=== 收藏数据 ===');
  const favKeys = keys.filter(k => k.includes(':fav:'));
  console.log('收藏数量:', favKeys.length);
  for (const key of favKeys) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  console.log('\n=== 活动统计数据 ===');
  const actionKeys = keys.filter(k => k.startsWith('al:action:'));
  for (const key of actionKeys) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  console.log('\n=== 索引统计数据 ===');
  const indexKeys = keys.filter(k => k.startsWith('al:index:'));
  for (const key of indexKeys) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  console.log('\n=== 日期统计数据 ===');
  const dateKeys = keys.filter(k => k.match(/^al:user:[^:]+:\d{4}-\d{2}-\d{2}$/));
  for (const key of dateKeys) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  console.log('\n=== 缓存数据 ===');
  const cacheKeys = keys.filter(k => k.startsWith('cache:'));
  for (const key of cacheKeys.slice(0, 3)) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }
}

main().catch(console.error);
