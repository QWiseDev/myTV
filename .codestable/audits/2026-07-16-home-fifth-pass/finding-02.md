---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'bug-02'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 02：收藏清空缺少原子与用户级串行边界

## 速答

收藏清空先读取快照，再并发逐条删除；同一用户的新增、单删和清空没有统一队列，部分失败或并发 POST 都会让“清空成功”与真实持久态分叉。

## 关键证据

- `src/app/api/favorites/route.ts:111-121` — POST 直接保存收藏，没有同用户 mutation 门禁。
- `src/app/api/favorites/route.ts:156-176` — 单删直接执行；清空则 `getAllFavorites()` 后对快照执行 `Promise.all(deleteFavorite)`。
- `src/app/api/playrecords/route.ts:156,191-216` 与 `src/lib/play-record-mutations.ts:8-55` — 相邻播放记录 route 的保存、单删和清空已进入同用户串行边界，收藏没有等价顺序保证。

## 影响

任一 HDEL 失败时，已经成功删除的条目不会回滚，其余 Promise 还可能继续执行；快照读取后并发新增的收藏不在删除集合中，DELETE 仍返回 200，客户端显示空但刷新后条目重新出现。迟到的清空也可能删除刚刚返回 200 的 POST。

## 修复方向

为收藏写操作增加同用户串行边界，并把“清空全部”下沉为存储层单操作或具备明确失败语义的批量操作；补 POST/DELETE 交叠与部分失败回归。

## 建议动作

`cs-issue`，因为当前 API 会对外返回与最终持久态不一致的成功结果。
