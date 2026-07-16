---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'bug-05'
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 05：收藏首次加载失败没有原地重试入口

## 速答

收藏夹会正确显示首次加载失败，但错误态没有重试按钮，加载 effect 又只依赖 tab；用户只能切回首页再进收藏夹才能恢复。

## 关键证据

- `src/components/FavoritesSection.tsx:74-88` — 空列表错误态只显示“收藏加载失败，请稍后重试”，没有操作入口。
- `src/hooks/useFavoriteItems.ts:94-125` — 首次 GET 失败后把 state 置为 `error`，没有保留可调用的 reload 方法。
- `src/hooks/useFavoriteItems.ts:127-133` — effect 唯一依赖 `activeTab`，停留在收藏 tab 时不会自行重新运行。

## 影响

一次短暂的 `/api/favorites` 失败会把当前 tab 留在不可恢复错误态；页面给出“稍后重试”文案却没有实际重试动作。

## 修复方向

让 hook 暴露去重的 retry/reload 命令，并在空错误态和“显示已有内容”的刷新错误态提供原地重试按钮。

## 处理进展（2026-07-16）

- `useFavoriteItems` 增加 retry generation 与快速重复点击门禁，重试直接重启当前收藏 effect。
- 重试期间保留已有收藏并进入 loading；成功后恢复 loaded/error 状态。
- 空错误态与 stale-content 刷新错误态均提供原地“重试”按钮，`HomeClient` 只负责透传命令。
- Hook 与组件回归覆盖首次失败、刷新失败、重复点击和成功恢复。

## 建议动作

`cs-issue`，因为现有错误 UI 缺少承诺给用户的恢复路径。
