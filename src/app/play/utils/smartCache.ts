/**
 * 智能缓存系统
 * 基于源稳定性动态调整缓存时间
 */

interface HLSLevel {
  width: number;
  height: number;
  bitrate: number;
  name?: string;
  codecSet?: string;
  frameRate?: number;
}

interface SourceTestResult {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  timestamp: number;
  success: boolean;
  
  // ✅ 新增：完整的 HLS 流信息
  levels?: HLSLevel[];
  maxResolution?: string;
  minResolution?: string;
  maxBandwidth?: number;
  minBandwidth?: number;
}

interface SourceReliability {
  sourceKey: string;
  successCount: number;
  totalCount: number;
  avgResponseTime: number;
  avgQuality: string;
  lastTestTime: number;
  stability: number; // 0-1 之间，表示稳定性
}

class SmartCache {
  private cache = new Map<string, SourceTestResult>();
  private reliability = new Map<string, SourceReliability>();
  private readonly DEFAULT_CACHE_TTL = 15 * 60 * 1000; // 15分钟
  private readonly MAX_CACHE_TTL = 60 * 60 * 1000; // 60分钟
  private readonly MIN_CACHE_TTL = 5 * 60 * 1000; // 5分钟

  // 🚀 性能优化：添加容量控制
  private readonly MAX_CACHE_SIZE = 50; // 最大缓存条目数
  private readonly MAX_RELIABILITY_SIZE = 100; // 最大可靠性数据条目数

  /**
   * 生成缓存键
   */
  private generateCacheKey(m3u8Url: string): string {
    // 提取域名作为源的标识，减少同一源不同视频的重复测试
    try {
      const url = new URL(m3u8Url);
      return url.hostname;
    } catch {
      // 如果URL解析失败，使用完整的URL作为键
      return m3u8Url;
    }
  }

  /**
   * 计算源稳定性评分
   */
  private calculateStability(reliability: SourceReliability): number {
    const successRate = reliability.totalCount > 0
      ? reliability.successCount / reliability.totalCount
      : 0;

    // 基于成功率和测试次数计算稳定性
    const testConfidence = Math.min(reliability.totalCount / 10, 1); // 10次测试后达到最大信心度
    return successRate * testConfidence;
  }

  /**
   * 获取智能缓存时间
   */
  private getCacheTTL(reliability: SourceReliability | undefined): number {
    if (!reliability) {
      return this.DEFAULT_CACHE_TTL;
    }

    const stability = this.calculateStability(reliability);
    const successRate = reliability.totalCount > 0
      ? reliability.successCount / reliability.totalCount
      : 0;

    // 高稳定性源使用更长的缓存时间
    let ttl = this.DEFAULT_CACHE_TTL;

    if (stability > 0.9 && successRate > 0.95) {
      // 非常稳定的源，缓存1小时
      ttl = this.MAX_CACHE_TTL;
    } else if (stability > 0.8 && successRate > 0.85) {
      // 稳定的源，缓存30分钟
      ttl = 30 * 60 * 1000;
    } else if (stability > 0.6 && successRate > 0.7) {
      // 一般稳定的源，使用默认缓存时间
      ttl = this.DEFAULT_CACHE_TTL;
    } else if (stability > 0.4 && successRate > 0.5) {
      // 不太稳定的源，缓存10分钟
      ttl = 10 * 60 * 1000;
    } else {
      // 非常不稳定的源，缓存5分钟
      ttl = this.MIN_CACHE_TTL;
    }

    // 考虑响应时间因素 - 快速响应的源可以缓存更久
    if (reliability.avgResponseTime < 200) {
      ttl *= 1.2; // 增加20%缓存时间
    } else if (reliability.avgResponseTime > 1000) {
      ttl *= 0.8; // 减少20%缓存时间
    }

    return Math.max(this.MIN_CACHE_TTL, Math.min(this.MAX_CACHE_TTL, ttl));
  }

  /**
   * 获取缓存结果
   */
  get(m3u8Url: string): SourceTestResult | null {
    const cacheKey = this.generateCacheKey(m3u8Url);
    const cached = this.cache.get(cacheKey);
    const reliability = this.reliability.get(cacheKey);

    if (!cached || !reliability) {
      return null;
    }

    const ttl = this.getCacheTTL(reliability);
    const now = Date.now();

    if (now - cached.timestamp < ttl) {
      console.log(`✓ 智能缓存命中: ${cacheKey} (TTL: ${Math.round(ttl / 1000 / 60)}分钟)`);
      return cached;
    }

    // 缓存过期，删除
    this.cache.delete(cacheKey);
    return null;
  }

  /**
   * 清理最旧的缓存条目
   */
  private cleanupOldestEntries(): void {
    // 清理缓存
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKeys = Array.from(this.cache.keys())
        .sort((a, b) => {
          const timeA = this.cache.get(a)?.timestamp || 0;
          const timeB = this.cache.get(b)?.timestamp || 0;
          return timeA - timeB;
        })
        .slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.3)); // 清理30%最旧的条目

      oldestKeys.forEach(key => {
        this.cache.delete(key);
      });

      console.log(`🧹 智能缓存清理: 删除了 ${oldestKeys.length} 个最旧的缓存条目`);
    }

    // 清理可靠性数据
    if (this.reliability.size >= this.MAX_RELIABILITY_SIZE) {
      const oldestReliabilityKeys = Array.from(this.reliability.keys())
        .sort((a, b) => {
          const timeA = this.reliability.get(a)?.lastTestTime || 0;
          const timeB = this.reliability.get(b)?.lastTestTime || 0;
          return timeA - timeB;
        })
        .slice(0, Math.floor(this.MAX_RELIABILITY_SIZE * 0.3)); // 清理30%最旧的条目

      oldestReliabilityKeys.forEach(key => {
        this.reliability.delete(key);
      });

      console.log(`🧹 智能缓存清理: 删除了 ${oldestReliabilityKeys.length} 个最旧的可靠性条目`);
    }
  }

  /**
   * 设置缓存结果
   */
  set(m3u8Url: string, result: Omit<SourceTestResult, 'timestamp'>): void {
    const cacheKey = this.generateCacheKey(m3u8Url);
    const now = Date.now();

    // 🚀 性能优化：检查缓存大小限制
    this.cleanupOldestEntries();

    // 更新缓存
    this.cache.set(cacheKey, {
      ...result,
      timestamp: now,
    });

    // 更新可靠性统计
    const reliability = this.reliability.get(cacheKey) || {
      sourceKey: cacheKey,
      successCount: 0,
      totalCount: 0,
      avgResponseTime: 0,
      avgQuality: '未知',
      lastTestTime: 0,
      stability: 0,
    };

    // 更新统计数据
    reliability.totalCount++;
    if (result.success) {
      reliability.successCount++;
    }

    // 更新平均响应时间
    reliability.avgResponseTime =
      (reliability.avgResponseTime * (reliability.totalCount - 1) + result.pingTime) / reliability.totalCount;

    // 更新平均质量（简单的质量等级映射）
    const qualityScore = this.getQualityScore(result.quality);
    const currentQualityScore = this.getQualityScore(reliability.avgQuality);
    reliability.avgQuality = this.getQualityFromScore(
      (currentQualityScore * (reliability.totalCount - 1) + qualityScore) / reliability.totalCount
    );

    reliability.lastTestTime = now;
    reliability.stability = this.calculateStability(reliability);

    this.reliability.set(cacheKey, reliability);

    const ttl = this.getCacheTTL(reliability);
    console.log(`✓ 智能缓存更新: ${cacheKey} (稳定性: ${(reliability.stability * 100).toFixed(1)}%, TTL: ${Math.round(ttl / 1000 / 60)}分钟)`);
  }

  /**
   * 获取质量评分
   */
  private getQualityScore(quality: string): number {
    switch (quality) {
      case '4K': return 100;
      case '2K': return 85;
      case '1080p': return 75;
      case '720p': return 60;
      case '480p': return 40;
      case 'SD': return 20;
      default: return 0;
    }
  }

  /**
   * 从评分获取质量等级
   */
  private getQualityFromScore(score: number): string {
    if (score >= 95) return '4K';
    if (score >= 80) return '2K';
    if (score >= 70) return '1080p';
    if (score >= 55) return '720p';
    if (score >= 35) return '480p';
    if (score >= 15) return 'SD';
    return '未知';
  }

  /**
   * 获取源可靠性统计
   */
  getReliability(m3u8Url: string): SourceReliability | undefined {
    const cacheKey = this.generateCacheKey(m3u8Url);
    return this.reliability.get(cacheKey);
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    this.cache.forEach((cached, key) => {
      const reliability = this.reliability.get(key);
      if (!reliability) return;

      const ttl = this.getCacheTTL(reliability);
      if (now - cached.timestamp >= ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      console.log(`✓ 智能缓存清理: 删除了 ${cleanedCount} 个过期条目`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    cacheSize: number;
    reliabilitySize: number;
    avgStability: number;
    totalTests: number;
    avgSuccessRate: number;
  } {
    const stabilities = Array.from(this.reliability.values()).map(r => r.stability);
    const successRates = Array.from(this.reliability.values()).map(r =>
      r.totalCount > 0 ? r.successCount / r.totalCount : 0
    );

    return {
      cacheSize: this.cache.size,
      reliabilitySize: this.reliability.size,
      avgStability: stabilities.length > 0
        ? stabilities.reduce((sum, s) => sum + s, 0) / stabilities.length
        : 0,
      totalTests: Array.from(this.reliability.values()).reduce((sum, r) => sum + r.totalCount, 0),
      avgSuccessRate: successRates.length > 0
        ? successRates.reduce((sum, r) => sum + r, 0) / successRates.length
        : 0,
    };
  }

  /**
   * 导出可靠性数据
   */
  exportReliabilityData(): Record<string, SourceReliability> {
    const data: Record<string, SourceReliability> = {};
    this.reliability.forEach((reliability, key) => {
      data[key] = { ...reliability };
    });
    return data;
  }

  /**
   * 导入可靠性数据
   */
  importReliabilityData(data: Record<string, SourceReliability>): void {
    for (const [key, reliability] of Object.entries(data)) {
      this.reliability.set(key, { ...reliability });
    }
    console.log(`✓ 导入了 ${Object.keys(data).length} 个源的可靠性数据`);
  }
}

// 全局智能缓存实例
const smartCache = new SmartCache();

// 定期清理过期缓存
setInterval(() => {
  smartCache.cleanup();
}, 5 * 60 * 1000); // 每5分钟清理一次

export { SmartCache,smartCache };
export type { HLSLevel, SourceReliability,SourceTestResult };