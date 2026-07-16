---
doc_type: refactor-design
refactor: 2026-07-16-version-panel-cleanup
status: approved
scope: 删除永久禁用的远程版本链并保留当前本地版本面板行为
summary: 以 CURRENT_VERSION 与本地 changelog 为唯一数据源，移除无效异步状态和不可达分支
---

# version panel cleanup refactor design

## 1. 本次范围

- 执行 scan #1、#2、#3。
- 保留版本入口、绿色状态点、固定“当前为最新版本”卡片、本地 changelog、Portal、关闭与滚动锁定行为。
- 删除远程状态、解析器、比较器、空请求 effect、恒假更新 UI 和最终无引用的 `version_check.ts`。
- 不处理 dialog/focus/Escape；不恢复远程检查；不改版本文案或状态颜色。
- 总风险：中；删除代码较多，但外部可见契约由刻画测试固定。

## 2. 前置依赖

- 新增真实 `VersionPanel` 刻画测试，覆盖本地版本、changelog、关闭与滚动恢复。
- 为菜单底部版本入口补绿色点断言。
- 全仓搜索 `version_check`、`checkForUpdates`、`compareVersions` 与 `UpdateStatus` 调用方。

## 3. 执行顺序

### 步骤 1：固化当前本地版本行为

- 引用方法：M-L1-04 Characterization Test
- 具体操作：新增真实面板测试和菜单版本绿点断言，并先在旧实现上运行。
- 退出信号：2 个目标 suite 全部通过。
- 验证责任：AI 自证。
- 回滚：删除新增测试与断言。

### 步骤 2：收口 VersionPanel 为本地 changelog 面板

- 引用方法：M-L2-02 Inline Function
- 具体操作：删除远程类型、状态、空 effect、fetch/parser 与恒假 JSX；保留固定状态卡和本地 changelog DOM。
- 退出信号：刻画测试、目标 ESLint、typecheck 通过，文件不再含 remote/latest/hasUpdate 符号。
- 验证责任：AI 自证。
- 回滚：恢复本步骤删除的分支。

### 步骤 3：移除 UserMenu 版本检查状态与模块

- 引用方法：M-L1-01 Parallel Change
- 具体操作：先把下拉版本绿点改为固定渲染并移除 props，再删 UserMenu effect/状态和顶部恒假分支，最后删除零引用的 `version_check.ts` 与测试 mock。
- 退出信号：版本入口与绿点测试通过；相关符号全仓零引用。
- 验证责任：AI 自证。
- 回滚：按模块、调用方逆序恢复。

### 步骤 4：完整回归与页面复验

- 引用方法：M-L1-04 Characterization Test
- 具体操作：运行 UserMenu/VersionPanel 定向测试、全量 Jest、目标 ESLint、typecheck、build，并在真实页面打开/关闭版本面板观察 console。
- 退出信号：本地版本内容和入口行为不变，无新增 lint/type/build/browser 错误。
- 验证责任：AI 自证。
- 回滚：整体 revert 本阶段提交。

## 4. 风险与看点

- 绿色点当前实际表示固定 `NO_UPDATE`；本次仅静态保留，不重新定义其语义。
- “当前为最新版本”是未检查情况下的误表述，但修改它属于可观察行为，另走 issue，不夹带进等价重构。
- `version_check.ts` 在 private Next 应用内无仓内消费者；删除前先完成全仓引用搜索。
