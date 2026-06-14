import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_URL!,
  token: process.env.UPSTASH_TOKEN!,
});

async function main() {
  const keys = await redis.keys('*');
  
  const userKeys = keys.filter(k => k.startsWith('u:'));
  const skipKeys = userKeys.filter(k => k.includes(':skip:') || k.includes(':episodeskip:'));
  const pwdKeys = userKeys.filter(k => k.endsWith(':pwd'));
  const shKeys = userKeys.filter(k => k.endsWith(':sh'));
  const prKeys = userKeys.filter(k => k.includes(':pr:'));
  
  console.log('=== 播放记录数据结构 ===');
  for (const key of prKeys.slice(0, 3)) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  console.log('\n=== 跳过配置数据结构 ===');
  for (const key of skipKeys.slice(0, 3)) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  console.log('\n=== 用户密码 ===');
  for (const key of pwdKeys.slice(0, 3)) {
    const value = await redis.get(key);
    console.log(`\n${key}: ${value} (类型: ${typeof value})`);
  }

  console.log('\n=== 搜索历史 ===');
  for (const key of shKeys.slice(0, 3)) {
    const list = await redis.lrange(key, 0, -1);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(list, null, 2));
  }

  const alKeys = keys.filter(k => k.startsWith('al:') && !k.startsWith('al:action:') && !k.startsWith('al:index:'));
  console.log('\n=== 访问日志数据结构 ===');
  for (const key of alKeys.slice(0, 3)) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  const loginStatsKeys = keys.filter(k => k.startsWith('user_login_stats:'));
  console.log('\n=== 用户登录统计数据结构 ===');
  for (const key of loginStatsKeys.slice(0, 3)) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }

  const actionKeys = keys.filter(k => k.startsWith('al:action:'));
  console.log('\n=== 活动统计数据结构 ===');
  for (const key of actionKeys) {
    const value = await redis.get(key);
    console.log(`\n${key}:`);
    console.log(JSON.stringify(value, null, 2));
  }
}

main().catch(console.error);
