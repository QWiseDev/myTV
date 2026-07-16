---
doc_type: refactor-scan
refactor: 2026-07-16-version-panel-cleanup
status: user-reviewed
scope: VersionPanel、本地版本入口与永久禁用的远程版本检查链
summary: 3 条结构/可读性优化，低风险 2 条、中风险 1 条
---

# version panel cleanup scan

## 总览

- 扫描范围：`src/components/VersionPanel.tsx`、`src/components/UserMenu.tsx`、`src/components/user-menu/UserMenuDropdownPanel.tsx`、`src/lib/version_check.ts` 及相关测试。
- 发现 3 条优化点：结构 2 / 性能 0 / 可读性 1。
- 按风险：低 2 / 中 1 / 高 0。
- 建议先做：#1 固化真实面板行为，再做 #2 删除恒假远程分支，最后做 #3 收口调用方并删除废弃模块。
- 建议慎做：不改绿色版本点、“当前为最新版本”卡片、Portal、滚动锁定和焦点语义；这些属于可观察行为或独立 issue。
- 前置检查：范围 4 个运行时文件、约 1546 行；无跨模块契约；新增 `VersionPanel` 刻画测试并补版本绿点断言后，测试前置已满足；目标不是生成代码或风格口味。
- 用户放行依据：会话明确要求去掉多次优化造成的代码冗余，并要求本阶段提交后继续处理首页。

## 条目

### #1 固化本地版本面板可见契约 ✓

- **位置**：`src/components/VersionPanel.test.tsx`、`src/components/user-menu/UserMenuPanels.test.tsx`
- **分类**：结构
- **现状**：`UserMenu` 测试 mock 整个版本面板，仓库没有真实 `VersionPanel` 内容、滚动锁定和版本状态点的回归覆盖。
- **问题**：远程分支约 300 行待删除，但现有测试只能证明入口可点击，不能证明本地 changelog、固定状态卡和绿点保持不变。
- **建议**：新增刻画测试，固定本地版本、changelog、关闭、滚动恢复和绿色状态点。
- **建议映射的方法**：M-L1-04 Characterization Test
- **风险**：低；只新增测试，不改运行时。
- **验证**：AI 自证（旧实现上定向 Jest 通过）。
- **范围**：约 55 行 / 2 文件。

### #2 删除 VersionPanel 恒假远程分支 ✓

- **位置**：`src/components/VersionPanel.tsx:26-190`、`src/components/VersionPanel.tsx:333-529`
- **分类**：可读性
- **现状**：`hasUpdate` 永远为 false，远程 effect 不执行请求，fetch 入口立即返回，但仍保留解析器、远程状态与三段不可达 JSX。
- **问题**：约 300 行逻辑没有运行态入边；本地 changelog 渲染仍被迫接受 `isRemote`、`latestVersion` 等无效参数。
- **建议**：删除远程状态、空 effect、fetch/parser 与恒假 JSX，把当前固定状态卡无条件渲染，并把 changelog renderer 收口为本地类型。
- **建议映射的方法**：M-L2-02 Inline Function
- **风险**：中；删除量大，但刻画测试可锁定当前可见内容、关闭和滚动契约。
- **验证**：AI 自证（VersionPanel 测试、目标 ESLint、typecheck）。
- **范围**：约 300 行删除或改写 / 2 文件。

### #3 移除无价值版本检查状态链 ✓

- **位置**：`src/components/UserMenu.tsx:126-180`、`src/components/user-menu/UserMenuDropdownPanel.tsx:20-102`、`src/lib/version_check.ts`
- **分类**：结构
- **现状**：首页每次挂载异步调用一个固定返回 `NO_UPDATE` 的函数，再把稳定状态逐层传给菜单底部；比较器、网络 helper 和旧注释实现无调用方。
- **问题**：一次无网络价值的 effect、2 个状态、2 个 props 和 152 行模块只为最终固定渲染一个绿色点；顶部 `HAS_UPDATE` 分支永远不成立。
- **建议**：先把调用方收口为现有稳定 UI，再删除 `version_check.ts`，顶部提醒只保留追更未读条件。
- **建议映射的方法**：M-L1-01 Parallel Change
- **风险**：低；保持版本入口、绿色点和打开面板行为不变。
- **验证**：AI 自证（符号零残留、UserMenu 两组测试、typecheck）。
- **范围**：约 190 行删除或改写 / 5 文件。
