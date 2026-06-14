/**
 * 错误类型定义和处理工具
 */

export enum PlayErrorCode {
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',

  // 播放源错误
  SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND',
  SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE',
  SOURCE_PARSE_ERROR = 'SOURCE_PARSE_ERROR',

  // 播放器错误
  PLAYER_INIT_ERROR = 'PLAYER_INIT_ERROR',
  PLAYER_LOAD_ERROR = 'PLAYER_LOAD_ERROR',
  PLAYER_DECODE_ERROR = 'PLAYER_DECODE_ERROR',

  // 弹幕错误
  DANMAKU_LOAD_ERROR = 'DANMAKU_LOAD_ERROR',
  DANMAKU_SEND_ERROR = 'DANMAKU_SEND_ERROR',

  // 数据库错误
  DB_READ_ERROR = 'DB_READ_ERROR',
  DB_WRITE_ERROR = 'DB_WRITE_ERROR',

  // 未知错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class PlayError extends Error {
  constructor(
    public code: PlayErrorCode,
    message: string,
    public details?: unknown,
    public recoverable: boolean = true,
  ) {
    super(message);
    this.name = 'PlayError';
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    switch (this.code) {
      case PlayErrorCode.NETWORK_ERROR:
        return '网络连接失败，请检查您的网络设置';
      case PlayErrorCode.NETWORK_TIMEOUT:
        return '网络请求超时，请稍后重试';
      case PlayErrorCode.SOURCE_NOT_FOUND:
        return '未找到播放源，请尝试其他来源';
      case PlayErrorCode.SOURCE_UNAVAILABLE:
        return '当前播放源不可用，正在切换到备用源...';
      case PlayErrorCode.SOURCE_PARSE_ERROR:
        return '播放源解析失败，请尝试其他来源';
      case PlayErrorCode.PLAYER_INIT_ERROR:
        return '播放器初始化失败，请刷新页面重试';
      case PlayErrorCode.PLAYER_LOAD_ERROR:
        return '视频加载失败，请刷新页面重试';
      case PlayErrorCode.PLAYER_DECODE_ERROR:
        return '视频解码失败，可能不支持当前格式';
      case PlayErrorCode.DANMAKU_LOAD_ERROR:
        return '弹幕加载失败，不影响视频播放';
      case PlayErrorCode.DANMAKU_SEND_ERROR:
        return '弹幕发送失败，请稍后重试';
      case PlayErrorCode.DB_READ_ERROR:
        return '读取本地数据失败';
      case PlayErrorCode.DB_WRITE_ERROR:
        return '保存数据失败';
      default:
        return '发生未知错误，请稍后重试';
    }
  }

  /**
   * 判断是否需要上报到监控系统
   */
  shouldReport(): boolean {
    // 弹幕错误不上报，其他错误都上报
    return (
      this.code !== PlayErrorCode.DANMAKU_LOAD_ERROR &&
      this.code !== PlayErrorCode.DANMAKU_SEND_ERROR
    );
  }

  /**
   * 获取错误严重级别
   */
  getSeverity(): 'low' | 'medium' | 'high' | 'critical' {
    switch (this.code) {
      case PlayErrorCode.DANMAKU_LOAD_ERROR:
      case PlayErrorCode.DANMAKU_SEND_ERROR:
        return 'low';

      case PlayErrorCode.DB_READ_ERROR:
      case PlayErrorCode.DB_WRITE_ERROR:
        return 'medium';

      case PlayErrorCode.SOURCE_NOT_FOUND:
      case PlayErrorCode.SOURCE_UNAVAILABLE:
      case PlayErrorCode.NETWORK_ERROR:
        return 'high';

      case PlayErrorCode.PLAYER_INIT_ERROR:
      case PlayErrorCode.PLAYER_LOAD_ERROR:
        return 'critical';

      default:
        return 'medium';
    }
  }
}

/**
 * 错误上报函数（可扩展）
 */
export function reportError(error: PlayError): void {
  // 生产环境暂未接入远端监控，保留函数边界供调用方统一上报。
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  // 开发环境输出详细错误信息
  if (process.env.NODE_ENV === 'development') {
    console.group(`[${error.getSeverity().toUpperCase()}] ${error.code}`);
    console.error('Message:', error.message);
    console.error('User Message:', error.getUserMessage());
    console.error('Details:', error.details);
    console.error('Stack:', error.stack);
    console.groupEnd();
  }
}
