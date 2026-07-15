---
doc_type: audit-index
audit: 2026-06-27-home-review
scope: 首页 /home 功能、首页 API 聚合、继续观看、收藏夹、AI 推荐、豆瓣/Bangumi 展示与横向滚动
created: 2026-06-27
status: superseded
superseded-by: 2026-07-15-home-deep-review
total_findings: 7
---

# home-review 审计报告

## 范围

用户要求“针对 /home 里功能挨个进行分析审查，看是否有优化重构的地方”。本次只读扫描范围：

- `src/app/page.tsx`
- `src/app/api/home/route.ts`
- `src/components/HomeClient.tsx`
- `src/hooks/useHomeData.ts`
- `src/lib/home-data.server.ts`
- `src/lib/home-data-loader.ts`
- `src/lib/home-data-types.ts`
- `src/components/HomeTabContent.tsx`
- `src/components/ContinueWatching.tsx`
- `src/components/FavoritesSection.tsx`
- `src/hooks/useFavoriteItems.ts`
- `src/hooks/usePlayRecordActions.ts`
- `src/contexts/PlayPageContext.tsx`
- `src/components/BangumiSection.tsx`
- `src/components/LazyVideoSection.tsx`
- `src/components/ScrollableRow.tsx`
- `src/components/VideoCard.tsx`
- `src/hooks/useAiRecommendStatus.ts`
- `src/components/AIRecommendModal.tsx`
- `src/lib/ai-recommend.client.ts`
- 相关 API 与存储辅助：`src/app/api/ai-recommend/status/route.ts`、`src/app/api/ai-recommend/route.ts`、`src/app/api/playrecords/route.ts`、`src/app/api/favorites/route.ts`、`src/app/api/watching-updates/route.ts`、`src/lib/db.client.ts`

## 总评

首页主体数据链路已经做过不少性能治理：SSR 聚合、客户端分批 fallback、继续观看限量、追更缓存、图片直连 fallback 都有现有测试或实现支撑。当前更值得处理的是三类问题：AI 推荐入口存在一个实际 XSS 风险和两个可见/加载时序问题；首页播放数据 Provider 带有播放页历史包袱；部分数据 key 解析和收藏夹数据补全仍是散落实现。

共发现 7 条：P1 1 条，P2 6 条。没有发现必须立即阻断首页可用性的 P0。

## 处理结果

- [finding-01.md](finding-01.md)：已对 AI 回复内容先做 HTML escape，再追加受控展示标签。
- [finding-02.md](finding-02.md)：已将 AI 状态检查的 401 / 非 ok 响应判定为不可用，并避免默认展示按钮。
- [finding-03.md](finding-03.md)：已改为只在用户打开 AI 弹窗时挂载懒加载组件。
- [finding-04.md](finding-04.md)：已将首页服务端聚合的超时 signal 传入豆瓣与 Bangumi 抓取链路，超时 fallback 时同步 abort 底层请求。
- [finding-05.md](finding-05.md)：已为播放数据上下文的 idle 初始化任务和刷新防抖 timer 增加卸载清理。
- [finding-06.md](finding-06.md)：已将 Provider / hook 改为中性播放数据命名，并删除无实际价值的 no-op 调试和 helper。
- [finding-07.md](finding-07.md)：已新增 `storage-key` 共享工具并替换项目内手写 `source+id` 解析。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | security | P1 | high | AI 回复未经净化直接注入 HTML | [finding-01.md](finding-01.md) |
| 2 | bug | P2 | high | AI 状态检查把 401 当成可用并缓存 | [finding-02.md](finding-02.md) |
| 3 | performance | P2 | high | AI 弹窗并未做到按打开懒加载 | [finding-03.md](finding-03.md) |
| 4 | performance | P2 | medium | 首页服务端超时兜底不取消底层请求 | [finding-04.md](finding-04.md) |
| 5 | bug | P2 | medium | 播放数据 Provider 的定时任务缺少卸载清理 | [finding-05.md](finding-05.md) |
| 6 | maintainability | P2 | high | 首页复用 PlayPageProvider 暴露播放页历史包袱 | [finding-06.md](finding-06.md) |
| 7 | maintainability | P2 | medium | `source+id` 存储 key 解析散落且不一致 | [finding-07.md](finding-07.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 0 | 0 | 2 | 2 |
| security | 0 | 1 | 0 | 1 |
| performance | 0 | 0 | 2 | 2 |
| maintainability | 0 | 0 | 2 | 2 |
| arch-drift | 0 | 0 | 0 | 0 |
| **合计** | **0** | **1** | **6** | **7** |

## 功能逐项结论

- **入口与聚合数据**：`/` 通过 `getServerHomeData()` 做首屏预取，`/api/home` 作为客户端 fallback。主要问题是超时只返回 fallback，不取消真实外部请求。
- **继续观看与追更**：最近记录限量、未看完优先和追更标签已有测试覆盖；需要处理的是 Provider 生命周期和 key 解析散落。
- **收藏夹**：按 tab 懒加载收藏数据，基本合理；但为显示当前集数会读取全部播放记录，后续可并入轻量映射或专用接口。
- **豆瓣热门与 Bangumi**：展示链路清晰，现有 `home-data-types` 与 `home-display` 测试覆盖核心排序/可用性；未发现高优先级问题。
- **横向滚动与卡片**：`ScrollableRow` 和 `VideoCard` 功能完整但成本较高；当前最值得收敛的是 AI 弹窗真正按需加载，而不是先动所有卡片。
- **AI 推荐**：问题最集中，包含 HTML 注入风险、401 状态误判和未打开也加载弹窗。
- **公告、Telegram 欢迎、老虎机浮窗**：本次未发现足以列入 finding 的首页级问题；Telegram 初始密码展示属于既有产品设计边界，如要审安全可单独做登录链路专项。

## 下一步建议

- **优先修 P1**：先处理 [finding-01.md](finding-01.md)，把 AI 回复渲染改为安全渲染。
- **同一小迭代顺手修**：处理 [finding-02.md](finding-02.md) 和 [finding-03.md](finding-03.md)，它们都在 AI 推荐入口，改动边界集中。
- **低风险清理**：处理 [finding-05.md](finding-05.md)、[finding-06.md](finding-06.md)、[finding-07.md](finding-07.md)，把首页播放数据状态拆得更清楚。
- **性能专项**：处理 [finding-04.md](finding-04.md)，需要给服务端抓取链路补 AbortSignal，建议配套测试或压测观察。

## 验证

- `./node_modules/.bin/jest src/lib/ai-recommend.client.test.ts src/hooks/useAiRecommendStatus.test.ts src/lib/storage-key.test.ts src/lib/home-display.test.ts src/lib/home-data-types.test.ts src/lib/video-card-utils.test.ts --runInBand`：通过，6 个测试套件、17 个用例通过。
- `./node_modules/.bin/eslint src/lib/ai-recommend.client.ts src/lib/ai-recommend.client.test.ts src/hooks/useAiRecommendStatus.ts src/hooks/useAiRecommendStatus.test.ts src/components/HomeClient.tsx src/contexts/PlayPageContext.tsx src/app/play/page.tsx src/lib/storage-key.ts src/lib/storage-key.test.ts src/lib/db.ts src/lib/db.client.ts src/components/ContinueWatching.tsx src/hooks/usePlayRecordActions.ts src/hooks/useFavoriteItems.ts src/components/UserMenu.tsx src/app/api/playrecords/route.ts src/app/api/favorites/route.ts src/app/api/skipconfigs/route.ts src/lib/watching-updates.ts src/lib/watching-updates-cache.ts src/app/api/cron/route.ts src/app/api/admin/data_migration/import/route.ts src/lib/redis-base.db.ts src/lib/douban-anti-crawler.ts src/lib/douban.ts src/lib/home-data.server.ts --quiet`：通过。
- `./node_modules/.bin/tsc --noEmit --incremental false`：通过。
- `./node_modules/.bin/jest --runInBand`：通过，32 个测试套件、122 个用例通过。
- `node scripts/generate-manifest.js`：通过。
- `./node_modules/.bin/next build`：通过；构建阶段当前 `.env` 尝试连接 `136.175.83.3:6379` 出现 `ECONNREFUSED` 日志，但未阻断构建。
