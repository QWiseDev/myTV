---
doc_type: refactor-design
refactor: 2026-07-16-playback-state-cleanup
status: approved
scope: ended 事件事务与 usePlayerState 未采用状态分支
summary: 合并重复 ended 注册并删除 source/favorite 假 owner
---

# playback state cleanup refactor design

## 1. 本次范围

- 执行 scan #1、#2。
- 保留 ended 的可观察顺序、重复事件埋点、SkipController 去重、1 秒自动下一集与 2 秒标志清理。
- source owner 继续是 `state.video.source + availableSources`；favorite owner 继续是 `useFavorite`。
- 不删除 reducer 的通用 `dispatch` / `batchUpdate` / `reset`，不拆 `page.tsx` 或 initializer 的其它职责。
- 总风险：中；ended 为运行时顺序重排，死状态删除为编译期/零引用清理。

## 2. 前置依赖

- 测试 harness 记录同名事件的全部 handler，避免 Map 覆盖造成假阴性。
- 搜索 raw dispatch、action creator、`batchUpdate({ sources/favorite })`、state 读取与类型引用。
- 对照 `useSourceInitialization`、`useSourceSwitcher`、`useFavorite` 确认真实 owner。

## 3. 执行顺序

### 步骤 1：固化 ended 事务边界

- 引用方法：M-L1-04 Characterization Test
- 具体操作：覆盖重复 ended、SkipController、analytics 后 player 失活和最后一集；显式断言 release 先于 analytics、自动下一集只发生一次。
- 退出信号：旧行为断言清楚，测试 harness 能枚举同名 handler。
- 验证责任：AI 自证。
- 回滚：删除新增测试和 handler list helper。

### 步骤 2：合并 ended 注册

- 引用方法：M-L2-01 Extract Function
- 具体操作：建立单一 `handleVideoEnded`，在原第一监听位置串联两段职责，删除原第二监听。
- 退出信号：每个播放器只注册一个 `video:ended`；4 条 ended 回归通过。
- 验证责任：AI 自证。
- 回滚：恢复两个按顺序注册的 handler。

### 步骤 3：删除 source/favorite 假 owner

- 引用方法：M-L3-03 State Lifting / Lowering
- 具体操作：删除 reducer 字段、action/default/case/creator、页面无效 favorite 初始化和专属遗留类型。
- 退出信号：旧标识符零引用；source switch/favorite 真实 owner 无修改，TypeScript 编译通过。
- 验证责任：AI 自证。
- 回滚：恢复删除的声明，不改真实 owner。

### 步骤 4：完整回归

- 引用方法：M-L1-04 Characterization Test
- 具体操作：运行播放页定向 Jest/ESLint、typecheck、全量 Jest、build、文档格式、YAML 与 diff check。
- 退出信号：质量门禁通过，提交只包含本批 playback finding-08 清理及对应记录。
- 验证责任：AI 自证。
- 回滚：整体 revert 本次独立提交。

## 4. 风险与看点

- analytics 必须在 handled 早退前，因此重复 ended 仍重复释放 Wake Lock 和上报，但只安排一次换集。
- analytics 后需再次确认 active player，保留原两个 handler 之间的身份门禁。
- 不把自动结束改成 `handleNextEpisode()`，该命令会写 SkipController 标志并改变进度行为。
- 不把 reducer 的旧 source 模型迁入当前 source transaction；语义不兼容会扩大风险。
