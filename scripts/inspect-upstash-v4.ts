import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_URL!,
  token: process.env.UPSTASH_TOKEN!,
});

async function main() {
  const keys = await redis.keys('*');
  
  console.log('=== 活动统计数据 ===');
  const actionKeys = keys.filter(k => k.startsWith('al:action:'));
  for (const key of actionKeys) {
    const type = await redis.type(key);
    console.log(`\n${key} (type: ${type}):`);
    if (type === 'string') {
      const value = await redis.get(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'hash') {
      const value = await redis.hgetall(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'set') {
      const value = await redis.smembers(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'list') {
      const value = await redis.lrange(key, 0, -1);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'zset') {
      const value = await redis.zrange(key, 0, -1, { withScores: true });
      console.log(JSON.stringify(value, null, 2));
    }
  }

  console.log('\n=== 索引统计数据 ===');
  const indexKeys = keys.filter(k => k.startsWith('al:index:'));
  for (const key of indexKeys) {
    const type = await redis.type(key);
    console.log(`\n${key} (type: ${type}):`);
    if (type === 'string') {
      const value = await redis.get(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'hash') {
      const value = await redis.hgetall(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'set') {
      const value = await redis.smembers(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'list') {
      const value = await redis.lrange(key, 0, -1);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'zset') {
      const value = await redis.zrange(key, 0, -1, { withScores: true });
      console.log(JSON.stringify(value, null, 2));
    }
  }

  console.log('\n=== 日期统计数据 ===');
  const dateKeys = keys.filter(k => k.match(/^al:user:[^:]+:\d{4}-\d{2}-\d{2}$/));
  for (const key of dateKeys) {
    const type = await redis.type(key);
    console.log(`\n${key} (type: ${type}):`);
    if (type === 'string') {
      const value = await redis.get(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'hash') {
      const value = await redis.hgetall(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'set') {
      const value = await redis.smembers(key);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'list') {
      const value = await redis.lrange(key, 0, -1);
      console.log(JSON.stringify(value, null, 2));
    } else if (type === 'zset') {
      const value = await redis.zrange(key, 0, -1, { withScores: true });
      console.log(JSON.stringify(value, null, 2));
    }
  }
}

main().catch(console.error);
