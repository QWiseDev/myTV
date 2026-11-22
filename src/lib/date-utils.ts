/**
 * 日期工具函数
 */

/** 将时间戳或 Date 转换为 YYYY-MM-DD 字符串 */
export function toDateKey(timestamp: number | Date = Date.now()): string {
  return new Date(timestamp).toISOString().split('T')[0];
}
