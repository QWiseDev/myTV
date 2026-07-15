---
doc_type: issue-fix
issue: 2026-07-16-play-danmu-toggle-runtime
path: fast-track
fix_date: 2026-07-16
tags: [play, danmaku, preference, runtime-state, performance]
---

# 播放页弹幕开关运行态修复记录

## 1. 问题描述

播放页已经在 reducer 初始状态读取外部弹幕偏好，但挂载后再次读取；Artplayer 设置又直接读取 localStorage。用户显式关闭时，initializer ready 仍安排加载，空数组会继续 reset/load/show 插件并显示“暂无弹幕数据”。

## 2. 根因

- 持久化偏好、reducer state 和 Artplayer 设置分别读取同一个 localStorage key，运行时状态没有单一即时 owner。
- ready 延迟任务只校验播放器 identity，没有在安排任务和异步结果提交前校验当前开关。

## 3. 修复方案

- 保留“无偏好默认开启”的现有产品行为，只在 reducer 初始化时读取一次偏好。
- `externalDanmuEnabledRef` 作为播放器运行时即时状态；Artplayer 设置只读写该 ref，并通过现有 callback 同步 reducer 与持久化。
- initializer ready 仅在 ref 开启时安排加载，异步返回后再次校验 ref，关闭态不加载、不渲染、不显示空数据提示。
- 手动开启路径改为先加载、再校验当前 ref 与 active player、最后渲染；开启请求未决时再次关闭，旧结果不能在关闭防抖执行前短暂回显。
- 换集与换源延迟加载采用同一提交规则：请求前检查 enabled，请求后再校验 enabled、generation/operation 和 active player；关闭态不创建换集 timer。
- `loadExternalDanmu()` 用现有 canonical request key + source 捕获请求媒体，await 后按最新 refs 重算 identity；即使新集请求尚未启动，旧集结果也会统一转成 `AbortError`。
- 删除不再需要的 `externalDanmuEnabled` initializer 参数和 Artplayer 配置参数。
- 删除所有调用方迁移后失去用途的 `loadAndRenderDanmaku()` 包装函数。

## 4. 改动文件清单

- `src/app/play/page.tsx`
- `src/app/play/hooks/usePlayerInitializer.ts`
- `src/app/play/hooks/usePlayerInitializer.test.ts`
- `src/app/play/hooks/useDanmuController.ts`
- `src/app/play/hooks/useDanmuController.test.ts`
- `src/app/play/hooks/useEpisodeDanmuSync.ts`
- `src/app/play/hooks/useEpisodeDanmuSync.test.ts`
- `src/app/play/hooks/useSourceSwitcher.ts`
- `src/app/play/hooks/useSourceSwitcher.test.ts`
- `src/app/play/utils/artplayerConfig.ts`
- `src/app/play/utils/artplayerConfig.test.ts`
- `src/app/play/utils/danmakuRuntime.ts`
- `.codestable/audits/2026-07-15-playback-deep-review/finding-07.md`
- `.codestable/audits/2026-07-15-playback-deep-review/index.md`

## 5. 验证结果

- `pnpm exec jest src/app/play/hooks/useEpisodeDanmuSync.test.ts src/app/play/hooks/useSourceSwitcher.test.ts src/app/play/hooks/useDanmuController.test.ts src/app/play/hooks/usePlayerInitializer.test.ts src/app/play/utils/artplayerConfig.test.ts --runInBand`：5 suites / 28 tests 通过。
- `pnpm exec jest --runInBand`：69 suites / 324 tests 通过。
- `pnpm typecheck`：通过。
- 修改文件目标 ESLint、Prettier check 与 `git diff --check`：通过。
- `pnpm build`：通过；使用 `127.0.0.1:16379` SSH tunnel 连接 `136.175.83.3` Redis，完成后已关闭 tunnel，未修改 `.env` 或远端 Redis 配置。

## 6. 遗留事项

新用户无偏好时默认开启还是关闭属于产品策略。本修复保持当前默认 `true`，不把策略变更混入运行时 bug 修复。
