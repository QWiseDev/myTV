---
doc_type: issue-fix
issue: 2026-07-16-home-p2-cleanup
path: fast-track
fix_date: 2026-07-16
tags: [home, animation, watching-updates, playback-records, cleanup]
---

# 首页动画、追更轮询与死补丁路径修复记录

## 1. 问题描述

首页第三轮审计的 finding #8–#10 分别确认：动画容器按位置标识 wrapper，排序时会重挂业务卡片；数据库模式每次切回前台都可能读取追更 API；近期多轮补丁后，播放记录 Context 与追更模块仍保留无消费者 API、timer、listener 和镜像状态。

## 2. 根因

- `AnimatedCardGrid` 没有把 child 的业务 key 提升到 wrapper，且动画数量边界两侧使用不同元素类型。
- `useWatchingUpdatesRefresh` 在 visibility 层维护独立的 15 秒 throttle，没有为所有普通检查建立统一 freshness 所有权。
- `refreshPlayRecords` 已无消费者，但仍把播放记录 hook、追更 snapshot 与 Context 串在一起；`updateListeners` 没有注册入口，`globalCheckInProgress` 与 in-flight Promise 同步镜像，debug 函数则为空实现。

## 3. 修复方案

- 动画 wrapper 优先使用 child key，并统一为 `motion.div`；仅前 `maxAnimatedItems` 项设置 variants，兼顾稳定 identity 与动画上限。
- idle 和 visibility 共用 30 分钟成功检查间隔；invalidated 继续强制执行，失败不写入节流时间戳。
- 增加 mounted 门禁，卸载后不刷新 snapshot、不继续 pending invalidation；底层 fetch 的主动取消留给首页 finding #7。
- 删除无消费者 `refreshPlayRecords`、500ms timer、Context 字段和 hook 参数。
- 删除死 listener/debug 通道和镜像布尔状态，保留 `updateCheckPromise` singleflight 与 `watchingUpdatesChanged` DOM event。

## 4. 改动文件清单

- `src/components/AnimatedCardGrid.tsx`
- `src/components/AnimatedCardGrid.test.tsx`
- `src/hooks/useWatchingUpdatesRefresh.ts`
- `src/hooks/useWatchingUpdatesRefresh.test.ts`
- `src/hooks/usePlaybackRecords.ts`
- `src/hooks/usePlaybackRecords.test.ts`
- `src/contexts/PlayPageContext.tsx`
- `src/contexts/PlayPageContext.test.tsx`
- `src/lib/watching-updates.ts`
- `src/lib/watching-updates.test.ts`
- `.codestable/audits/2026-07-16-home-third-pass/finding-08.md`
- `.codestable/audits/2026-07-16-home-third-pass/finding-09.md`
- `.codestable/audits/2026-07-16-home-third-pass/finding-10.md`
- `.codestable/audits/2026-07-16-home-third-pass/index.md`

## 5. 验证结果

- 定向 Jest：动画、追更 refresh、播放记录、Context 与追更缓存 5 suites / 35 tests 通过。
- 全量 Jest：77 suites / 370 tests 通过。
- `pnpm typecheck`：通过。
- 目标 ESLint：本次改动无新增 warning/error；`src/lib/watching-updates.ts` 保留 HEAD 已存在的 3 条 `no-explicit-any` warning。
- 修改文件 Prettier check：除 `src/lib/watching-updates.ts` 的 HEAD 既有单行格式基线外均通过；`git diff --check` 通过。
- SSH 隧道 Redis `PING=PONG` 后执行 `pnpm build`：通过；隧道已关闭并确认 `127.0.0.1:16379` 无监听。

## 6. 遗留事项

- #5 仍需为热门电影、热门剧集、热门综艺、Bangumi 增加独立错误与重试状态，并在失败时保留已有成功数据。
- #7 仍需向首页 loader、Douban 与 Bangumi 请求透传 `AbortSignal`，让 timeout 与 effect cleanup 真正终止底层请求。
- #6 恢复完整聚合缓存成功链路可能重新引入 Bangumi 阻塞，需要独立时序方案与提交。
