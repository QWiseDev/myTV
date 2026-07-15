---
doc_type: issue-fix
issue: 2026-07-16-play-inplace-switch-generation
path: fast-track
fix_date: 2026-07-16
tags: [play, player, episode-switch, generation, concurrency]
---

# 播放器 in-place switch generation 修复记录

## 1. 问题描述

播放器 initializer 已有 generation，但快速连续换集时，旧 `switchPlayerMedia()` 会在 `switchUrl()` 完成后直接写入旧标题、海报和播放时间。外围 generation 检查发生得更晚，因此 G2 先完成后，G1 仍可晚到覆盖当前媒体 metadata；同一 ArtPlayer 上并发调用两个 opaque `switchUrl()` 也没有安全边界。

此外，播放器创建时注册的 HLS fatal callback 与 10 秒加载超时仍校验创建 generation。播放器被 in-place 换集复用后，旧 generation 已失效，但实例仍是当前实例，错误恢复可能被静默跳过。

## 2. 根因

- 异步 URL 切换和 metadata/time 提交被封装在同一个工具函数中，生命周期所有者无法在副作用前校验 operation identity。
- `switchPromiseRef` 保存已完成 Promise 且新切换只把旧引用置空，没有阻止同一实例并发执行。
- 已提交播放器事件应以 player identity 为准，但 HLS fatal callback 和 loading timeout 仍沿用初始化 generation。

## 3. 修复方案

- `switchPlayerMedia()` 只等待 `switchUrl()` 并计算待提交结果；`applyPlayerMediaSwitch()` 负责同步提交 metadata/time。
- initializer 在提交前同时比较 generation、`artPlayerRef.current` 和 `switchPromiseRef.current`。
- 发现已有未决 switch 时，不再对同一实例启动第二次 switch，直接清理旧播放器并为最新媒体重建；正常单次换集仍保留快速复用路径。
- Promise 仅在 identity 仍匹配时清理，旧任务完成后不能清除新任务所有权。
- initializer 等待 `detail/index` 对应 URL 与 `videoUrl` 对齐后再切换，避免 React 两阶段选集 render 对旧 URL 误发 switch；空白目标地址直接报错。
- HLS fatal callback 同时校验 media session、HLS instance 和 active player video；loading timeout 按每个媒体 session 重置，并从 `latestParamsRef` 读取当前媒体信息。

## 4. 改动文件清单

- `src/app/play/utils/playerSwitch.ts`
- `src/app/play/utils/playerSwitch.test.ts`
- `src/app/play/hooks/usePlayerInitializer.ts`
- `src/app/play/hooks/usePlayerInitializer.test.ts`
- `src/app/play/page.tsx`
- `.codestable/audits/2026-07-15-playback-deep-review/index.md`
- `.codestable/audits/2026-07-15-playback-deep-review/finding-03.md`

## 5. 验证结果

- `pnpm exec jest src/app/play/utils/playerSwitch.test.ts src/app/play/hooks/usePlayerInitializer.test.ts --runInBand`：2 suites / 16 tests 通过。
- `pnpm exec jest --runInBand`：69 suites / 317 tests 通过。
- `pnpm typecheck`：通过。
- 修改文件目标 ESLint 与 `git diff --check`：通过。
- `pnpm build`：通过；构建使用 `127.0.0.1:16379` SSH tunnel 连接 `136.175.83.3` Redis，完成后已关闭 tunnel，未修改 `.env` 或远端 Redis 配置。

## 6. 遗留事项

本修复不尝试中止 ArtPlayer 内部已经开始的 `switchUrl()`；通过销毁旧实例和延迟提交隔离其结果。同一 video 元素理论上仍可能收到前一媒体排队中的 `canplay`，该事件缺少原生 media token，作为低风险观察项留给后续 player lifecycle 重构；播放器状态机、重复事件与参数规模继续由 playback finding #8 分批处理。
