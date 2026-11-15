'use client';

import { getCurrentPlayRecordsUsername } from './store';
import type { PlayRecord } from '../../types';

/**
 * playRecordsUpdated 事件契约保持兼容：
 * - 事件名不变；
 * - detail 为完整快照 Record<key, PlayRecord>；
 * - 派发前校验当前登录用户，防止把旧用户数据派发给新用户消费者。
 */

export function dispatchPlayRecordsUpdated(
  data: Record<string, PlayRecord>,
  username: string | null,
): void {
  if (typeof window === 'undefined') return;
  if (getCurrentPlayRecordsUsername() !== username) return;

  window.dispatchEvent(
    new CustomEvent('playRecordsUpdated', {
      detail: data,
    }),
  );
}
