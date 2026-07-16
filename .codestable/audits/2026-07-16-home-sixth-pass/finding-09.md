---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'maintainability-09'
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 09：收藏领域保留三份已经漂移的类型定义

## 速答

Favorite 在共享 types、db.client 和 favorite-items 中重复定义，search_title 的必填性已经发生实际漂移。

## 关键证据

- src/lib/types.ts:38-48 — Favorite.search_title 为必填字段。
- src/lib/db.client.ts:49-59 — 另一份 Favorite 把 search_title 改为可选。
- src/lib/favorite-items.ts:4-13 — FavoriteRecord 再次复制同一字段集合并把 search_title 设为可选。
- src/app/api/favorites/route.ts:85-114 — route 通过解构类型与 as Favorite 接受运行时 payload，无法约束客户端另一份类型。

## 影响

新增或调整收藏字段时必须人工同步三份定义；当前必填性漂移已经允许 VideoCard 保存缺少 search_title 的记录，编译期无法覆盖完整链路。

## 修复方向

选定一份领域 Favorite 作为事实源，UI 扩展用 Pick/Omit/交叉类型派生，删除本地复制定义。

## 建议动作

cs-refactor，因为目标是统一类型所有权并保持现有运行时行为。
