/* eslint-disable no-console */

'use client';

import { Activity, Calendar, Filter,Globe, Search, User } from 'lucide-react';
import { useEffect,useState } from 'react';

import { AccessLog } from '@/lib/access-log';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

interface AccessLogViewerProps {
  className?: string;
}

export default function AccessLogViewer({ className = '' }: AccessLogViewerProps) {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    hasMore: true
  });

  // 过滤器状态
  const [filters, setFilters] = useState({
    username: '',
    action: '',
    startDate: '',
    endDate: '',
    ipAddress: ''
  });

  // 可用的操作类型
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  const authInfo = getAuthInfoFromBrowserCookie();
  const isAdmin = authInfo?.role === 'admin' || authInfo?.role === 'owner';

  // 格式化时间戳
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 格式化IP地址
  const formatIPAddress = (ip?: string) => {
    if (!ip) return '-';
    if (ip.length > 15) {
      return ip.substring(0, 15) + '...';
    }
    return ip;
  };

  // 获取访问日志
  const fetchAccessLogs = async (reset = false) => {
    if (!isAdmin) {
      setError('无权限查看访问日志');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (reset) {
        params.set('limit', pagination.limit.toString());
        params.set('offset', '0');
      } else {
        params.set('limit', pagination.limit.toString());
        params.set('offset', pagination.offset.toString());
      }

      if (filters.username) params.set('username', filters.username);
      if (filters.action) params.set('action', filters.action);
      if (filters.startDate) {
        params.set('startTime', new Date(filters.startDate).getTime().toString());
      }
      if (filters.endDate) {
        params.set('endTime', new Date(filters.endDate + ' 23:59:59').getTime().toString());
      }

      const response = await fetch(`/api/access-log?${params.toString()}`, {
        credentials: 'include' // 包含认证凭据
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const newLogs = data.accessLogs || [];

      if (reset) {
        setLogs(newLogs);
        setPagination(prev => ({ ...prev, offset: 0, hasMore: newLogs.length === prev.limit }));
      } else {
        setLogs(prev => [...prev, ...newLogs]);
        setPagination(prev => ({
          ...prev,
          offset: prev.offset + prev.limit,
          hasMore: newLogs.length === prev.limit
        }));
      }

      // 提取可用的操作类型
      const actions = Array.from(new Set(newLogs.map((log: AccessLog) => log.action))).sort();
      setAvailableActions(prev => Array.from(new Set([...prev, ...actions] as string[])).sort());

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取访问日志失败';
      setError(errorMessage);
      console.error('获取访问日志失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 加载更多日志
  const loadMore = () => {
    if (!loading && pagination.hasMore) {
      fetchAccessLogs(false);
    }
  };

  // 应用过滤器
  const applyFilters = () => {
    fetchAccessLogs(true);
  };

  // 清除过滤器
  const clearFilters = () => {
    setFilters({
      username: '',
      action: '',
      startDate: '',
      endDate: '',
      ipAddress: ''
    });
    setTimeout(() => fetchAccessLogs(true), 0);
  };

  // 初始加载
  useEffect(() => {
    if (isAdmin) {
      fetchAccessLogs(true);
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className={`p-6 text-center text-gray-500 ${className}`}>
        <User className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>无权限查看访问日志</p>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Activity className="w-6 h-6" />
          访问日志
        </h2>

        {/* 过滤器 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4" />
            <span className="font-medium">过滤器</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">用户名</label>
              <input
                type="text"
                value={filters.username}
                onChange={(e) => setFilters(prev => ({ ...prev, username: e.target.value }))}
                placeholder="输入用户名"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">操作类型</label>
              <select
                value={filters.action}
                onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">全部操作</option>
                {availableActions.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">开始日期</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">结束日期</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                onClick={applyFilters}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 text-sm"
              >
                <Search className="w-4 h-4 mr-1" />
                搜索
              </button>
              <button
                onClick={clearFilters}
                disabled={loading}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 text-sm"
              >
                清除
              </button>
            </div>
          </div>
        </div>

        {/* 日志列表 */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        {loading && logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-8 h-8 mx-auto mb-2 animate-pulse" />
            <p>加载访问日志中...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-8 h-8 mx-auto mb-2" />
            <p>暂无访问日志</p>
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left">时间</th>
                      <th className="px-4 py-3 text-left">用户</th>
                      <th className="px-4 py-3 text-left">操作</th>
                      <th className="px-4 py-3 text-left">IP地址</th>
                      <th className="px-4 py-3 text-left">页面URL</th>
                      <th className="px-4 py-3 text-left">用户代理</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {logs.map((log, index) => (
                      <tr key={`${log.timestamp}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3 text-gray-400" />
                            {log.username || '匿名'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-md text-xs">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3 text-gray-400" />
                            {formatIPAddress(log.ipAddress)}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate" title={log.pageUrl}>
                          {log.pageUrl}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate" title={log.userAgent}>
                          {log.userAgent}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 加载更多 */}
            {pagination.hasMore && (
              <div className="text-center mt-6">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}

            <div className="mt-4 text-center text-sm text-gray-500">
              已显示 {logs.length} 条记录
            </div>
          </>
        )}
      </div>
    </div>
  );
}