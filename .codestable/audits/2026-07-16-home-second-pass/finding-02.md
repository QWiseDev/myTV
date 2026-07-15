---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: performance-02
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 02：继续观看从 12 增至 13 条会整行卸载重挂

## 速答

加载第二页使记录数从 12 变 13 时，继续观看会切换横滑行根结构，导致首批卡片全部卸载再挂载。

## 关键证据

- `src/components/ContinueWatching.tsx:200` — `displayItems.length <= 12` 动态切换 `enableAnimation`。
- `src/components/ScrollableRow.tsx:184-190` — 开关变化会在 `AnimatedCardGrid` 与原始 children 两种不同父节点之间切树。
- `src/components/AnimatedCardGrid.tsx:45-70` — 组件本身只动画前 8 张，第 9 张以后已经使用普通 wrapper，不需要在 12 条后移除整个容器。

## 影响

用户点击“更多”后，已显示卡片会重新执行图片加载、收藏查询/订阅和组件 effect，打开中的局部状态也会丢失；这与分页降低首屏成本的目标相反。

## 修复方向

保持继续观看横滑行父结构稳定，只让新增卡片进入现有容器。

## 建议动作

`cs-refactor`，因为可以在保持交互结果不变的前提下移除阈值切树。

## 修复记录（2026-07-16）

- `ContinueWatching` 不再按 12 条阈值切换 `enableAnimation`，分页前后始终复用同一个 `AnimatedCardGrid` 父结构。
- 新增 12→13 条 rerender 回归，确认第二页追加后动画容器仍保持启用。
- 全量 Jest 69 suites / 294 tests、typecheck、production build 与目标 ESLint 通过。
