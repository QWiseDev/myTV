---
doc_type: refactor-scan
refactor: 2026-07-16-user-menu-decomposition
status: user-reviewed
scope: src/components/UserMenu.tsx 与 src/components/UserMenu.test.tsx
summary: 3 条结构优化，中风险 2 条、高风险 1 条
---

# user menu decomposition scan

## 总览

- 扫描范围：`src/components/UserMenu.tsx`、`src/components/UserMenu.test.tsx`，共 2465 行。
- 发现 3 条优化点：结构 3 / 性能 0 / 可读性 0。
- 按风险：低 0 / 中 2 / 高 1。
- 建议先做：#1 先拆展示子树，建立稳定的容器/展示边界；#2 再迁移三个数据订阅域；#3 最后收口设置 controller。
- 建议慎做 / 后做：#3 涉及 13 项设置的序列化和跨组件事件，必须保留当前 key、默认值和事件名称。
- 前置检查 7 条全过：✓。行为修复已拆到独立 issue；新增 8 条组件刻画测试，`UserMenu.tsx` line coverage 71.17%、branch coverage 71.71%；候选均为组件内部边界，不涉及生成代码、第三方代码或风格项；扫描范围低于 3000 行。
- 明确不做：不把多个面板 boolean 改成单一 enum，不改变权限/存储模式显示规则，不替换收藏和播放记录数据源，不调整版本检查、追更刷新、未读一分钟规则、logout/改密流程或 `VideoCard` / `VersionPanel` 内部实现。

## 条目

### #1 把六棵面板子树拆成展示组件 ✓

- **位置**：`src/components/UserMenu.tsx:918-2094`
- **分类**：结构
- **现状**：`UserMenu` 在同一函数内构造菜单、设置、改密、追更、继续观看、收藏 6 棵 JSX 子树，再在末尾分别通过 Portal 挂载。
- **问题**：6 棵子树合计约 1100 行；其中设置面板约 516 行、菜单约 207 行、三个媒体面板约 304 行，展示标记与数据订阅、持久化 handler 和面板生命周期共处一个 2095 行组件。
- **建议**：按菜单、设置/改密、媒体列表三个展示域提取到 `src/components/user-menu/`；新组件只接数据和回调，Portal、open state、滚动锁及数据加载所有权继续留在 `UserMenu`。
- **建议映射的方法**：M-L3-01 Component Split
- **风险**：中；大量 props 搬移可能漏传条件或回调，但不改变状态 owner，现有 Portal/权限/面板刻画测试可直接约束。
- **验证**：AI 自证（apply 前先补导航/登出、版本面板、设置 reset/条件分支与改密 API 错误刻画，再新增展示组件测试；跑 `UserMenu.test.tsx`、目标 ESLint、typecheck）；HUMAN（桌面与移动端逐个打开、关闭 6 个面板，确认布局、滚动和命中区域不变）。
- **范围**：约 1150 行搬移 / 4-5 文件。

### #2 把三个数据订阅域迁入独立 Hook ✓

- **位置**：`src/components/UserMenu.tsx:226-234`、`359-572`、`864-916`
- **分类**：结构
- **现状**：追更、继续观看、收藏各自在组件内持有 state/effect；共同依赖面板开关、用户/存储模式，并分别管理缓存、window event、订阅、timer 和晚到响应门禁。
- **问题**：3 个 effect 域约 250 行，注册 4 类外部事件/订阅并包含一个 100ms timer；它们与导航、改密和设置无共享生命周期，却让 `UserMenu` 同时承担数据源适配和 UI 编排。
- **建议**：分别提取 `useUserMenuWatchingUpdates`、`useUserMenuContinueWatching`、`useUserMenuFavorites`；每个 Hook 只接 enabled/身份/过滤配置并返回对应数据与操作，保留原请求入口、事件名称、缓存策略和 cleanup 时点。
- **建议映射的方法**：M-L3-02 Extract Custom Hook
- **风险**：中；迁移 effect 时可能改变订阅创建顺序、晚到请求写回或 timer cleanup，需要 Hook 级 fake-timer 和 deferred-response 测试。
- **验证**：AI 自证（覆盖未开启不请求、事件重载、invalidated 忽略、晚到响应、关闭/卸载 cleanup；跑 `UserMenu.test.tsx`、Hook 测试、typecheck）；HUMAN（打开三个数据面板并触发一次收藏/播放记录更新，确认列表刷新时点不变）。
- **范围**：约 270 行迁移 / 4-7 文件。

### #3 提取设置状态与持久化 Controller ✓

- **位置**：`src/components/UserMenu.tsx:270-341`、`745-842`
- **分类**：结构
- **现状**：组件直接持有 13 项设置 state、`applySettingsSnapshot()`、13 个显式变更 handler 和重置流程；展示面板直接绑定这些 state/handler。
- **问题**：设置域包含约 180 行状态和命令；12 个 localStorage key 使用 boolean/string/number 三种序列化，并有 `localStorageChanged`、`doubanImageProxyChanged` 两类条件事件，任何新增设置都要同时修改组件状态、handler、重置和 JSX 绑定。
- **建议**：提取 `useUserMenuSettingsController`，内部继续使用 `UserMenuSettingsSnapshot`、显式命令和既有 helper；返回 snapshot、逐项命令与 reset，不改 key、默认值、序列化格式或事件名称，也不引入通用配置 map。
- **建议映射的方法**：M-L3-02 Extract Custom Hook
- **风险**：高；设置是跨页面持久化 contract，错误迁移会让播放、搜索或图片代理读取到不同值，必须逐 key 验证。
- **验证**：AI 自证（现有 `user-menu-settings.test.ts`、新增 controller 测试逐 key 校验、`UserMenu.test.tsx`、目标 ESLint、typecheck）；HUMAN（修改、刷新并恢复默认，确认搜索/直播/播放器相关设置保持原值和即时事件效果）。
- **范围**：约 200 行迁移 / 2-3 文件。
