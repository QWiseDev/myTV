---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "bug-03"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 03：加载骨架被动画容器包成纵向单列

## 速答

继续观看和热门电影把 `<SkeletonRow />` 作为一个 child 交给动画网格；动画层只包出一个 block wrapper，六张骨架随后在 wrapper 内纵向堆叠。

## 关键证据

- `src/components/ContinueWatching.tsx:224-236` — loading 时向默认开启动画的 `ScrollableRow` 传入单个 `SkeletonRow`。
- `src/components/LazyVideoSection.tsx:47-55` — 热门电影 loading 走相同结构。
- `src/components/ScrollableRow.tsx:184-190` — 开启动画时把 children 交给 `AnimatedCardGrid`。
- `src/components/AnimatedCardGrid.tsx:50-70` — `Children.toArray()` 只看到一个组件元素，并为它增加单个 block wrapper。
- `src/components/SkeletonRow.tsx:20-25` — 六张卡到组件内部才展开。

## 影响

冷首页和播放记录加载期会短暂出现异常高的纵向骨架列，横滑占位与最终卡片布局不一致，产生明显布局跳动。

## 修复方向

loading 时关闭该横滑行的卡片入场动画，让 `SkeletonRow` fragment 直接落入外层横向 flex，并补真实组合测试。

## 建议动作

`cs-issue`，因为加载态 DOM 结构与目标横向布局不一致。

## 修复记录（2026-07-16）

- `ContinueWatching` 与 `LazyVideoSection` 在 loading 时关闭 `ScrollableRow` 卡片动画，非 loading 配置保持原样。
- 新增真实 `ScrollableRow → SkeletonRow` 组合测试，确认骨架卡直接成为横向容器的三个子节点，不再被单个动画 wrapper 包裹。
- 修复记录见 `.codestable/issues/2026-07-16-home-skeleton-layout/home-skeleton-layout-fix-note.md`。
