---
doc_type: refactor-scan
refactor: 2026-07-16-home-section-orchestration
status: user-reviewed
scope: useHomeData 初载、重试与 tertiary idle 的 section 执行编排
summary: 1 条结构优化，中风险 1 条
---

# home section orchestration scan

## 总览

- 扫描范围：`src/hooks/useHomeData.ts`、`src/hooks/useHomeData.test.ts`。
- 发现 1 条优化点：结构 1 / 性能 0 / 可读性 0。
- 按风险：低 0 / 中 1 / 高 0。
- 建议先做：#1，先补 section 映射、独立提交和取消刻画测试，再统一执行器。
- 建议慎做 / 后做：`HomeData` / SSR loaded-success contract、`getHomeDataAvailability()` 和导出 `patchHomeData()` 留给 finding #6 后续决策。
- 前置检查：关键路径已有 16 个 Hook 测试；范围 2 文件、无公开接口变更、无生成代码或风格项。该条来自第五轮审计已确认 finding，不继续扩展候选。
- 用户放行依据：会话要求去掉多轮补丁冗余，并在每阶段提交后继续处理首页。

## 条目

### #1 统一 section 开始、加载与提交原语 ✓

- **位置**：`src/hooks/useHomeData.ts:90-329`
- **分类**：结构
- **现状**：重试由 `loadSingleSection()` 分派；初载与 tertiary idle 在 effect 内再次手写 critical、secondary、tertiary 的 begin/load/apply/catch。
- **问题**：四区块的 loader、缺失结果、错误收尾和取消门禁分散在 3 条入口；TV/综艺 batch 规则与单区 retry 需要同步维护。
- **建议**：建立 Hook 私有 `executeSections()`，统一 begin/load/apply；入口只负责选择 section、持有 controller/generation 和决定 immediate/idle 顺序。
- **建议映射的方法**：M-L2-01 Extract Function
- **风险**：中；异步 settle 顺序与取消语义必须保持，错误实现会让 critical 等待慢 secondary 或旧响应写回。
- **验证**：AI 自证（重构前后 Hook 定向测试、目标 ESLint、typecheck、全量 Jest、build）。
- **范围**：约 120 行重排 / 2 文件。
