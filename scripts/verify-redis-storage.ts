import { RedisStorage } from '../src/lib/redis.db';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required');
  }

  const storage = new RedisStorage();
  const userName = `codex_redis_verify_${Date.now()}`;
  const source = 'codex';
  const id = 'verify';
  const key = `${source}+${id}`;

  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    await storage.registerUser(userName, 'password');
    assert(await storage.verifyUser(userName, 'password'), 'verifyUser failed');

    await storage.setPlayRecord(userName, key, {
      title: 'Redis Verify',
      source_name: source,
      cover: '',
      year: '2026',
      index: 1,
      total_episodes: 1,
      play_time: 12,
      total_time: 120,
      save_time: Date.now(),
      search_title: 'Redis Verify',
    });

    const record = await storage.getPlayRecord(userName, key);
    assert(record?.title === 'Redis Verify', 'getPlayRecord failed');

    const records = await storage.getAllPlayRecords(userName);
    assert(records[key]?.index === 1, 'getAllPlayRecords failed');

    await storage.setFavorite(userName, key, {
      title: 'Redis Verify',
      source_name: source,
      cover: '',
      year: '2026',
      total_episodes: 1,
      save_time: Date.now(),
      search_title: 'Redis Verify',
    });

    const favorite = await storage.getFavorite(userName, key);
    assert(favorite?.title === 'Redis Verify', 'getFavorite failed');

    const favorites = await storage.getAllFavorites(userName);
    assert(favorites[key]?.source_name === source, 'getAllFavorites failed');

    const favoriteHashType = await (storage as any).client.type(
      `u:${userName}:favh`,
    );
    assert(favoriteHashType === 'hash', 'favorite hash type failed');

    await storage.setSkipConfig(userName, source, id, {
      source,
      id,
      title: 'Redis Verify',
      segments: [{ start: 1, end: 2, type: 'opening' }],
      updated_time: Date.now(),
    });

    const skipConfig = await storage.getSkipConfig(userName, source, id);
    assert(skipConfig?.segments.length === 1, 'getSkipConfig failed');

    const skipConfigs = await storage.getAllSkipConfigs(userName);
    assert(
      skipConfigs[key]?.title === 'Redis Verify',
      'getAllSkipConfigs failed',
    );

    const firstLoginTime = Date.now();
    const secondLoginTime = firstLoginTime + 1000;
    await storage.updateUserLoginStats(userName, firstLoginTime, true);
    await storage.updateUserLoginStats(userName, secondLoginTime, false);

    const loginStatsType = await (storage as any).client.type(
      `user_login_stats:${userName}`,
    );
    assert(loginStatsType === 'hash', 'login stats hash type failed');

    const userStats = await storage.getUserPlayStat(userName);
    assert(userStats.loginCount === 2, 'loginCount failed');
    assert(userStats.firstLoginTime === firstLoginTime, 'firstLoginTime failed');
    assert(userStats.lastLoginTime === secondLoginTime, 'lastLoginTime failed');

    await (storage as any).setSlotUserData(
      userName,
      {
        coins: 12345,
        totalSpins: 7,
        totalWins: 3,
        biggestWin: 900,
        lastSpinTime: Date.now(),
        loseStreak: 1,
        chestCount: 2,
        specialSymbols: ['wild'],
      },
      60,
    );

    const slotUser = await (storage as any).getSlotUserData(userName);
    assert(slotUser?.coins === 12345, 'getSlotUserData failed');
    assert(slotUser?.specialSymbols?.[0] === 'wild', 'slot hash array failed');

    const slotHashType = await (storage as any).client.type(
      `slot:user:${userName}`,
    );
    assert(slotHashType === 'hash', 'slot user hash type failed');

    const slotRankScore = await (storage as any).client.sendCommand([
      'ZSCORE',
      'slot:rank:coins',
      userName,
    ]);
    assert(Number(slotRankScore) === 12345, 'slot rank score failed');

    const leaderboard = await (storage as any).getSlotLeaderboard('coins', 100);
    assert(
      leaderboard.some((item: any) => item.username === userName),
      'getSlotLeaderboard failed',
    );

    const slotUsers = await (storage as any).listSlotUsers();
    assert(
      slotUsers.some((item: any) => item.username === userName),
      'listSlotUsers failed',
    );

    const rateKey = `codex:rate:${userName}`;
    const firstRateCount = await (storage as any).incrementRateLimit(rateKey, 60);
    const secondRateCount = await (storage as any).incrementRateLimit(rateKey, 60);
    assert(firstRateCount === 1, 'incrementRateLimit first count failed');
    assert(secondRateCount === 2, 'incrementRateLimit second count failed');

    await storage.setCache(`codex:verify:${userName}`, { ok: true }, 60);
    const cacheKeys = await storage.keys(`cache:codex:verify:${userName}`);
    assert(cacheKeys.length === 1, 'keys failed');

    await storage.clearAllPlayRecords(userName);
    assert(
      Object.keys(await storage.getAllPlayRecords(userName)).length === 0,
      'clearAllPlayRecords failed',
    );

    await storage.clearAllSkipConfigs(userName);
    assert(
      Object.keys(await storage.getAllSkipConfigs(userName)).length === 0,
      'clearAllSkipConfigs failed',
    );

    await storage.deleteCache(`codex:verify:${userName}`);
    await (storage as any).client.del(`slot:user:${userName}`);
    await (storage as any).client.del(`codex:rate:${userName}`);
    await (storage as any).client.sendCommand(['SREM', 'slot:users', userName]);
    await (storage as any).client.sendCommand([
      'ZREM',
      'slot:rank:coins',
      userName,
    ]);
    await (storage as any).client.sendCommand([
      'ZREM',
      'slot:rank:biggestWin',
      userName,
    ]);
    await (storage as any).client.sendCommand([
      'ZREM',
      'slot:rank:totalWins',
      userName,
    ]);
    await storage.deleteUser(userName);

    console.log('Redis storage verification passed');
  } finally {
    try {
      await storage.deleteCache(`codex:verify:${userName}`);
      await (storage as any).client.del(`slot:user:${userName}`);
      await (storage as any).client.del(`codex:rate:${userName}`);
      await (storage as any).client.sendCommand(['SREM', 'slot:users', userName]);
      await (storage as any).client.sendCommand([
        'ZREM',
        'slot:rank:coins',
        userName,
      ]);
      await (storage as any).client.sendCommand([
        'ZREM',
        'slot:rank:biggestWin',
        userName,
      ]);
      await (storage as any).client.sendCommand([
        'ZREM',
        'slot:rank:totalWins',
        userName,
      ]);
      await storage.deleteUser(userName);
    } finally {
      await (storage as any).client?.quit();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
