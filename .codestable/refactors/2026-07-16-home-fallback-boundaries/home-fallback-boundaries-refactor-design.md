---
doc_type: refactor-design
refactor: 2026-07-16-home-fallback-boundaries
status: approved
scope: 首页数据 fallback 所有权与 Suspense 边界
summary: 固化当前行为后删除重复 settled、catch、Suspense 和 lazy 包装
---

# home fallback boundaries refactor design

## 1. 本次范围

- 执行 scan #1、#2、#3。
- 不改 timeout 数值、请求启动时点、缓存条件、数据合并顺序或 loading 文案。
- Bangumi 阻塞 `/api/home` 8 秒的问题另走 performance issue。
- 总风险：中；主要风险在客户端边界收口，数据返回契约保持不变。

## 2. 前置依赖

- 为 loader 的 never-reject、secondary 混合结果、tertiary fallback 补 characterization tests。
- 为 HomeTabContent lazy pending 隔离、Bangumi/Favorites 可见行为补组件测试。
- 已搜索首页直接依赖图，确认保留真实 lazy 组件的最近 `Suspense`。

## 3. 执行顺序

### 步骤 1：固化错误与渲染边界行为

- 引用方法：M-L1-04 Characterization Test
- 具体操作：补 loader 和组件测试，先在旧实现上通过。
- 退出信号：新增测试在改动前后均通过。
- 验证责任：AI 自证
- 回滚：删除本步骤新增测试。

### 步骤 2：收口数据 fallback 所有权

- 引用方法：M-L2-02 Inline Function
- 具体操作：删除 loader 的 settled 结果拆包和 hook 的重复 API catch，保留独立任务隔离与 loading finally。
- 退出信号：loader/hook 定向测试与 typecheck 通过。
- 验证责任：AI 自证
- 回滚：恢复 settled/catch 包装。

### 步骤 3：收口首页 Suspense 所有权

- 引用方法：M-L2-02 Inline Function
- 具体操作：删除同步 `Suspense`，将重复 lazy 的首页基础组件改为静态导入；保留真实 lazy 的局部边界。
- 退出信号：首页组件测试通过，生产构建成功。
- 验证责任：AI 自证 + 最终真实页面复验
- 回滚：恢复对应局部边界和 lazy import。

### 步骤 4：完整回归与运行态复验

- 引用方法：M-L1-04 Characterization Test
- 具体操作：运行 Jest、ESLint、typecheck、build，并通过现有 SSH Redis 隧道复验登录首页。
- 退出信号：门禁结果与改动前一致；热门电影首屏仍渲染，页面无新增运行时错误。
- 验证责任：AI 自证
- 回滚：按步骤 3、2 逆序恢复。

## 4. 风险与看点

- 不删除 `useHomeData` 中隔离 critical/secondary 的 `Promise.allSettled()`。
- 不删除 tertiary fire-and-forget 的 `.catch()` 与各 loading `finally`。
- 不删除 ContinueWatching、FavoritesSection、Telegram、AI modal、SlotMachine 的真实 lazy 边界。
- 数据 loading skeleton 与模块加载 fallback 是不同职责，本轮只删除后者中的重复层。
