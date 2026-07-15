---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: bug-04
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 04：收藏首次加载与失败都会被误显示为真实空态

## 速答

收藏 Hook 只返回初值为 `[]` 的数据，没有 loading/error；收藏组件会把“尚未完成”和“加载失败”都显示成“收藏夹空空如也”。

## 关键证据

- `src/hooks/useFavoriteItems.ts:13-19` — 收藏数据初值是空数组，没有独立加载状态。
- `src/hooks/useFavoriteItems.ts:59-62` — 初始 payload 也复用 300ms 防抖，再等待播放记录补全。
- `src/components/HomeClient.tsx:150-156` — 首次切换收藏 tab 后直接渲染 lazy `FavoritesSection`，没有数据 loading fallback。
- `src/components/FavoritesSection.tsx:47-59` — `favoriteItems.length === 0` 立即渲染最终空态。

## 影响

lazy chunk 先于收藏补全完成时会短暂闪出伪空态；请求失败时则长期把错误伪装成真实空收藏，用户无法判断是否需要重试。

## 修复方向

显式区分 loading、loaded-empty 与 error，再决定骨架、空态或重试提示。

## 建议动作

`cs-issue`，因为当前 UI 会向用户报告错误的数据状态。
