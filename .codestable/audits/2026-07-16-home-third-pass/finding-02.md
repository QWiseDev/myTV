---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "bug-02"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 02：清空收藏失败仍可能把页面清成空态

## 速答

UI 虽只在 DELETE 成功后主动清空，但数据层会在请求前广播空收藏；DELETE 与补偿 GET 同时失败时，页面已经消费空事件且无法恢复原列表。

## 关键证据

- `src/components/FavoritesSection.tsx:30-36` — 组件约定持久化成功后才调用 `onClearAll()`。
- `src/lib/db.client.ts:1507-1529` — 数据层在 DELETE 前先缓存并 dispatch `{}`，失败后只依赖补偿 GET。
- `src/hooks/useFavoriteItems.ts:85-91,102-107` — 收藏 hook 会立即消费 `favoritesUpdated` 并提交空列表。
- `src/components/FavoritesSection.test.tsx:146-162` — 测试直接 mock rejection，没有覆盖 rejection 前已经发出的空事件。

## 影响

网络或 Redis 异常时，服务端收藏仍存在，当前页面却显示最终空态；刷新后收藏又出现，用户会误以为数据丢失或操作已成功。

## 修复方向

清空全部收藏改为 DELETE 成功后再提交空缓存和事件；补一条贯穿 db client、DOM event 与 hook 的失败回归。

## 建议动作

`cs-issue`，因为失败路径违反“持久化失败保留原列表”的既定交互契约。

## 修复记录（2026-07-16）

- 数据库模式改为 DELETE 成功后才清空收藏缓存并发布 `favoritesUpdated {}`。
- DELETE 与补偿 GET 同时失败时保留原缓存，不再广播空集合。
- 修复记录见 `.codestable/issues/2026-07-16-home-favorites-clear-consistency/home-favorites-clear-consistency-fix-note.md`。
