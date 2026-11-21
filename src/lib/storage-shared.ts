/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * redis-base.db 与 upstash.db 两个存储适配器共享的纯函数工具。
 * 只放无状态的数据整形与键名生成逻辑，不包含任何客户端连接细节。
 */

export function ensureString(value: any): string {
  return String(value);
}

export function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

export interface LoginStats {
  loginCount: number;
  firstLoginTime: number;
  lastLoginTime: number;
  lastLoginDate: number;
}

export function normalizeLoginStats(
  raw?: Partial<LoginStats> | null,
): LoginStats {
  return {
    loginCount: Number(raw?.loginCount || 0),
    firstLoginTime: Number(raw?.firstLoginTime || 0),
    lastLoginTime: Number(raw?.lastLoginTime || 0),
    lastLoginDate: Number(raw?.lastLoginDate || raw?.lastLoginTime || 0),
  };
}

/**
 * hash 字段值统一以 JSON 字符串编码。
 * 解码时兼容 upstash REST 客户端返回已解析非字符串值的情况。
 */
export function encodeHashValue(value: any): string {
  return JSON.stringify(value);
}

export function decodeHashValue(value: unknown): any {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function encodeHashObject(
  data: Record<string, any>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeHashValue(value)]),
  );
}

export function decodeHashObject(
  data: Record<string, unknown>,
): Record<string, any> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, decodeHashValue(value)]),
  );
}

/**
 * 兼容 ZADD/ZRANGE 返回的三种形态：
 * [member, score] 元组数组 / { member | value } 对象数组 / 扁平 member,score 交替数组
 */
export function parseRankMembers(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  if (raw.length > 0 && Array.isArray(raw[0])) {
    return raw.map((item) => String(item[0]));
  }

  if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
    return (raw as any[])
      .map((item) => item.member ?? item.value ?? item[0])
      .filter((member) => member !== undefined)
      .map(String);
  }

  const members: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    members.push(String(raw[i]));
  }
  return members;
}

// —— 老虎机排行键名与计分 ——
export type SlotUserData = Record<string, any>;

export const SLOT_RANK_TYPES = ['coins', 'biggestWin', 'totalWins'];

export function getSlotRankScore(data: SlotUserData, type: string): number {
  return Number(data[type] || 0);
}

export function slotUserKey(userName: string) {
  return `slot:user:${userName}`;
}

export function slotUsersKey() {
  return 'slot:users';
}

export function slotRankKey(type: string) {
  return `slot:rank:${type}`;
}

export const SEARCH_HISTORY_LIMIT = 20;
