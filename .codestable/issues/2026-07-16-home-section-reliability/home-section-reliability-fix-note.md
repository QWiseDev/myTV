---
doc_type: issue-fix
issue: 2026-07-16-home-section-reliability
path: fast-track
fix_date: 2026-07-16
tags: [home, error-state, retry, abort-signal, douban, bangumi]
---

# 首页区块错误重试与请求取消修复记录

## 1. 问题描述

首页聚合与分项 loader 会把 HTTP、网络、解析和超时失败统一转换为成功形状的空数据，四个内容区块因此无法区分真实空态与失败，也没有定点重试入口。原 `withTimeout()` 只提前返回 fallback，不取消底层 Douban/Bangumi 请求，组件重挂或用户重试时可能叠加无效连接与迟到缓存写入。

## 2. 根因

- `/api/home` 异常返回 HTTP 200，客户端聚合 loader 又把非 2xx、网络与解析失败统一归一为空快照。
- 电影、TV、综艺和 Bangumi 的分项结果没有 error 通道，Hook 只能提交空数组并关闭 loading。
- Promise timeout 只忽略迟到结果，没有可供底层 fetch 使用的 abort signal。
- `useHomeData` cleanup 只有布尔 cancelled 门禁，能阻止 state 回写但不能停止网络、delay 或缓存写入。

## 3. 修复方案

- 聚合 route 失败返回 502 + `no-store`；客户端仍把它作为空首屏的 aggregate fallback，再进入分项补载。
- 分项 loader 统一返回 `{ ok: true, data } | { ok: false, error }`，成功空数组保持合法，失败绝不 patch 数据。
- Hook 维护 `critical/tv/variety/tertiary` 四份独立 error/loading；重试按 section singleflight，有旧数据时只更新状态不遮挡卡片。
- 抽出首页区块通用错误/重试反馈组件，电影/剧集/综艺与 Bangumi 复用同一可访问交互。
- 新增 `withAbortableTimeout(task, timeoutMs, parentSignal?)`；旧 `withTimeout()` 不变。
- effect 每批分项请求共用父 controller；cleanup 真实取消分项。aggregate/client cache 的共享 Promise 保持独立，避免一个消费者取消其他消费者。
- Douban signal 贯通 client direct/proxy → categories route → server delay/rate-limit → verified fetch；Bangumi 新增可抛错底层 fetch，兼容 wrapper 继续失败转空数组。

## 4. 改动文件清单

- `src/app/api/home/route.ts`
- `src/app/api/home/route.test.ts`
- `src/app/api/douban/categories/route.ts`
- `src/app/api/douban/categories/route.test.ts`
- `src/components/HomeClient.tsx`
- `src/components/HomeTabContent.tsx`
- `src/components/HomeTabContent.test.tsx`
- `src/components/HomeSectionLoadFeedback.tsx`
- `src/components/LazyVideoSection.tsx`
- `src/components/LazyVideoSection.test.tsx`
- `src/components/BangumiSection.tsx`
- `src/components/BangumiSection.test.tsx`
- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`
- `src/lib/home-data-client.ts`
- `src/lib/home-data-client.test.ts`
- `src/lib/home-data-loader.ts`
- `src/lib/home-data-loader.test.ts`
- `src/lib/promise-timeout.ts`
- `src/lib/promise-timeout.test.ts`
- `src/lib/douban.client.ts`
- `src/lib/douban.client.test.ts`
- `src/lib/douban.ts`
- `src/lib/douban.test.ts`
- `src/lib/bangumi.client.ts`
- `src/lib/bangumi.client.test.ts`

## 5. 验证结果

- 定向 Jest：12 suites / 62 tests 通过。
- 全量 Jest：80 suites / 393 tests 通过。
- `pnpm typecheck`：通过。
- 目标 ESLint `--max-warnings=0`：通过。
- 修改文件 Prettier check：除 `src/app/api/douban/categories/route.ts`、`src/lib/douban.client.ts`、`src/lib/promise-timeout.ts` 的 HEAD 既有格式基线外均通过；`git diff --check` 通过。
- SSH 隧道 Redis `PING=PONG` 后执行 `pnpm build`：通过。
- 本地 production 浏览器验收：热门电影、热门剧集、新番放送、热门综艺均渲染；48 张图片无坏图；正常态无错误/重试提示；收藏夹切换与返回首页正常；console 无 error。
- 本地服务与 SSH 隧道已关闭，`3100`、`16379` 均无监听。

## 6. 遗留事项

- Finding #6 仍需独立决定：恢复完整 `/api/home` 优先链会反转已经验证的 Bangumi head-of-line 修复，必须以 TV/综艺首显时延为门禁。
- 当前取消范围只覆盖分项源请求；共享 aggregate/client-cache pending promise 若要支持多消费者引用计数取消，应另做契约设计。
