---
doc_type: refactor-design
refactor: 2026-07-16-user-menu-decomposition
status: approved
scope: UserMenu 展示、数据订阅与设置状态的内部职责拆分
summary: 保持现有行为与 contract，分三批把 2095 行组件收敛为编排容器
---

# user menu decomposition refactor design

## 1. 本次范围

- 执行 scan #1、#2、#3。
- 目标是让 `UserMenu` 只保留认证/权限、面板开关、导航/登出、版本/改密编排与 Portal 挂载。
- 展示组件只接数据与回调；数据 Hook 继续使用当前 API、缓存、事件和 timer；设置 Controller 继续使用 `UserMenuSettingsSnapshot` 与现有 helper。
- 不把多个 panel boolean 改成 enum，不改变角色/storageType 条件，不替换收藏或播放记录数据源，不改变 localStorage key/default/序列化/事件，不调整追更策略、logout/改密 API 或 `VideoCard` / `VersionPanel` 行为。
- 用户放行依据：会话持续目标为“完成所有重构优化”，并明确要求每阶段提交后继续处理首页。
- 总风险：中高；纯展示搬移风险中，effect 生命周期迁移风险中，设置持久化 contract 风险高。

## 2. 前置依赖

- 已新增 `UserMenu.test.tsx` 8 条组件刻画，`UserMenu.tsx` line coverage 71.17%、branch coverage 71.71%。
- 展示拆分前补导航/菜单关闭、版本面板、设置 reset/条件分支与改密 API 失败测试，避免只覆盖已拆 helper。
- 数据 Hook 迁移前分别补未开启不请求、事件重载、晚到响应、timer 和 unsubscribe cleanup 测试。
- 设置 Controller 迁移前以 `UserMenuSettingsSnapshot` 为边界逐 key 验证，并保留 `localStorageChanged` / `doubanImageProxyChanged` 条件事件。
- `UserMenu` 生产调用方只有 `Header`；不修改 Header contract。

## 3. 执行顺序

### 步骤 1：补齐展示边界刻画

- 引用方法：M-L1-04 Characterization Test
- 具体操作：在 `UserMenu.test.tsx` 增加导航/关闭、版本、reset、条件设置和改密错误场景；断言当前 Portal、权限与持久化行为，不断言内部组件层级。
- 退出信号：新旧实现均可复用的交互断言通过，目标测试/ESLint/typecheck 通过。
- 验证责任：AI 自证。
- 回滚：删除本步新增测试。

### 步骤 2：拆出面板展示组件

- 引用方法：M-L3-01 Component Split
- 具体操作：在 `src/components/user-menu/` 建立 panel primitives、菜单、设置、改密和媒体面板组件；Portal/open state/滚动锁/数据加载继续由 `UserMenu` 持有。
- 退出信号：`UserMenu` 不再内联 6 棵面板 JSX；所有组件只通过 props 读取数据和触发回调，原组件测试与新增子组件测试通过。
- 验证责任：AI 自证 + HUMAN 目视桌面/移动布局、滚动、触摸命中。
- 回滚：恢复内联 JSX，删除新展示文件。

### 步骤 3：迁移三个数据订阅 Hook

- 引用方法：M-L3-02 Extract Custom Hook
- 具体操作：提取 `useUserMenuWatchingUpdates`、`useUserMenuContinueWatching`、`useUserMenuFavorites`；保持 direct fetch/getAllPlayRecords、缓存读取、事件名称、invalidated 过滤、100ms timer 和 cleanup 时点。
- 退出信号：父组件不再包含三个数据 effect；Hook 级 deferred/fake-timer/cleanup 测试和 `UserMenu.test.tsx` 通过。
- 验证责任：AI 自证；HUMAN 触发一次收藏/播放记录更新，确认面板刷新时点。
- 回滚：逐 Hook 恢复原 state/effect。

### 步骤 4：提取设置 Controller

- 引用方法：M-L3-02 Extract Custom Hook
- 具体操作：新增 `useUserMenuSettingsController`，内部持有 13 项 state、snapshot apply、显式变更命令与 reset；不改成通用配置 map。
- 退出信号：父组件不再直接读写设置 localStorage；逐 key Controller 测试、现有 settings helper 测试与组件测试通过。
- 验证责任：AI 自证 + HUMAN 修改、刷新和恢复默认后核对搜索/直播/播放器设置。
- 回滚：恢复父组件设置 state/handler，删除 Hook。

### 步骤 5：收口父组件与文档

- 引用方法：M-L3-07 Single Responsibility Split
- 具体操作：清理本次迁移产生的 import、局部 helper 和未使用状态；更新 runtime finding 的 UserMenu 子项进展，不处理同 finding 的其它超大组件。
- 退出信号：每一处剩余 state/effect 都能归属菜单编排、认证/权限、版本、导航或改密；无本次产生的死引用。
- 验证责任：AI 自证。
- 回滚：随对应步骤提交 revert。

### 步骤 6：完整回归与目视验收

- 引用方法：M-L1-04 Characterization Test
- 具体操作：运行 UserMenu/四组 helper/新 Hook tests、全量 Jest、目标 ESLint、typecheck、production build、YAML/Prettier/diff check，并用真实浏览器逐面板验收。
- 退出信号：完整门禁通过；桌面/移动 6 面板布局、滚动、关闭、导航与设置传播不变。
- 验证责任：AI 自证 + HUMAN 最终确认。
- 回滚：按独立阶段 commit 逐步 revert。

## 4. 风险与看点

- 展示组件不得自行创建 Portal、读取 localStorage 或发请求，否则状态 owner 会再次分裂。
- Hook 迁移不得把 UserMenu 数据提升到首页 Context，也不得复用行为不同的首页 favorites/playback Hook。
- 多个 panel boolean 保持原形，避免无意禁止当前可能存在的并存状态。
- 设置命令保持显式，避免通用 map 掩盖 boolean/string/number 序列化和条件事件差异。
- 不删除调试日志、不延迟版本检查、不主动刷新追更；这些属于另行行为/性能决策。
