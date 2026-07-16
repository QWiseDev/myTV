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

## 步骤 3：迁移三个数据订阅 Hook

- 完成时间：2026-07-16
- 改动文件：`src/components/UserMenu.tsx`、`src/components/UserMenu.test.tsx`、`src/components/user-menu/useUserMenuWatchingUpdates.ts`、`src/components/user-menu/useUserMenuContinueWatching.ts`、`src/components/user-menu/useUserMenuFavorites.ts`、`src/components/user-menu/UserMenuDataHooks.test.ts`
- 验证结果：追更、继续观看和收藏的数据 state/effect 已迁入三个独立 Hook；保留 boolean cache gate、60 秒未读边界、`invalidated` 忽略、`playRecordsUpdated` / `favoritesUpdated` 刷新、100ms timer 合并、两个 active guard、晚到响应隔离和原日志语义。定向 Jest 3 suites / 35 tests、目标 ESLint、`pnpm typecheck`、Prettier 与 `git diff --check` 通过。
- 偏离：测试初始 props 的 `null` 被 TypeScript 过度收窄，显式扩宽为 `HookProps['authInfo']` 后通过；仅修测试类型，不改变生产逻辑。步骤 2 已完成桌面/移动媒体面板目视，本步最终事件刷新目视仍并入步骤 6。

## 步骤 4：提取设置 Controller

- 完成时间：2026-07-16
- 改动文件：`src/components/UserMenu.tsx`、`src/components/user-menu/useUserMenuSettingsController.ts`、`src/components/user-menu/useUserMenuSettingsController.test.ts`
- 验证结果：13 项持久化设置、一次性 hydration、13 个显式命令与 reset 已迁入零参数 Controller；两个豆瓣下拉 open state、Portal、滚动锁和面板开关仍归父组件。Hook 测试逐项固定 key/序列化、写入后同步派发、点击时 runtime default、只 hydration 一次，以及 reset 全量写回但只派发 `doubanImageProxyChanged` 的既有语义。定向 Jest 4 suites / 29 tests、目标 ESLint、`pnpm typecheck`、Prettier 与 `git diff --check` 通过。
- 偏离：无。未改 `src/lib/user-menu-settings.ts`、Panel props、数值校验或事件契约，也未将命令收敛为通用配置 map。

## 步骤 5：收口父组件与审计记录

- 完成时间：2026-07-16
- 改动文件：`src/components/UserMenu.tsx`、`.codestable/audits/2026-06-08-runtime-bundle-tech-debt/finding-02.md`
- 验证结果：结构搜索与目标 ESLint 确认父组件不再持有设置 localStorage、媒体数据源或已迁移 setter/helper；移除已无对应代码的 `no-non-null-assertion` 文件级禁用。`UserMenu.tsx` 从本轮开始的 2095 行降至 548 行，剩余 state/effect 均归属菜单/Portal 编排、认证权限、版本、导航登出、改密或下拉 UI 生命周期；旧超长组件 finding 已记录 UserMenu 子项完成，其余入口仍保持 open。
- 偏离：无。未继续拆分预存的导航、权限、版本、改密或下拉逻辑，也未改其它超长组件。
