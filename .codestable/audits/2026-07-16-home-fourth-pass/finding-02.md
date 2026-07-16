---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-02'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
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

## 建议动作

`cs-issue`，因为这是特定视口下的功能不可达问题。
