import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient } from 'redis';
import { readFileSync } from 'node:fs';

function loadEnvFile(path = '.env') {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;

      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional.
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function encodeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function withRetry(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has('--apply'),
    pattern: process.env.MIGRATE_KEY_PATTERN || '*',
    skipRegex: process.env.MIGRATE_SKIP_REGEX
      ? new RegExp(process.env.MIGRATE_SKIP_REGEX)
      : null,
    timeoutMs: Number(process.env.MIGRATE_KEY_TIMEOUT_MS || 20000),
  };
}

async function sourceCall(operation, timeoutMs, label) {
  return withRetry(() => withTimeout(operation(), timeoutMs, label));
}

async function copyKey({ source, target, key, type, apply, timeoutMs }) {
  if (!apply) {
    return;
  }

  await target.del(key);

  if (type === 'string') {
    const value = await sourceCall(
      () => source.get(key),
      timeoutMs,
      `GET ${key}`,
    );
    await target.set(key, encodeValue(value));
    return;
  }

  if (type === 'list') {
    const values = await sourceCall(
      () => source.lrange(key, 0, -1),
      timeoutMs,
      `LRANGE ${key}`,
    );
    if (values.length > 0) {
      await target.rPush(key, values.map(encodeValue));
    }
    return;
  }

  if (type === 'hash') {
    const hash = await sourceCall(
      () => source.hgetall(key),
      timeoutMs,
      `HGETALL ${key}`,
    );
    if (hash && Object.keys(hash).length > 0) {
      const payload = {};
      for (const [field, value] of Object.entries(hash)) {
        payload[field] = encodeValue(value);
      }
      await target.hSet(key, payload);
    }
    return;
  }

  if (type === 'set') {
    const values = await sourceCall(
      () => source.smembers(key),
      timeoutMs,
      `SMEMBERS ${key}`,
    );
    if (values.length > 0) {
      await target.sAdd(key, values.map(encodeValue));
    }
    return;
  }

  if (type === 'zset') {
    const values = await sourceCall(
      () => source.zrange(key, 0, -1, { withScores: true }),
      timeoutMs,
      `ZRANGE ${key}`,
    );
    if (Array.isArray(values) && values.length > 0) {
      const members = [];
      for (let i = 0; i < values.length; i += 2) {
        members.push({
          value: encodeValue(values[i]),
          score: Number(values[i + 1]),
        });
      }
      if (members.length > 0) {
        await target.zAdd(key, members);
      }
    }
    return;
  }

  throw new Error(`Unsupported Redis key type: ${type}`);
}

async function main() {
  loadEnvFile();

  const { apply, pattern, skipRegex, timeoutMs } = parseArgs();
  const source = new UpstashRedis({
    url: requireEnv('UPSTASH_URL'),
    token: requireEnv('UPSTASH_TOKEN'),
  });
  const target = createClient({ url: requireEnv('REDIS_URL') });
  target.on('error', (error) => {
    console.error('Target Redis error:', error.message);
  });

  await target.connect();

  const keys = await withRetry(() => source.keys(pattern));
  const summary = {
    scanned: keys.length,
    migrated: 0,
    skipped: 0,
    byType: {},
  };

  console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
  console.log(`Pattern: ${pattern}`);
  console.log(`Skip regex: ${skipRegex ? skipRegex.source : '(none)'}`);
  console.log(`Key timeout: ${timeoutMs}ms`);
  console.log(`Source keys: ${keys.length}`);

  for (const [index, key] of keys.entries()) {
    if (skipRegex?.test(key)) {
      summary.skipped += 1;
      console.log(`[${index + 1}/${keys.length}] skip ${key}`);
      continue;
    }

    const type = await withRetry(() => source.type(key));
    summary.byType[type] = (summary.byType[type] || 0) + 1;

    try {
      console.log(`[${index + 1}/${keys.length}] ${type} ${key}`);
      await copyKey({ source, target, key, type, apply, timeoutMs });

      if (apply) {
        const ttl = await withRetry(() => source.ttl(key));
        if (ttl > 0) {
          await target.expire(key, ttl);
        }
      }

      summary.migrated += 1;
      console.log(`[${index + 1}/${keys.length}] done ${key}`);
    } catch (error) {
      summary.skipped += 1;
      console.warn(`Skip ${key}: ${error.message}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  await target.quit();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
