---
doc_type: refactor-scan
refactor: 2026-07-16-playback-state-cleanup
status: user-reviewed
scope: 播放器 ended 事件注册与 usePlayerState 的 source/favorite 死状态分支
summary: 2 条结构优化，低风险 1 条、中风险 1 条
---

# playback state cleanup scan

## 总览

- 扫描范围：`usePlayerInitializer.ts` 的 ended 事件段、`usePlayerInitializer.test.ts` 对应 harness、`usePlayerState.ts`、`page.tsx` 初始化参数与 `types/index.ts` 遗留类型，约 460 行定向代码。
- 发现 2 条优化点：结构 2 / 性能 0 / 可读性 0。
- 按风险：低 1 / 中 1 / 高 0。
- 建议先做：#1 先固化两个 ended handler 的顺序与去重语义，再合并注册；#2 通过全仓零引用证据删除 reducer 死分支。
- 建议慎做 / 后做：不继续拆分 `page.tsx` / initializer，不统一 loading、source transaction 或 progress writer；这些仍属于 finding-08 后续批次。
- 前置检查：目标改动是行为等价清理；ended 路径已有 Hook 测试并补专项刻画；source/favorite 分支生产读写为 0，真实 owner 已有 source switch/favorite 测试；定向范围未超过 3000 行。
- 用户放行依据：会话明确要求去掉多轮补丁冗余、允许重构，并要求本阶段提交后继续首页。

## 条目

### #1 合并两个 video:ended 监听 ✓

- **位置**：`src/app/play/hooks/usePlayerInitializer.ts:898-930`、原第二监听约 `1089-1118`
- **分类**：结构
- **现状**：同一 ArtPlayer 实例按注册顺序执行两个 `video:ended` handler；第一条释放 Wake Lock/上报 100%，第二条处理 SkipController 去重与延迟自动下一集。
- **问题**：同一事件的一个业务事务被拆到两个相距约 190 行的监听器；测试 harness 只保存同名最后一个 handler，无法覆盖第一条副作用。
- **建议**：用单个具名 handler 保留 release → analytics → 再次校验 active player → 去重/换集的原顺序，并让测试 harness 支持真实的同名 handler 列表。
- **建议映射的方法**：M-L1-04 Characterization Test、M-L2-01 Extract Function
- **风险**：中；合并时若移动 active-player 校验或 handled 早退，会改变旧播放器和重复 ended 的行为。
- **验证**：AI 自证（重复 ended、SkipController、analytics 后失活、最后一集 4 条测试；initializer/source 测试、ESLint、typecheck、全量 Jest、build）。
- **范围**：约 110 行 / 2 文件。

### #2 删除 reducer 的 source/favorite 死分支 ✓

- **位置**：`src/app/play/hooks/usePlayerState.ts`、`src/app/play/page.tsx:133-181`、`src/app/play/types/index.ts:131-145`
- **分类**：结构
- **现状**：reducer 仍声明 `sources`、`favorite` state、6 个 action creator 和两组遗留类型；页面实际使用 `state.video.source + availableSources` 与 `useFavorite()`。
- **问题**：production 中这些 reducer 字段/action 零读写；`PlaySource[] + numeric currentIndex` 与当前 `SearchResult[] + source/id` identity 不一致，形成两套看似可写的 owner。
- **建议**：删除未采用的 state/action/default/case/action creator、无效初始化参数和只服务该分支的类型；不迁移现有 owner。
- **建议映射的方法**：M-L3-03 State Lifting / Lowering
- **风险**：低；唯一风险是遗漏动态 dispatch 或 `batchUpdate` 调用，已通过全仓 production 搜索排除。
- **验证**：AI 自证（旧字段/action/type 零引用、source initialization/switch 与 favorite 相关回归、ESLint、typecheck、全量 Jest、build）。
- **范围**：约 115 行删除 / 3 文件。
