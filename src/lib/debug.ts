/**
 * 调试工具
 * 在生产环境中自动禁用所有调试日志输出
 */

const isDevelopment =
  typeof window !== 'undefined'
    ? process.env.NODE_ENV === 'development'
    : process.env.NODE_ENV === 'development';

export const debug = {
  /**
   * 普通日志
   */
  log: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(message, data ?? '');
    }
  },

  /**
   * 警告日志
   */
  warn: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.warn(message, data ?? '');
    }
  },

  /**
   * 错误日志（始终输出）
   */
  error: (message: string, data?: unknown) => {
    console.error(message, data ?? '');
  },

  /**
   * 信息日志
   */
  info: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.info(message, data ?? '');
    }
  },

  /**
   * 分组日志（开发环境可折叠显示）
   */
  group: (label: string) => {
    if (isDevelopment) {
      console.group(label);
    }
  },

  /**
   * 结束分组
   */
  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd();
    }
  },

  /**
   * 带时间的日志
   */
  time: (label: string) => {
    if (isDevelopment) {
      console.time(label);
    }
  },

  /**
   * 结束时间测量
   */
  timeEnd: (label: string) => {
    if (isDevelopment) {
      console.timeEnd(label);
    }
  },
};
