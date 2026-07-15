---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: bug-08
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 08：清空收藏失败会形成未处理 Promise rejection

## 速答

收藏清空按钮的 async handler 没有 catch；底层 DELETE 失败后会重新抛错，React 不会接管事件处理器返回的 Promise。

## 关键证据

- `src/components/FavoritesSection.tsx:26-29`、`37-43` — 点击直接调用无错误处理的 `handleClearAll()`。
- `src/lib/db.client.ts:1521-1530` — `clearAllFavorites()` 完成缓存恢复和全局错误提示后仍 `throw err`。
- `src/components/FavoritesSection.test.tsx:65-80` — 现有测试只覆盖成功时“storage 后 state”的顺序，没有失败路径。

## 影响

清空请求失败时会产生 `unhandledrejection` 噪音；若监控捕获未处理 Promise，会把已由全局错误层处理的业务失败再次上报为前端异常。

## 修复方向

在事件边界消费已被全局层处理的 rejection，并补失败回归，确保本地列表不被误清空。

## 建议动作

`cs-issue`，因为失败路径的 Promise 所有权缺失已经可静态确认。

## 修复记录（2026-07-16）

- `FavoritesSection` 在点击事件边界消费 `clearAllFavorites()` rejection，避免形成未处理 Promise。
- 只有持久层清空成功后才调用 `onClearAll()`；失败时保留当前本地收藏列表。
- 新增清空失败回归；定向 Jest 2 suites / 18 tests、全量 Jest 69 suites / 305 tests、typecheck、production build 与目标 ESLint 通过。
