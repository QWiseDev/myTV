---
doc_type: issue-fix
issue: 2026-07-16-home-play-records-strictmode
path: fast-track
fix_date: 2026-07-16
tags: [home, play-records, strict-mode, idle-task, lifecycle]
---

# 首页播放记录 StrictMode 初载修复记录

## 1. 问题描述

首页播放记录首次加载由 idle task 延迟触发。在 React StrictMode 的 effect setup-cleanup-setup 时序中，首个任务被 cleanup 取消后没有新的 live task，播放记录会永久保持 loading。

## 2. 根因

`usePlaybackRecords` 在调度前先把 priority signature 写入 ref；StrictMode 第二次 setup 因而被 `if (!isInitialLoad) return` 拦截，而第一次 setup 创建的 idle task 已被 cleanup 取消。

## 3. 修复方案

- 删除相同 signature 第二次 setup 的错误 early return，让 StrictMode 能保留唯一一次有效 idle 初载。
- 保留 signature 在 setup 时写入，确保 priority 在初始 idle 前发生真实变化时仍立即刷新。
- 不处理请求启动后卸载与分页状态；两者属于第四轮 P2 独立 finding。

## 4. 改动文件清单

- `src/hooks/usePlaybackRecords.ts`
- `src/hooks/usePlaybackRecords.test.ts`
- `.codestable/audits/2026-07-16-home-fourth-pass/index.md`
- `.codestable/audits/2026-07-16-home-fourth-pass/finding-01.md`

## 5. 验证结果

- 旧实现运行新增 StrictMode 回归：1 test 失败，`getPlayRecordsPage()` 预期 1 次、实际 0 次。
- `pnpm exec jest src/hooks/usePlaybackRecords.test.ts --runInBand`：1 suite / 19 tests 通过。
- `pnpm exec jest --runInBand`：79 suites / 383 tests 通过。
- `pnpm typecheck`：通过。
- `pnpm exec eslint src/hooks/usePlaybackRecords.ts src/hooks/usePlaybackRecords.test.ts --max-warnings=0`：通过。
- `pnpm exec prettier --check src/hooks/usePlaybackRecords.ts src/hooks/usePlaybackRecords.test.ts`：通过。
- `git diff --check`：通过。
- 使用 `127.0.0.1:16379` SSH 隧道连接 `136.175.83.3` Redis，`PING=PONG`；覆写本次构建进程的 `REDIS_URL` 后 `pnpm build` 无连接错误并通过，未修改 `.env` 或远端 Redis 配置。
- production build 本地启动后浏览器验证：首页继续观看渲染 12 张记录卡，存在“清空”操作且无首屏重试态，console 0 warning / 0 error。
- 验证后本地 3100 与 16379 端口均已关闭。

## 6. 遗留事项

请求已经开始后卸载仍不会取消底层读取；priority 项与 cursor 分页状态也尚未隔离，均保留在第四轮 P2 后续阶段处理。
