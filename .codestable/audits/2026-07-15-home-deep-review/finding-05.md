---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: bug-05
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 05：收藏更新在补全记录时会被丢弃

## 速答

收藏列表正在读取播放记录做补全时，新到达的收藏事件会被直接 return，旧闭包随后仍可能覆盖 UI。

## 关键证据（修复前）

- `src/hooks/useFavoriteItems.ts:20-24` — `isUpdatingFavoriteRef.current` 为 true 时直接丢弃新 payload。
- `src/hooks/useFavoriteItems.ts:30-45` — 异步读取结束后使用启动时捕获的 `allFavorites` 更新 UI。
- `src/hooks/useFavoriteItems.ts:69-73` — 收藏更新事件复用同一函数，没有 pending/latest 队列。

## 影响

慢 `getAllPlayRecords()` 期间添加、删除或清空收藏，界面可能恢复旧卡片或不显示新卡片，直到下一次事件或重挂载。

## 修复方向

保存最新 pending favorites，在当前补全完成后继续处理最后一版；补“请求进行中再次更新”测试。

## 修复记录（2026-07-15）

- 收藏更新改为只保存最新 pending payload；补全过程中到达的新 payload 不再被直接丢弃。
- 旧补全完成时如果发现已有更新，会跳过旧结果写回并继续处理最新一版。
- 旧补全失败时也不会终止队列；失败期间收到的新 payload 仍会继续补全。
- 已补 debounce latest、补全期间更新、旧补全失败后继续和卸载取消测试；最终全量 Jest、typecheck 与 build 已通过。

## 建议动作

`cs-issue`，因为这是明确的数据更新丢失竞态。
