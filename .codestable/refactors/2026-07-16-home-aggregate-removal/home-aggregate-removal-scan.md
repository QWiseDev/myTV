---
doc_type: refactor-scan
refactor: 2026-07-16-home-aggregate-removal
status: user-reviewed
scope: 首页 incomplete snapshot 补载与服务端完整聚合缓存链
summary: 2 条结构/异步优化，中风险 2 条
---

# home aggregate removal scan

## 总览

- 扫描范围：`useHomeData`、home data client/server/loader、`/api/home` 及对应测试。
- 发现 2 条优化点：结构 1 / 性能 1 / 可读性 0。
- 按风险：低 0 / 中 2 / 高 0。
- 建议先做：#1 固化 empty/StrictMode 调用次数，再做 #2 删除失去正常消费者的完整聚合链。
- 建议慎做：不采用 SSR 后 detached 预热，避免与客户端重复抓上游。
- 前置检查：关键路径有 hook/server/loader 测试；仓内无 `/api/home` 第二消费者或公开文档契约；范围由 finding #6 锁定。
- 用户放行依据：会话要求“去掉多次优化导致的代码冗余，过于复杂的多次补丁可以重构开发”并要求提交后继续首页。

## 条目

### #1 统一 incomplete snapshot 的分项补载 ✓

- **位置**：`src/hooks/useHomeData.ts:310-329`
- **分类**：性能
- **现状**：有 critical 时直接分项补载；无 critical 时先请求完整 `/api/home`，形成两套时序和 StrictMode 去重语义。
- **问题**：同一 incomplete 状态按电影是否成功分叉；空首屏在 StrictMode 可启动 2 次 aggregate mock 调用，Bangumi 仍可能扣留 TV/综艺。
- **建议**：所有 incomplete snapshot 先经过同一个可取消微任务，再按缺失区块并发加载；Bangumi 保持 idle。
- **建议映射的方法**：M-L4-06 Async & Cancellation
- **风险**：中；改变内部请求拓扑，但不改变页面数据、loading、错误和重试契约。
- **验证**：AI 自证（hook 时序/调用次数测试、浏览器 Network）。
- **范围**：约 35 行 / 2 文件。

### #2 删除无正常消费者的完整聚合链 ✓

- **位置**：`src/lib/home-data.server.ts`、`src/lib/home-data-loader.ts`、`src/app/api/home/`
- **分类**：结构
- **现状**：项目维护 full/initial 双 inflight、memory/Redis/CDN/client 四层缓存、aggregate timeout 和独立 route；正常首页成功路径均不消费。
- **问题**：约 700 行源码与测试只服务 critical 失败兜底，并与分项 loader 重复实现 TV、综艺、Bangumi 获取和缓存语义。
- **建议**：删除内部 aggregate route/cache/loader，服务端只保留 SSR critical memory + singleflight，客户端统一复用分项 loader。
- **建议映射的方法**：M-L3-07 Single Responsibility Split
- **风险**：中；`/api/home` 虽无仓内/文档消费者，但未知仓外私有调用会收到 404。
- **验证**：AI 自证（符号零残留、server/loader/page 测试、typecheck/build）。
- **范围**：约 900 行删除或改写 / 13 个源码与测试文件。
