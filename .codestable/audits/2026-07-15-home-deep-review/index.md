---
doc_type: audit-index
audit: 2026-07-15-home-deep-review
scope: 首页入口、聚合数据、继续观看、收藏夹、Bangumi、横滑卡片及其与播放页续播的直接链路
created: 2026-07-15
status: active
total_findings: 9
---

# home-deep-review 审计报告

## 范围

本次按真实数据流审查首页及其直接下游：

- `src/app/page.tsx`、`src/app/api/home/route.ts`
- `src/lib/home-data.server.ts`、`src/lib/home-data-loader.ts`、`src/lib/home-data-client.ts`、`src/lib/home-data-types.ts`
- `src/components/HomeClient.tsx`、`HomeTabContent.tsx`、`ContinueWatching.tsx`、`FavoritesSection.tsx`、`BangumiSection.tsx`、`ScrollableRow.tsx`、`VideoCard.tsx`
- `src/hooks/useHomeData.ts`、`usePlaybackRecords.ts`、`useFavoriteItems.ts`、`useWatchingUpdatesRefresh.ts`
- 首页继续观看进入 `/play` 后直接依赖的 `PlaybackDataProvider` 与 `usePlayRecordSync`
- 上述链路的现有测试和 2026-06-27 首页审计结果

## 总评

旧首页审计的 7 条修复当前均未回退。本轮对 9 条 finding 完成了定点修复与复核：#1-#6、#8 已解决，#7 为 partially-resolved，#9 保持 open。分页请求交叠、clear-all 在途请求、TV/综艺部分数据覆盖、Bangumi 异常响应、第二页续播缺失、收藏补全丢更新、冷缓存 SSR 阻塞和 image-proxy 测试基线均已收口；`VideoCard` 的图片代理监听、未打开 ActionSheet 成本和收藏查询/事件竞态也已修复。

剩余 1 条 open 与 1 条 partially-resolved 均涉及更大范围的行为等价重构：卡片仍保留较重的按实例状态，首页 fallback/Suspense 所有权仍未完全收敛。审计目录保持 `active`，直到这些 finding 被处理或明确接受。

当前未发现新的明确安全问题；`.codestable/architecture/ARCHITECTURE.md` 仍是骨架，缺少足够依据给出正式 `arch-drift` finding。

## 发现清单

| #   | 状态               | 性质            | 严重度 | 置信度 | 标题                                    | 文件                           |
| --- | ------------------ | --------------- | ------ | ------ | --------------------------------------- | ------------------------------ |
| 1   | resolved           | bug             | P1     | high   | 分页刷新竞态会永久卡住“加载更多”        | [finding-01.md](finding-01.md) |
| 2   | resolved           | bug             | P1     | high   | TV/综艺共用状态会覆盖已有有效数据       | [finding-02.md](finding-02.md) |
| 3   | resolved           | bug             | P1     | high   | Bangumi 非数组响应可直接崩首页          | [finding-03.md](finding-03.md) |
| 4   | resolved           | bug             | P1     | high   | 第二页继续观看进入播放页后可能丢续播    | [finding-04.md](finding-04.md) |
| 5   | resolved           | bug             | P2     | high   | 收藏更新在补全记录时会被丢弃            | [finding-05.md](finding-05.md) |
| 6   | resolved           | performance     | P1     | high   | 冷缓存首屏等待最慢三级数据              | [finding-06.md](finding-06.md) |
| 7   | partially-resolved | performance     | P2     | high   | 每张 VideoCard 都挂载完整状态与全局监听 | [finding-07.md](finding-07.md) |
| 8   | resolved           | maintainability | P2     | high   | image-proxy 并发改动漏同步测试基线      | [finding-08.md](finding-08.md) |
| 9   | open               | maintainability | P2     | high   | 首页 fallback 与 Suspense 层级重复      | [finding-09.md](finding-09.md) |

## 按维度分布

| 性质            | P0    | P1    | P2    | 合计  |
| --------------- | ----- | ----- | ----- | ----- |
| bug             | 0     | 4     | 1     | 5     |
| security        | 0     | 0     | 0     | 0     |
| performance     | 0     | 1     | 1     | 2     |
| maintainability | 0     | 0     | 2     | 2     |
| arch-drift      | 0     | 0     | 0     | 0     |
| **合计**        | **0** | **5** | **4** | **9** |

## 历史审计核对

`2026-06-27-home-review` 的 AI HTML escape、AI 状态判断、AI Modal 条件挂载、服务端请求 abort、旧 Provider 定时器清理、中性 Provider 命名和 storage-key 统一解析仍保持已修。本报告覆盖后续分页与 7 月首页大改后的当前状态，旧 index 已标记 `superseded`。

## 修复进展

| Finding | 状态               | 本轮结果                                                                                                                                                                                                |
| ------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1      | resolved           | 首刷与 append 分离 generation/loading 所有权；首刷会立即 supersede 并解锁旧 append，静默首刷期间禁止新 append；stale success/catch/finally 与 clear-all 在途请求均不再回写。                            |
| #2      | resolved           | TV/综艺拆分 availability 与 loading，按缺失项请求和 patch，不再互相覆盖。                                                                                                                               |
| #3      | resolved           | Bangumi 客户端检查 HTTP 状态，并对缓存和网络响应统一归一化为数组。                                                                                                                                      |
| #4      | resolved           | 播放页 Provider 首批请求显式 include 当前 `source+id`，同时保留追更 priority keys。                                                                                                                     |
| #5      | resolved           | 收藏补全改为处理 latest pending payload；旧补全结果不再覆盖新事件，失败期间的新 payload 仍会继续处理。                                                                                                  |
| #6      | resolved           | SSR 改用独立 initial reader，冷缓存只等待电影；full/initial 共享 critical 去重，DB 增加 500ms deadline，完整结果才进入长期缓存，partial 的服务端/CDN/客户端缓存均已收紧。                               |
| #7      | partially-resolved | 图片代理配置改为全页共享订阅，未打开过的卡片不挂载 `MobileActionSheet`；收藏初始查询也不再覆盖较新的 `favoritesUpdated`。按卡字段镜像、两套收藏 hook、逐卡收藏事件订阅和打开后的独立 ActionSheet 仍在。 |
| #8      | resolved           | image-proxy 测试并发基线已从 12 同步为生产值 6，保留第 N+1 个请求返回 503 的行为断言。                                                                                                                  |
| #9      | open               | TV/综艺错误与 loading 所有权更清晰，Bangumi 边界也已归一化；重复 `allSettled`、聚合 catch 与无真实 suspend 收益的边界尚未删除。                                                                         |

## 验证基线

- 已知阶段性结果：首页相关分组 9 个 suites / 30 个 tests 通过；`useFavoriteItems.test.ts` 5 个 tests 通过；`usePlaybackRecords.test.ts` 的分页交叠定向用例曾独立通过；最新 `VideoCard.test.tsx` 10 个 tests、目标 ESLint 和 typecheck 通过。
- 当前测试已补入请求交叠、静默首刷、stale failure、clear-all 在途首刷/append、部分 secondary 成功、Bangumi 非 ok/非数组、当前路由记录 include 和多卡 listener/ActionSheet 行为。
- image-proxy 的 12/6 常量漂移已修正，旧的“全量 Jest 唯一失败”描述已过期，不再作为当前基线。
- 最终门禁：`pnpm exec jest --runInBand` 通过（64 suites / 271 tests），`pnpm typecheck`、`pnpm build`、本轮全部 TS/TSX 文件的 `eslint --max-warnings=0`、Prettier 与 `git diff --check` 通过。
- 仓库级 `pnpm lint:strict` 仍被 147 条既有 warning 阻断；`pnpm format:check` 仍命中数百个历史未格式化文件。本轮新增测试与 CodeStable 文档已单独通过 Prettier。
- 本地生产包浏览器冒烟确认登录页可渲染、`/` 与 `/play?...` 认证重定向正确且控制台无 error；因无本地登录态且 `.env` 指向的远端 Redis 不可达，未完成登录后首页/播放页目视验收。

## 下一步建议

- **分批继续重构**：#7 先拆纯展示卡与 source-backed 卡；#9 再确定唯一 fallback/error 所有者并删除不可达边界。
- **仓库基线另行治理**：全仓 ESLint warning 与 Prettier 历史债务不属于本轮首页/播放页修复范围。
