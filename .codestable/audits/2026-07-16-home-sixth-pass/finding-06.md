---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'performance-06'
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 06：共享收藏请求仍为每张卡重复执行完成副作用

## 速答

底层 Promise 虽按 key 去重，但每个 isFavorited 调用者都会在同一 Promise 上追加自己的全量比较、缓存写入和 favoritesUpdated 广播。

## 关键证据

- src/components/VideoCard.tsx:229-265 — 每张 source-backed 卡都会独立调用 isFavorited。
- src/lib/db.client.ts:130-145 — getOrCreateRequest 只共享网络 Promise。
- src/lib/db.client.ts:1640-1661 — 每个调用者都在共享 Promise 后独立执行 JSON.stringify、cacheFavorites 和事件广播。

## 影响

首页多张卡同时挂载时，网络 GET 只有一次，但会积累 N 份完成回调；数据变化时形成 N 次全量比较/写缓存/广播，并再次唤醒所有卡片订阅者。

## 修复方向

把“请求 + 比较 + 缓存 + 广播”整体收口为一个共享同步任务，isFavorited 只读取该任务最终缓存。

## 建议动作

cs-refactor，因为网络行为不变，目标是消除重复副作用和多卡放大。
