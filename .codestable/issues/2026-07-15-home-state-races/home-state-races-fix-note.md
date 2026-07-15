---
doc_type: issue-fix
issue: 2026-07-15-home-state-races
path: fast-track
fix_date: 2026-07-15
tags: [home, concurrency, pagination, fallback]
---

# 首页状态竞态与数据边界修复记录

## 1. 问题描述

首页多轮分页、缓存和卡片优化后出现一组相互关联的状态正确性问题：首刷与 append 交叠会卡住“加载更多”或让旧请求回写；clear-all 后在途请求可能重新填回记录；TV/综艺共用 availability/loading 会覆盖已有数据；Bangumi 异常响应可能进入组件；第二页继续观看进入播放页后缺少当前记录；收藏补全期间的新事件可能被旧结果覆盖。另有 image-proxy 测试常量漂移，以及 `VideoCard` 按卡监听/ActionSheet 和收藏查询 stale result 问题。

## 2. 根因

- `usePlaybackRecords` 的首刷和 append 共用 generation，却分别拥有不同 loading/游标状态；旧 success/catch/finally 与 clear-all 缺少一致的失效规则。
- 首页把 TV/综艺压成一个 secondary 完整性布尔值和 loading，fallback 无法表达“只缺其中一项”。
- Bangumi 客户端直接透传 JSON，没有在 HTTP/数据类型边界归一化。
- 播放页 Provider 首批只 include 追更 key，没有 include 当前 route 的 `source+id`。
- 收藏补全用“正在处理则 return”的互斥方式，丢失期间到达的 latest payload；卡片收藏初始查询也没有版本校验，可能覆盖更新事件。
- `VideoCard` 每实例注册图片代理监听并常驻关闭的 ActionSheet；image-proxy 生产并发值调整后测试基线未同步。

## 3. 修复方案

- 分离首刷与 append generation/loading 所有权；首刷立即 supersede 旧 append，静默首刷期间拒绝新 append，所有 success/catch/finally 按 identity 提交；clear-all 同时失效在途首刷/append并清空 refs、游标和 loading。
- 拆分 TV/综艺 availability 与 loading，只请求并 patch 缺失 section，保留已有有效数据。
- Bangumi 网络与缓存结果统一检查/归一化为数组。
- 播放页首批记录合并当前 route key 与追更 priority keys。
- 收藏补全改为 latest-pending 循环；旧补全不覆盖新 payload，失败期间的新 payload 继续处理。卡片收藏查询增加 revision 校验，旧查询不覆盖较新的 `favoritesUpdated`。
- 图片代理配置改为全页共享订阅，ActionSheet 首次打开后才挂载；image-proxy 测试并发基线同步为 6。

## 4. 改动文件清单

- `src/hooks/usePlaybackRecords.ts`
- `src/hooks/usePlaybackRecords.test.ts`
- `src/hooks/useFavoriteItems.ts`
- `src/hooks/useFavoriteItems.test.ts`
- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`
- `src/lib/home-data-types.ts`
- `src/lib/home-data-types.test.ts`
- `src/lib/home-data-client.ts`
- `src/lib/home-data-client.test.ts`
- `src/lib/home-data-loader.ts`
- `src/lib/home-data-loader.test.ts`
- `src/lib/bangumi.client.ts`
- `src/lib/bangumi.client.test.ts`
- `src/components/HomeTabContent.tsx`
- `src/components/HomeTabContent.test.tsx`
- `src/components/VideoCard.tsx`
- `src/components/VideoCard.test.tsx`
- `src/contexts/PlayPageContext.tsx`
- `src/contexts/PlayPageContext.test.tsx`
- `src/app/play/page.tsx`
- `src/app/api/image-proxy/route.test.ts`
- `.codestable/audits/2026-07-15-home-deep-review/`

## 5. 验证结果

- 已知阶段性结果：首页相关分组 9 个 suites / 30 个 tests 通过。
- `useFavoriteItems.test.ts` 5 个 tests 通过；`usePlaybackRecords.test.ts` 的分页交叠定向用例曾独立通过。
- 最新 `VideoCard.test.tsx` 10 个 tests、目标 ESLint 与 typecheck 通过，覆盖共享 listener、按需 ActionSheet 和旧收藏查询不覆盖新事件。
- 当前测试文件还包含 stale first-page catch、clear-all 在途首刷/append、部分 secondary 成功、Bangumi 非 ok/非数组和 route key include 等回归场景。
- `pnpm exec jest --runInBand`：62 suites / 252 tests 全部通过。
- `pnpm typecheck`、`pnpm build`、本轮全部 TS/TSX 文件的 `eslint --max-warnings=0`、`git diff --check`：通过。
- `pnpm lint:strict`：被 147 条仓库既有 warning 阻断；`pnpm format:check`：被全仓历史格式债务阻断。本轮新增测试与 CodeStable 文档已单独通过 Prettier。
- 本地生产包浏览器冒烟到认证边界通过；无本地登录态，未完成登录后首页目视验收。

## 6. 遗留事项

- 冷缓存 SSR 仍等待低优先级数据，需单独设计总预算和部分聚合缓存策略。
- `VideoCard` 仍保留按实例 props 镜像 state、普通收藏/搜索收藏两套 hook、逐卡 `favoritesUpdated` 订阅；打开过菜单的卡片也仍各自保留 ActionSheet。本轮已关闭收藏 stale result，但未完成纯展示卡/交互卡职责拆分。
- 首页 `withTimeout` / `allSettled` / 聚合 catch / Suspense 层级尚未确定单一所有者。
- 未经用户授权，不提交、不推送。
