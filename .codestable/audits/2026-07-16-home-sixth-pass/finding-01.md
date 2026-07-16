---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'bug-01'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 01：收藏客户端缺少统一新鲜度与失败回滚协议

## 速答

收藏的后台 GET、初始 GET、乐观保存/删除、清空和用户菜单直连 GET 各自写状态，却没有用户级 revision、mutation barrier 或可靠 rollback；旧读响应与双重失败都能留下错误收藏状态。

## 关键证据

- src/lib/db.client.ts:1450-1482、1640-1672 — 后台/初始 GET 完成后直接写收藏缓存，没有校验请求开始后的 mutation revision。
- src/lib/db.client.ts:1517-1539、1580-1599、1741-1755 — 保存、单删和清空没有共用用户级 mutation queue；旧 GET 可在 mutation 成功后重新写回旧快照。
- src/lib/db.client.ts:580-630 — mutation 失败只尝试补偿 GET；补偿 GET 也失败时没有恢复 mutation 前快照。
- src/components/user-menu/useUserMenuFavorites.ts:37-60 — 用户菜单绕过共享收藏读取，多个 loadFavorites 只检查组件是否存活，没有 latest-request-wins。

## 影响

旧 GET 先读到服务端快照、后续保存/删除/清空成功、旧 GET 再迟到时，已删除收藏会复活或新增收藏会消失。保存/删除与补偿 GET 同时失败时，错误乐观状态会一直保留；用户菜单的旧初载也可覆盖更新事件后的新列表。

## 修复方向

为收藏增加用户级 revision、pending mutation 与串行边界，保存 mutation 前快照并在无法回源时回滚；把用户菜单读取收口到共享入口或补 latest-request-wins。

## 建议动作

cs-issue，因为当前 UI 状态可与已经完成的持久化结果或明确失败结果长期不一致。
