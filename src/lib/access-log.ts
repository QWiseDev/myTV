/* eslint-disable no-console */

import { useEffect } from 'react';

import { getAuthInfoFromBrowserCookie } from './auth';

/**
 * 访问日志类型定义
 */
export interface AccessLog {
  userId?: string;          // 用户ID（如果有登录）
  username?: string;        // 用户名（如果有登录）
  action: string;           // 访问的菜单或执行的action
  pageUrl: string;          // 当前页面URL
  timestamp: number;        // 访问时间戳
  ipAddress?: string;       // IP地址（从后端获取）
  userAgent?: string;       // 用户代理
  referrer?: string;        // 来源页面
  location?: GeolocationAccessLog; // 地理位置
}

export interface GeolocationAccessLog {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * 通用访问日志服务
 * 用于记录用户访问菜单、页面等行为
 */
export class AccessLogService {
  private static instance: AccessLogService | null = null;
  private baseUrl: string;
  private isEnabled: boolean;
  private lastLogTime: Map<string, number>; // 用于防止重复调用

  constructor() {
    this.baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    this.isEnabled = this.checkEnabled();
    this.lastLogTime = new Map();
  }

  /**
   * 获取日志服务的单例实例
   */
  public static getInstance(): AccessLogService {
    if (!this.instance) {
      this.instance = new AccessLogService();
    }
    return this.instance;
  }

  /**
   * 检查是否启用日志记录
   */
  private checkEnabled(): boolean {
    // 默认禁用访问日志记录
    return false;
  }

  /**
   * 记录菜单/页面访问
   * @param action 访问的菜单或动作，如 'home', 'search', 'play'
   * @param extraData 额外的数据
   */
  public async logAccess(action: string, extraData?: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const now = Date.now();
      const key = `action:${action}|url:${typeof window !== 'undefined' ? window.location.href : ''}`;

      // 🚀 防重复调用机制：在5秒内同一action+URL组合只记录一次
      const lastTime = this.lastLogTime.get(key);
      if (lastTime && now - lastTime < 5000) {
        console.debug(`[AccessLog] 跳过重复访问记录: ${action} (${Math.round((now - lastTime) / 1000)}秒前)`);
        return;
      }

      // 更新最后记录时间
      this.lastLogTime.set(key, now);

      // 清理过期的Map条目，防止内存泄漏（保留30秒的缓存）
      const expirationTime = 30000;
      for (const mapKey of Array.from(this.lastLogTime.keys())) {
        const timestamp = this.lastLogTime.get(mapKey);
        if (timestamp && now - timestamp > expirationTime) {
          this.lastLogTime.delete(mapKey);
        }
      }

      const authInfo = getAuthInfoFromBrowserCookie();
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const referrer = typeof document !== 'undefined' ? document.referrer : '';

      const accessLog: AccessLog = {
        action,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        timestamp: Date.now(),
        userAgent,
        referrer,
        userId: authInfo?.username,  // 如果后端需要单独的用户ID可以扩展
        username: authInfo?.username,
        ...extraData
      };


      // 异步发送到后端，不阻塞主流程
      this.sendLogToServer(accessLog).catch((error) => {
        console.warn('[AccessLog] 发送日志到服务器失败:', error);
      });

      // 同时更新本地存储以支持快速统计分析
      this.updateLocalStorage(accessLog);

    } catch (error) {
      console.error('[AccessLog] 记录访问日志失败:', error);
    }
  }

  
  /**
   * 获取地理位置信息（可选）
   */
  private async getLocation(): Promise<GeolocationAccessLog> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({});
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            city: '', // 需要额外服务来解析城市名
            region: '',
            country: ''
          });
        },
        (error) => {
          console.warn('[AccessLog] 获取地理位置失败:', error);
          resolve({});
        },
        { timeout: 5000 }
      );
    });
  }

  /**
   * 异步发送日志到服务器
   */
  private async sendLogToServer(accessLog: AccessLog): Promise<void> {
    try {
      const response = await fetch('/api/access-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(accessLog),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.debug(`[AccessLog] 日志发送到服务器成功: ${accessLog.action}`);
    } catch (error) {
      console.error('[AccessLog] 发送日志失败:', error);
      // FIXME: 可以做日志队列重试机制
    }
  }

  /**
   * 更新本地存储用于快速统计
   */
  private updateLocalStorage(accessLog: AccessLog): void {
    try {
      if (typeof window === 'undefined') return;

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const historyKey = `access_log_history_${today}`;
      const maxHistory = 50; // 最多保留50条今日记录

      let history: AccessLog[] = [];
      try {
        const stored = localStorage.getItem(historyKey);
        history = stored ? JSON.parse(stored) : [];
      } catch (e) {
        console.warn('[AccessLog] 读取本地历史失败:', e);
      }

      // 添加新记录并限制数量
      history.unshift(accessLog);
      if (history.length > maxHistory) {
        history = history.slice(0, maxHistory);
      }

      localStorage.setItem(historyKey, JSON.stringify(history));
      console.debug(`[AccessLog] 本地访问历史已更新 (${history.length}/${maxHistory})`);

    } catch (error) {
      console.error('[AccessLog] 更新本地存储失败:', error);
    }
  }

  /**
   * 批量发送积压的日志（用于需要大量日志记录的场景）
   */
  public async batchSendLogsToServer(logs: AccessLog[]): Promise<void> {
    if (!this.isEnabled || logs.length === 0) {
      return;
    }

    try {
      const response = await fetch('/api/access-log/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs }),
      });

      if (!response.ok) {
        throw new Error(`批量发送失败: HTTP ${response.status}`);
      }

    } catch (error) {
      console.error('[AccessLog] 批量发送日志失败:', error);
    }
  }
}

/**
 * 快速记录访问日志的便捷函数
 */
export function logAccess(action: string, extraData?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return; // 服务端运行时不记录

  AccessLogService.getInstance()
    .logAccess(action, extraData)
    .catch((error) => {
      console.warn(`[AccessLog] 快捷记录失败(${action}):`, error);
    });
}

/**
 * React Hook: 记录页面/组件加载和访问
 * @param action 动作名称（如组件名）
 * @param extraData 额外数据
 */
export function useAccessLog(
  action: string,
  extraData?: Record<string, unknown>
): void {
  useEffect(() => {
    logAccess(action, {
      ...extraData,
      loadTime: Date.now(),
    });
  }, []); // 只在组件挂载时记录一次
}