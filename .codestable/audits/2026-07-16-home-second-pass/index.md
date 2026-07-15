---
doc_type: audit-index
audit: 2026-07-16-home-second-pass
scope: 首页组件、收藏夹、继续观看、Bangumi 与首页数据 Hook 的第二轮复核
created: 2026-07-16
status: active
total_findings: 8
---

# home-second-pass 审计报告

## 范围

在 `2026-07-15-home-deep-review` 的 9 条 finding 全部解决后，重新扫描首页直接链路：

- `src/components/HomeClient.tsx`、`HomeTabContent.tsx`、`ContinueWatching.tsx`、`FavoritesSection.tsx`、`BangumiSection.tsx`、`ScrollableRow.tsx`、`AnimatedCardGrid.tsx`
- `src/hooks/useHomeData.ts`、`useFavoriteItems.ts`、`useWatchingUpdatesRefresh.ts`
- 对应测试、`Dockerfile`，以及 `136.175.83.3` 上 `mytv-core` 的只读运行态时区

不扩到搜索页、播放内核和已明确接受为观察项的聚合缓存粒度。

## 总评

共发现 8 条：3 条 P1、5 条 P2；其中 5 条 bug、3 条 performance。Bangumi 跨日错误与继续观看加载更多整行重挂已解决；当前剩余 P1 是播放记录未决时重复分配图片 priority。收藏夹还存在伪空态、异步任务越过生命周期和清空失败未处理问题。

未发现新的安全问题。`.codestable/architecture/ARCHITECTURE.md` 仍是骨架，因此本轮不产 `arch-drift` finding。

## 发现清单

| #   | 性质        | 严重度 | 置信度 | 标题                                           | 文件                           |
| --- | ----------- | ------ | ------ | ---------------------------------------------- | ------------------------------ |
| 1   | bug         | P1     | high   | Bangumi 按运行时本地日期选择会产生水合跨日错误 | [finding-01.md](finding-01.md) |
| 2   | performance | P1     | high   | 继续观看从 12 增至 13 条会整行卸载重挂         | [finding-02.md](finding-02.md) |
| 3   | performance | P1     | high   | 播放记录未决时会先后启动两组 priority 图片     | [finding-03.md](finding-03.md) |
| 4   | bug         | P2     | high   | 收藏首次加载与失败都会被误显示为真实空态       | [finding-04.md](finding-04.md) |
| 5   | bug         | P2     | high   | 收藏补全任务可越过 tab 与组件生命周期          | [finding-05.md](finding-05.md) |
| 6   | performance | P2     | high   | 追更 idle 检查丢失取消句柄                     | [finding-06.md](finding-06.md) |
| 7   | bug         | P2     | medium | 新 initialData 不会同步到现有首页 state        | [finding-07.md](finding-07.md) |
| 8   | bug         | P2     | high   | 清空收藏失败会形成未处理 Promise rejection     | [finding-08.md](finding-08.md) |

## 按维度分布

| 性质            | P0    | P1    | P2    | 合计  |
| --------------- | ----- | ----- | ----- | ----- |
| bug             | 0     | 1     | 4     | 5     |
| security        | 0     | 0     | 0     | 0     |
| performance     | 0     | 2     | 1     | 3     |
| maintainability | 0     | 0     | 0     | 0     |
| arch-drift      | 0     | 0     | 0     | 0     |
| **合计**        | **0** | **3** | **5** | **8** |

## 运行态与测试证据

- 2026-07-16 02:15（Asia/Shanghai）只读核实：本地为 `CST +0800` 周四，生产 `mytv-core` 为 `UTC +0000` 周三，容器没有 `TZ` 环境变量。
- UI 定向基线 3 suites / 7 tests、数据链路定向基线 10 suites / 56 tests 通过，但均未覆盖本轮列出的阈值切树、跨时区、prop 刷新、失败与卸载竞态。
- 上一阶段全量门禁仍为 68 suites / 291 tests、typecheck 与 production build 通过；本轮审计阶段未修改源码。

## 修复进展

- **#1 resolved**：Bangumi weekday 改为显式 `Asia/Shanghai` 契约，并移除会锁住旧日期的 memo；全量 Jest 更新为 68 suites / 293 tests，typecheck 与 production build 通过。
- **#2 resolved**：继续观看分页前后保持同一个动画容器；12→13 条不再切换父结构。全量 Jest 更新为 69 suites / 294 tests。
- **其余 6 条 open**：继续按严重度和同域边界分阶段处理。

## 下一步建议

- **P1 继续处理**：#3 走 `cs-refactor`，独立验证和提交。
- **P2 按同域收口**：#4、#5、#8 合并为收藏夹可靠性阶段；#6 独立收回 idle 任务所有权；#7 补 `router.refresh`/prop rerender 回归后修复。
- 聚合缓存“完整才缓存”的故障隔离粒度已在上一轮明确列为运行数据观察项，本轮没有新证据证明应立即扩大为分区缓存重构，因此不重复立项。
