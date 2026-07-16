---
doc_type: refactor-design
refactor: 2026-07-16-home-aggregate-removal
status: approved
scope: 首页完整聚合双路径删除与 incomplete 分项加载统一
summary: 用既有分项 loader 替换内部 aggregate 兜底并收口服务端 SSR 职责
---

# home aggregate removal refactor design

## 1. 本次范围

- 执行 scan #1、#2。
- 保留 SSR 热门电影、客户端分项 loading/error/retry、Bangumi idle 顺序和追更调度。
- 删除无仓内或文档消费者的 `/api/home`；不新增预热、cron、Redis 锁、配置项或兼容层。
- 总风险：中；页面可见契约不变，内部请求入口减少为一套。

## 2. 前置依赖

- 先用测试复现空 initial 仍调用 aggregate、StrictMode 调用两次。
- 搜索 README/docs/scripts/src，确认 `/api/home` 只有一个内部消费者。
- 保留 server critical 的 timeout、singleflight、非空缓存和 clear generation 测试。

## 3. 执行顺序

### 步骤 1：固化 empty 与 StrictMode 请求时序

- 引用方法：M-L1-04 Characterization Test
- 具体操作：新增空首屏直拉各区块、Bangumi idle、StrictMode 每批一次测试；旧实现先红。
- 退出信号：失败点只指向 aggregate 仍被调用。
- 验证责任：AI 自证。
- 回滚：删除新增测试。

### 步骤 2：统一客户端 incomplete fallback

- 引用方法：M-L4-06 Async & Cancellation
- 具体操作：把可取消微任务前移到所有 incomplete snapshot，删除 aggregate merge 分支。
- 退出信号：empty、critical-only、StrictMode、旧响应隔离与单区错误测试通过。
- 验证责任：AI 自证。
- 回滚：恢复 aggregate 条件分支。

### 步骤 3：收口服务端与 loader 职责

- 引用方法：M-L3-07 Single Responsibility Split
- 具体操作：删除完整聚合 cache/route/client loader；server 只保留 critical memory/singleflight，并复用共享 abortable timeout。
- 退出信号：aggregate 符号零残留，server/loader/page 测试与 typecheck 通过。
- 验证责任：AI 自证。
- 回滚：恢复本步骤删除文件与函数。

### 步骤 4：完整回归与运行态复验

- 引用方法：M-L1-04 Characterization Test
- 具体操作：全量 Jest、目标 ESLint、typecheck、build、SSH Redis 环境与浏览器首页 Network/console 验收。
- 退出信号：首页四区块正常、无 `/api/home`、TV/综艺不等待 Bangumi、无新增 console error。
- 验证责任：AI 自证。
- 回滚：按步骤 3、2 逆序恢复。

## 4. 风险与看点

- 未知仓外 `/api/home` 调用方会收到 404；仓库内该 route 未文档化且受认证 middleware 保护。
- 不把完整缓存改造成后台预热；否则首个访问会重复请求 secondary/tertiary。
- 不改 partial `initialData` 的 prop merge 语义，不扩大到下一专项。
