---
doc_type: refactor-apply-notes
refactor: 2026-07-16-user-menu-decomposition
---

# user menu decomposition apply notes

## 步骤 1：补齐展示与持久化边界刻画

- 完成时间：2026-07-16
- 改动文件：`src/components/UserMenu.test.tsx`
- 验证结果：新增菜单导航后关闭 Portal、版本面板开关、设置恢复默认与图片代理事件、自定义豆瓣代理条件输入框、改密 API 拒绝保留面板 5 类刻画；`UserMenu.test.tsx` 13/13、目标 ESLint、`pnpm typecheck`、YAML 校验与 `git diff --check` 通过。
- 偏离：首次 YAML 验证使用 `python` 时因当前 pyenv 未配置该命令失败，改用 `python3` 后通过；未修改生产行为。

## 步骤 2：拆出面板展示组件

- 完成时间：2026-07-16
- 改动文件：`src/components/UserMenu.tsx`、`src/components/UserMenu.test.tsx`、`src/components/user-menu/UserMenuPanelPrimitives.tsx`、`src/components/user-menu/UserMenuDropdownPanel.tsx`、`src/components/user-menu/UserMenuSettingsPanel.tsx`、`src/components/user-menu/UserMenuChangePasswordPanel.tsx`、`src/components/user-menu/UserMenuMediaPanels.tsx`、`src/components/user-menu/UserMenuPanels.test.tsx`
- 验证结果：六棵面板 JSX 全部迁为纯 props 展示组件，`UserMenu.tsx` 从 2095 行降至 964 行；Portal、面板开关、滚动锁、请求/订阅、设置持久化与改密 API owner 均保留父组件。定向 Jest 2 suites / 21 tests、目标 ESLint、`pnpm typecheck`、结构搜索和 `git diff --check` 通过；独立只读审查未发现行为漂移。
- 浏览器验收：通过临时 SSH tunnel 启动本地 dev，桌面 1440×900 与移动 390×844 下验证菜单、设置、更新提醒、继续观看、收藏和版本面板；设置面板位于视口内且可滚动，打开时 `body/html` 锁定、关闭后恢复，浏览器 console 无 error；验收后已关闭 dev 与 tunnel。
- 偏离：按用户“提交本阶段后继续”指令，本步以真实浏览器自动验收替代中途停顿；最终人工目视确认仍留到步骤 6。保留图片代理箭头读取数据源下拉状态、管理面板导航不先关菜单等既有语义，未顺手修复。
