---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'bug-04'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 04：横滑覆盖层制造不可见焦点与无效点击区

## 速答

横滑箭头只在鼠标 hover 时显形，却始终留在键盘 Tab 顺序且没有名称；继续观看角标又覆盖在播放链接之上并拦截点击，两个非内容覆盖层都破坏了原本可用的交互。

## 关键证据

- `src/components/ScrollableRow.tsx:44-73` — wrapper 在非 hover 时为 `opacity-0`，内部 button 仍可聚焦且没有 `aria-label`。
- `src/components/ScrollableRow.tsx:120-156` — 小于 `640px` 挂载时 effect 提前 return，没有订阅 media query；旋转到桌面宽度后不会主动建立初始滚动状态。
- `src/components/ContinueWatching.tsx:72-85` — `CornerBadge` 是高 z-index 的普通 div，没有 `pointer-events-none`。
- `src/components/ContinueWatching.tsx:100-137` — 角标是 `VideoCard` 播放链接的 sibling；点击角标只冒泡到无 click handler 的 `HomeCardShell`，不会激活播放链接。

## 影响

键盘用户会 Tab 到完全不可见、读屏无名称的滚动按钮；窄屏转宽后箭头可能保持缺失。移动用户点击“+N集/继续看”角标覆盖区域时，卡片没有任何响应。

## 修复方向

为滚动按钮补具名语义和 `focus-within` 可见状态，监听断点变化重新测量；让非交互角标透传 pointer hit testing，并补键盘/命中回归。

## 处理进展（2026-07-16）

- 左右滚动按钮补 accessible name，wrapper 在 `focus-within` 时显示。
- `ScrollableRow` 监听 media query change，窄屏挂载后切到桌面断点会重新测量，并在 cleanup 中解除监听。
- 继续观看 `CornerBadge` 改为 `pointer-events-none`，不再覆盖播放链接命中。
- 组件回归和真实浏览器验证覆盖 accessible tree、键盘焦点 opacity 与 computed pointer events。

## 建议动作

`cs-issue`，因为两条路径都能稳定造成用户操作失效。
