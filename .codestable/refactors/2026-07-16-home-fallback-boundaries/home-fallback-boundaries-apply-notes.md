---
doc_type: refactor-apply-notes
refactor: 2026-07-16-home-fallback-boundaries
---

# home fallback boundaries apply notes

## 步骤 1: 固化错误与渲染边界行为

- 完成时间: 2026-07-16
- 改动文件:
  - `src/lib/promise-timeout.test.ts`
  - `src/lib/home-data-loader.test.ts`
  - `src/components/HomeTabContent.test.tsx`
  - `src/components/BangumiSection.test.tsx`
  - `src/components/FavoritesSection.test.tsx`
- 验证结果: 改业务代码前定向 Jest 通过，6 suites / 19 tests。
- 偏离: characterization test 证明 tertiary rejection 的现有 loader 返回值是 `undefined`，不是 `[]`；后续重构按真实契约保留 `undefined`。

## 步骤 2: 收口数据 fallback 所有权

- 完成时间: 2026-07-16
- 改动文件:
  - `src/lib/home-data-loader.ts`
  - `src/hooks/useHomeData.ts`
- 验证结果: 定向 Jest 通过，6 suites / 19 tests；`pnpm typecheck` 通过。
- 偏离: 未删除 hook 中独立任务的 `Promise.allSettled()`、fallback 编排 catch、tertiary rejection sink 和 loading finally，它们仍有实际职责。

## 步骤 3: 收口首页 Suspense 所有权

- 完成时间: 2026-07-16
- 改动文件:
  - `src/components/HomeClient.tsx`
  - `src/components/HomeTabContent.tsx`
  - `src/components/BangumiSection.tsx`
  - `src/components/FavoritesSection.tsx`
- 验证结果: 删除同步边界并静态化重复 lazy 后，组件定向测试、目标 ESLint、Prettier、typecheck 与 production build 均通过。
- 偏离: 无；ContinueWatching、FavoritesSection、Telegram、AI modal、SlotMachine 的真实 lazy 局部边界均保留。

## 步骤 4: 完整回归与运行态复验

- 完成时间: 2026-07-16
- 改动文件: 无新增代码改动
- 验证结果:
  - 全量 Jest：67 suites / 284 tests 通过。
  - `pnpm typecheck` 通过。
  - `pnpm build` 通过；构建期仍输出本地 `.env` 直连远端 Redis 的历史 `ECONNREFUSED` 日志，但最终退出码为 0。
  - 变更文件 ESLint `--max-warnings=0` 与 Prettier 通过。
  - 全仓 `pnpm lint:strict` 仍为历史基线 147 warnings、0 errors；本次变更文件无新增 warning。
  - SSH Redis 隧道下真实首页 `HTTP 200`，TTFB `0.207s`、总耗时 `0.998s`，SSR HTML 包含“热门电影”。
  - 浏览器登录后首页四区块可见，收藏夹切换与返回正常，console 无 warning/error。
- 偏离: 无。
