---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: performance-07
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: partially-resolved
---

# Finding 07：每张 VideoCard 都挂载完整状态与全局监听

## 速答

首页通常同时挂载约 48-60 张卡，但每张卡都创建三份 props 镜像、两套收藏状态、两个全局事件监听和一个关闭状态的 ActionSheet。

## 关键证据

- `src/components/VideoCard.tsx:87-97` — 每个可变字段各自用 state + effect 镜像 props。
- `src/components/VideoCard.tsx:99-124` — 每张卡注册 `doubanImageProxyChanged` 与 `storage` 两个 window listener。
- `src/components/VideoCard.tsx:170-265` — 普通收藏与搜索收藏维护两套状态。
- `src/components/VideoCard.tsx:348-398` — 即使 Douban 纯展示卡也实例化上述 hooks。
- `src/components/VideoCard.tsx:853-866` — 每张卡始终挂载 `MobileActionSheet`。
- `src/components/MobileActionSheet.tsx:42-74` — 关闭状态初次 effect 仍创建 200ms timer。

## 影响

首页卡片数量会把 effect、监听器、timer、收藏查询和 React state 成本成倍放大；收藏夹卡片在已知收藏状态下仍可能短暂显示“添加收藏”。

## 修复方向

先补多卡 characterization test，再拆纯展示卡与 source-backed 交互卡；图片代理配置提升为共享订阅，全页只维护一个 ActionSheet。

## 本轮进展（2026-07-15）

- 图片代理配置已提升为模块级 external store；页面上无论多少卡片，window 只挂一组 `doubanImageProxyChanged` / `storage` listener，并在最后一个订阅者卸载时清理。
- 从未打开过操作菜单的卡片不再挂载 `MobileActionSheet`，避免每卡初次 effect/timer 成本。
- 收藏状态查询增加 revision 校验；较早的异步 `isFavorited()` 结果不能再覆盖后到的 `favoritesUpdated` 事件。
- 已补共享监听、按需挂载和 deferred 收藏查询竞态测试；`VideoCard.test.tsx` 10 个 tests、目标 ESLint 和 typecheck 已知通过。
- 每卡的 props 镜像 state、普通收藏/搜索收藏两套 hook、逐卡 `favoritesUpdated` 订阅以及“打开过后每卡各自保留 ActionSheet”仍未拆分，所以 finding 保持 partially-resolved。

## 建议动作

`cs-refactor`，因为这是保持功能不变的组件状态边界重划。
