interface SecurityConfig {
  enableAuth: boolean;
  token: string;
  enableIpWhitelist: boolean;
  allowedIPs: string[];
  enableRateLimit: boolean;
  rateLimit: number;
}

interface Source {
  key: string;
  name: string;
}

interface DiagnosisResult {
  spider?: string;
  spiderPrivate?: boolean;
  spiderReachable?: boolean;
  spiderStatus?: number;
  spiderSizeKB?: number;
  spiderLastModified?: string;
  contentLength?: string;
  lastModified?: string;
  spider_url?: string;
  spider_md5?: string;
  spider_cached?: boolean;
  spider_real_size?: number;
  spider_tried?: number;
  spider_success?: boolean;
  spider_backup?: string;
  spider_candidates?: string[];
  status?: number;
  contentType?: string;
  hasJson?: boolean;
  receivedToken?: string;
  size?: number;
  sitesCount?: number;
  livesCount?: number;
  parsesCount?: number;
  privateApis?: number;
  configUrl?: string;
  issues?: string[];
  pass?: boolean;
  error?: string;
}

// 智能健康检查结果
interface SmartHealthResult {
  success: boolean;
  timestamp: number;
  executionTime: number;
  network: {
    environment: 'domestic' | 'international';
    region: string;
    detectionMethod: string;
    optimized: boolean;
  };
  spider: {
    current: {
      success: boolean;
      source: string;
      size: number;
      md5: string;
      cached: boolean;
      tried_sources: number;
    };
    cached: {
      md5: string;
      source: string;
      success: boolean;
      cached: boolean;
      timestamp: number;
      size: number;
      tried: number;
    } | null;
  };
  reachability: {
    total_tested: number;
    successful: number;
    health_score: number;
    tests: Array<{
      url: string;
      success: boolean;
      responseTime: number;
      statusCode?: number;
      error?: string;
      size?: number;
    }>;
  };
  recommendations: string[];
  status: {
    overall: 'excellent' | 'good' | 'needs_attention';
    spider_available: boolean;
    network_stable: boolean;
    recommendations_count: number;
  };
  error?: string;
}

// JAR源深度诊断结果（与 /api/tvbox/jar-diagnostic 返回结构对齐）
interface DeepDiagnosticResult {
  timestamp: string;
  environment: {
    userAgent: string;
    ip?: string;
    timezone: string;
    isDomestic: boolean;
    recommendedSources: string[];
  };
  jarTests: Array<{
    url: string;
    name: string;
    status: 'success' | 'failed' | 'timeout' | 'invalid';
    responseTime: number;
    fileSize?: number;
    httpStatus?: number;
    error?: string;
    headers?: Record<string, string>;
    isValidJar?: boolean;
    md5?: string;
  }>;
  summary: {
    totalTested: number;
    successCount: number;
    failedCount: number;
    averageResponseTime: number;
    fastestSource?: string;
    recommendedSource?: string;
  };
  recommendations: string[];
  error?: string;
}

// JAR源修复结果
interface JarFixResult {
  success: boolean;
  timestamp: number;
  executionTime: number;
  summary: {
    total_tested: number;
    successful: number;
    failed: number;
    user_region: 'domestic' | 'international';
    avg_response_time: number;
  };
  test_results: Array<{
    url: string;
    name: string;
    success: boolean;
    responseTime: number;
    size?: number;
    error?: string;
    statusCode?: number;
  }>;
  recommended_sources: Array<{
    url: string;
    name: string;
    success: boolean;
    responseTime: number;
    size?: number;
  }>;
  recommendations: {
    immediate: string[];
    configuration: string[];
    troubleshooting: string[];
  };
  fixed_config_urls: string[];
  status: {
    jar_available: boolean;
    network_quality: 'good' | 'fair' | 'poor';
    needs_troubleshooting: boolean;
  };
  error?: string;
  emergency_recommendations?: string[];
}

export type {
  DeepDiagnosticResult,
  DiagnosisResult,
  JarFixResult,
  SecurityConfig,
  SmartHealthResult,
  Source,
};
