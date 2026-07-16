---
doc_type: refactor-apply-notes
refactor: 2026-07-16-home-aggregate-removal
---

# home aggregate removal apply notes

## 步骤 1：固化 empty 与 StrictMode 请求时序

- 完成时间：2026-07-16
- 改动文件：`src/hooks/useHomeData.test.ts`
- 验证结果：旧实现定向 Jest 12/14 通过；2 个新增测试分别证明空 initial 仍调用 aggregate 1 次、StrictMode 调用 2 次。
- 偏离：无。

## 步骤 2：统一客户端 incomplete fallback

- 完成时间：2026-07-16
- 改动文件：`src/hooks/useHomeData.ts`、`src/hooks/useHomeData.test.ts`
- 验证结果：所有 incomplete snapshot 共用微任务取消门禁与分项 loader；空首屏、critical-only、StrictMode、单区错误和 retry 测试通过。
- 偏离：无。

## 步骤 3：收口服务端与 loader 职责

- 完成时间：2026-07-16
- 改动文件：home data server/client/loader/types/constants、`src/app/api/home/` 及对应测试。
- 验证结果：删除 full/initial 双路径、Redis/CDN/client aggregate cache 和 route；定向 Jest 6 suites / 35 tests、目标 ESLint、符号零残留与 typecheck 通过。
- 偏离：服务端 critical timeout 改为复用 `promise-timeout.ts` 的真实 deadline/abort，避免上游忽略 abort 时本地 Promise 继续悬挂。

## 步骤 4：完整回归与运行态复验

- 完成时间：2026-07-16
- 改动文件：无新增运行时代码改动。
- 验证结果：
  - 全量 Jest：79 suites / 381 tests 通过。
  - `pnpm typecheck` 与 `pnpm build` 通过；build 路由清单中不再存在 `/api/home`。
  - 本次变更文件 ESLint `--max-warnings=0`、Prettier、`git diff --check` 通过；全仓 `lint:strict` 仍为历史基线 145 warnings、0 errors。
  - SSH 本地隧道下 Redis `PING=PONG`，未修改 `.env`、未开放公网 6379。
  - 浏览器首页继续观看、热门电影、热门剧集、新番放送、热门综艺均可见；60 张图片无坏图；收藏夹切换和返回首页正常；console 0 error / 0 warning；资源记录中 `/api/home` 为 0。
- 偏离：本地生产进程在继续观看详情兜底中记录第三方源 `ECONNRESET`，未影响首页区块、图片或浏览器 console，且与本次 aggregate 删除无关。
