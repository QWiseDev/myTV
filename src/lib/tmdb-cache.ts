import { createPrefixedCache } from './prefixed-cache';

// TMDB数据缓存配置（秒）
export const TMDB_CACHE_EXPIRE = {
  actor_search: 6 * 60 * 60, // 演员搜索6小时（较稳定）
  person_details: 24 * 60 * 60, // 人物详情24小时（基本不变）
  movie_credits: 12 * 60 * 60, // 演员电影作品12小时（较稳定）
  tv_credits: 12 * 60 * 60, // 演员电视剧作品12小时（较稳定）
  movie_details: 24 * 60 * 60, // 电影详情24小时（基本不变）
  tv_details: 24 * 60 * 60, // 电视剧详情24小时（基本不变）
  backdrop_search: 24 * 60 * 60, // 首页横图搜索24小时（backdrop 基本不变）
  trending: 2 * 60 * 60, // 热门内容2小时（更新频繁）
  discover: 4 * 60 * 60, // 发现内容4小时
};

// 与豆瓣客户端共用同一套双写缓存实现，仅命名空间不同
const { getCacheKey, getCache, setCache, cleanExpiredCache } =
  createPrefixedCache('tmdb', 'TMDB');

// 初始化缓存系统
async function initTMDBCache(): Promise<void> {
  // 立即清理一次过期缓存
  await cleanExpiredCache();

  // 每10分钟清理一次过期缓存
  setInterval(() => cleanExpiredCache(), 10 * 60 * 1000);
}

// 在模块加载时初始化缓存系统
if (typeof window !== 'undefined') {
  initTMDBCache().catch(console.error);
}

export { cleanExpiredCache, getCache, getCacheKey, setCache };
