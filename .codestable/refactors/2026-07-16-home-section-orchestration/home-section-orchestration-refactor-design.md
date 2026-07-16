---
doc_type: refactor-design
refactor: 2026-07-16-home-section-orchestration
status: approved
scope: useHomeData 缺失 section 的统一执行编排
summary: 让初载、重试和 tertiary idle 共用唯一 section 执行器
---

# home section orchestration refactor design

## 1. 本次范围

- 执行 scan #1。
- 只统一 `useHomeData` 内部 begin → load → apply/catch；保留 controller、generation、retry 去重和 idle 生命周期所有权。
- 保留 #8 顺序：StrictMode 微任务门禁 → 追更调度 → fallback。
- 不改 SSR 初值、空数组 availability、loading/error 对外形状、loader 导出和 `patchHomeData()`。
- 总风险：中；外部结果不变，主要风险是异步提交顺序和取消竞态。

## 2. 前置依赖

- 补 TV、综艺、tertiary retry 到 loader/flags/data-key 的刻画测试。
- 补 critical 在慢 secondary 未完成时先提交的测试。
- 补 secondary 缺失结果/整体 rejection 的 section 隔离测试。
- 补 retry 在 initialData 切换时 abort 且晚到结果不覆盖新 generation 的测试。

## 3. 执行顺序

### 步骤 1：固化 section 编排边界

- 引用方法：M-L1-04 Characterization Test
- 具体操作：新增 retry 映射、独立 settle、错误隔离和 retry 取消测试，在旧实现上先通过。
- 退出信号：定向 Hook 测试全部通过，新增断言不依赖实现细节之外的调用顺序。
- 验证责任：AI 自证。
- 回滚：删除新增测试。

### 步骤 2：建立统一 section 执行器

- 引用方法：M-L2-01 Extract Function
- 具体操作：新增 Hook 私有 `executeSections(sections, signal, isCurrent)`；统一 begin、critical/tertiary 单区 loader、TV/综艺 batch、缺失结果和 rejection 提交。
- 退出信号：各 loader 只在执行器中分派，单区结果 resolve 时立即 apply，不做整批统一提交。
- 验证责任：AI 自证。
- 回滚：恢复 `loadSingleSection()` 与各入口分派。

### 步骤 3：迁移 retry、initial 与 tertiary idle

- 引用方法：M-L4-06 Async & Cancellation
- 具体操作：retry 继续持有自己的 controller/generation；effect 继续持有全局 controller 和 idle cancel，只把 section 列表交给执行器。
- 退出信号：StrictMode、stale response、unmount abort、#8 追更提前调度和 tertiary idle 测试全部通过。
- 验证责任：AI 自证。
- 回滚：逐入口恢复原分派。

### 步骤 4：完整回归

- 引用方法：M-L1-04 Characterization Test
- 具体操作：目标 Jest/ESLint、typecheck、全量 Jest、build、文档格式、YAML 和 diff check。
- 退出信号：完整门禁通过，变更仅限 Hook、测试、finding/index 与本 refactor 记录。
- 验证责任：AI 自证。
- 回滚：整体 revert 本次独立提交。

## 4. 风险与看点

- `executeSections()` 不创建 AbortController，也不修改 generation；生命周期仍由调用方负责。
- TV/综艺同时请求时必须只调用一次 `loadSecondaryData()`。
- critical/tertiary 的结果不能等慢 secondary 后统一 apply。
- 不把 finding #6 的 loaded/success 或成功空数组语义写入 descriptor。
