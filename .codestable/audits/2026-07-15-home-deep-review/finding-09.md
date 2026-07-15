---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: maintainability-09
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 09：首页 fallback 与 Suspense 层级重复

## 速答

首页数据层已把超时和异常转换为 fallback，但上层仍保留多层不可达 catch/allSettled；UI 也给不会 suspend 的同步组件套了多层 `Suspense`。

## 关键证据

- `src/lib/promise-timeout.ts:28-48` — `withTimeout()` 对超时和 rejection 都 resolve fallback。
- `src/lib/home-data-loader.ts:105-147` — secondary/tertiary 又对已 fallback 的 Promise 使用 `Promise.allSettled`。
- `src/lib/home-data-loader.ts:59-75` — `/api/home` 客户端加载已吞掉 fetch/解析异常并返回空数据。
- `src/hooks/useHomeData.ts:181-197` — 上层仍保留基本不可达的聚合加载 catch。
- `src/components/HomeTabContent.tsx:89-138` — 多个同步 `LazyVideoSection` 外仍包 `Suspense`。
- `src/components/BangumiSection.tsx:15-16` — 首页已静态加载相同模块后，又对 `ScrollableRow`/`VideoCard` 做重复 lazy 边界。

## 影响

错误所有权不清，维护者难以判断哪一层负责重试/降级；重复边界增加代码和挂载路径，但没有相应行为收益。

## 修复方向

在 characterization tests 到位后，确定单一错误/fallback 所有者并删除不可达层；只保留真实动态 import 的 Suspense 边界。

## 本轮进展（2026-07-15）

TV/综艺 availability、loading 和按需 patch 已拆开，Bangumi 边界也统一在客户端归一化，减少了部分错误所有权混淆；相关 characterization tests 已补。但 `withTimeout()` 外的 `Promise.allSettled`、聚合加载 catch 以及不会真实 suspend 的多层 UI 边界尚未系统删除，finding 保持 open。

## 完成记录（2026-07-16）

- secondary/tertiary 已删除 `withTimeout()` 外重复的 settled 结果拆包，并通过 characterization test 保留 tertiary 失败时的真实 `undefined` 契约。
- `loadHomeDataFromApi()` 的 never-reject 契约已由 fetch/JSON/非 2xx 测试固化，hook 外不可达 catch 已删除。
- 首页 5 个同步 `Suspense` 已删除；Bangumi/Favorites 内已被首页依赖图静态加载的 `ScrollableRow`/`VideoCard` 不再重复 lazy。
- ContinueWatching、FavoritesSection、Telegram、AI modal、SlotMachine 的真实 lazy 局部边界，以及数据 loading skeleton 均保留。
- 全量 Jest、类型检查、生产构建、变更文件 lint/format 与真实浏览器首页/收藏夹切换均通过，finding 关闭。
- Bangumi 失败导致 `/api/home` 等待 8 秒属于独立性能策略，不混入本次行为等价重构。

## 建议动作

`cs-refactor`，因为这是行为等价的加载与错误边界收敛。
