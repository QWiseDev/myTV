import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_URL!,
  token: process.env.UPSTASH_TOKEN!,
});

async function main() {
  const keys = await redis.keys('*');
  console.log('Total keys:', keys.length);
  console.log('\n=== 所有 Keys ===');
  keys.forEach((k, i) => console.log(`${i+1}. ${k}`));
  
  console.log('\n=== 按类型分组 ===');
  const userKeys = keys.filter(k => k.startsWith('u:'));
  const adminKeys = keys.filter(k => k.startsWith('admin:'));
  const cacheKeys = keys.filter(k => k.startsWith('cache:'));
  
  console.log('用户数据:', userKeys.length);
  userKeys.forEach(k => console.log('  -', k));
  
  console.log('\n管理员数据:', adminKeys.length);
  adminKeys.forEach(k => console.log('  -', k));
  
  console.log('\n缓存数据:', cacheKeys.length);
  cacheKeys.forEach(k => console.log('  -', k));
  
  const otherKeys = keys.filter(k => !k.startsWith('u:') && !k.startsWith('admin:') && !k.startsWith('cache:'));
  if (otherKeys.length > 0) {
    console.log('\n其他数据:', otherKeys.length);
    otherKeys.forEach(k => console.log('  -', k));
  }

  console.log('\n\n=== 详细数据示例 ===');
  
  for (const userKey of userKeys.slice(0, 5)) {
    const value = await redis.get(userKey);
    console.log(`\n${userKey}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  for (const adminKey of adminKeys) {
    const value = await redis.get(adminKey);
    console.log(`\n${adminKey}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  for (const cacheKey of cacheKeys.slice(0, 3)) {
    const value = await redis.get(cacheKey);
    console.log(`\n${cacheKey}:`);
    console.log(JSON.stringify(value, null, 2));
  }
}

main().catch(console.error);
