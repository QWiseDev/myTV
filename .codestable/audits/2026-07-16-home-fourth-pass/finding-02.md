---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-02'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 02：移动操作面板在矮屏下存在不可达内容

## 速答

`MobileActionSheet` 没有视口最大高度和整体滚动容器，外层又拦截触摸滚动，横屏手机或键盘弹出时部分操作可能永久移出可达区域。

## 关键证据

- `src/components/MobileActionSheet.tsx:129-139` — 全屏祖先对 `touchmove` 调用 `preventDefault()`，并设置 `touchAction: 'none'`。
- `src/components/MobileActionSheet.tsx:163-179` — 面板只有宽度与底部安全区，没有 `max-height` 或 `overflow` 约束。
- `src/components/MobileActionSheet.tsx:229-284` — 操作列表是普通内容区，项目增多时不会成为可滚动主体。

## 影响

矮屏、横屏、浏览器工具栏占位或软键盘开启时，头部或操作项可能被推到视口外；背景页面已锁定，用户无法通过滚动找回这些操作。

## 修复方向

把面板约束在 `100dvh` 内，固定头部、让内容主体滚动，并只在遮罩层阻止背景滚动。

## 处理进展（2026-07-16）

- 面板改为 `100dvh` 上限的纵向 flex 容器，头部固定，操作与来源共用唯一 `overflow-y-auto` 主体。
- 移除全屏祖先的 `touchAction: 'none'` 与 `touchmove preventDefault()`，保留遮罩和 body 锁滚动。
- 增加左右、顶部与底部 safe-area 约束；独立组件回归覆盖滚动结构。
- 关闭动画期间把焦点留在 dialog 并持续圈定；body 锁滚动的恢复 RAF 可被 StrictMode 下一轮 setup 取消。
- 667×320 浏览器验证：面板 top=16、bottom=304、height=288；滚动区 `scrollHeight=243 > clientHeight=191`，底部操作可聚焦。

## 建议动作

`cs-issue`，因为这是特定视口下的功能不可达问题。
