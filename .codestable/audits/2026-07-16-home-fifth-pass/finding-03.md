---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'bug-03'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 03：播放记录乐观状态可被分页响应和旧回滚覆盖

## 速答

`usePlayRecordActions` 先独立修改 React state，持久化成功后才通知 `usePlaybackRecords` 建立 tombstone/generation；这个窗口内分页响应可以回填记录，失败回滚又可能覆盖期间到达的新状态。

## 关键证据

- `src/hooks/usePlayRecordActions.ts:29-63` — 单删先从 state 移除，DELETE 成功后才调用 `markPlayRecordDeleted()`，失败则用捕获的旧记录回填。
- `src/hooks/usePlayRecordActions.ts:70-83` — 清空先保存旧全集并置空，成功后才调用 `markAllPlayRecordsDeleted()`，失败直接用旧全集覆盖当前 state。
- `src/hooks/usePlaybackRecords.ts:119-149` — 在上述持久化等待期，当前 priority/append 响应仍可通过门禁并 merge 到 state、推进 cursor。
- `src/hooks/usePlaybackRecords.ts:231-258` — 真正的 tombstone 和请求 generation 只在 action 成功后才建立。

## 影响

在途分页可让刚删除/清空的卡片短暂回填；清空失败前若已有新页或 priority 数据到达，旧全集回滚会丢掉这些新状态而 cursor 已前移。另一个稳定竞态是“单删在途 → 清空成功 → 单删失败”，旧单删 rollback 可把已清空记录复活。

## 修复方向

把乐观 mutation、请求失效和 rollback revision 收敛到一个状态所有者；至少在请求发出前建立可撤销门禁，并让失败恢复基于 mutation generation 合并，而不是覆盖全集。

## 建议动作

`cs-issue`，因为多 owner 的时序已经产生可复现的数据正确性问题。
