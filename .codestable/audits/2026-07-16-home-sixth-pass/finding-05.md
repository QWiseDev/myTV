---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'bug-05'
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 05：追更事件更新数据但不重算未读状态

## 速答

用户菜单初次读取会根据 last viewed 时间计算未读，但后续 watching-updates 事件只替换数据，绕过同一计算函数。

## 关键证据（修复前）

- src/components/user-menu/useUserMenuWatchingUpdates.ts:51-67 — updateWatchingUpdates 同时读取缓存并计算 hasUnreadUpdates。
- src/components/user-menu/useUserMenuWatchingUpdates.ts:74-80 — 正常事件只执行 setWatchingUpdates(getDetailedWatchingUpdates())。
- src/components/user-menu/useUserMenuWatchingUpdates.ts:131-134 — 打开面板会把未读设为 false 并写入 viewed 时间。

## 影响

用户看过提醒后，超过一分钟再收到有更新的事件，列表内容和数量会刷新，但菜单红点仍保持已读，用户可能错过新集提示。

## 修复方向

事件处理复用唯一的 snapshot + unread 计算函数，并补“已读后时间推进再到新事件”的 Hook 回归。

## 建议动作

cs-issue，因为事件后的可见提醒状态与最新数据不一致。

## 修复进展（2026-07-16）

- 正常 watching-updates 事件改为复用 updateWatchingUpdates，snapshot 与未读计算不再分叉；事件 payload 的 hasUpdates/updatedCount 作为第一层门禁。
- 未读还要求 snapshot.timestamp 晚于 lastViewed 且超过一分钟抑制窗口，旧 snapshot 重播和 false/0 事件不会误亮红点；invalidated 事件继续保持忽略语义。
- 新增“旧 snapshot 重播、false/0 payload、新 snapshot + true payload”组合回归；旧实现失败，修复后只有最后一种重新显示未读。
- 修复记录见 .codestable/issues/2026-07-16-home-watching-updates-unread-event/home-watching-updates-unread-event-fix-note.md。
