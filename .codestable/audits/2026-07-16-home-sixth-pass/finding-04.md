---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'bug-04'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 04：用户菜单模态框缺少 dialog 与焦点生命周期

## 速答

设置、修改密码、追更、继续观看、收藏和版本面板都用 Portal + 遮罩模拟模态框，但没有 dialog 语义、初始焦点、Tab 圈定、Escape 关闭和可靠焦点恢复。

## 关键证据

- src/components/user-menu/UserMenuSettingsPanel.tsx:106-135、UserMenuChangePasswordPanel.tsx:30-51 — 顶层面板是普通 div，关闭按钮仅使用英文 Close。
- src/components/user-menu/UserMenuMediaPanels.tsx:30-60、150-169、263-282 — 三个媒体弹层没有 role、aria-modal、标题关联或键盘处理；后两个关闭图标没有 accessible name。
- src/components/VersionPanel.tsx:293-348 — 版本弹层同样只有遮罩和普通 div，没有焦点所有权。
- src/components/MobileActionSheet.tsx:190-229、261-267 — 同仓库相邻模态组件已实现 Escape、Tab 圈定、dialog/aria-modal 和标题关联，说明当前用户菜单弹层偏离已有交互基线。

## 影响

读屏无法识别模态上下文；键盘焦点可移动到遮罩后的页面，Escape 无法关闭，关闭后焦点也不会稳定返回入口。修改密码等表单因此存在完整键盘操作断点。

## 修复方向

在用户菜单弹层 primitive 中集中实现 dialog 属性、标题关联、Escape、焦点圈定和恢复，并为所有关闭按钮提供中文可访问名称。

## 建议动作

cs-issue，因为当前模态交互对键盘和辅助技术用户不完整。
