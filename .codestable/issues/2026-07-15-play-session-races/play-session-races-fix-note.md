---
doc_type: issue-fix
issue: 2026-07-15-play-session-races
path: fast-track
fix_date: 2026-07-15
tags: [play, lifecycle, source-switch, danmaku, progress]
---

# 播放会话竞态修复记录

## 1. 问题描述

播放页的推荐导航、后台补源、换源 hydrate、播放器异步初始化、弹幕请求、跳过配置和播放记录 mutation 分别维护局部状态，但缺少一致的媒体 identity/generation。结果是旧媒体状态或请求可能晚到覆盖当前会话；same-URL 换源可能复用旧 source/id 闭包；目标源失败时锁可能不释放；同一记录的旧保存可能覆盖新进度。

## 2. 根因

- `/play -> /play` 使用客户端路由，组件和播放器会话可能复用。
- failover 一边读取最新 sources ref，一边调用捕获旧数组的 switcher；hydrate 期间也没有离页/卸载提交门禁。
- initializer 的动态 import、switch/rebuild 与播放器事件没有区分“尚未提交的异步 run”和“已提交的当前 player identity”，source/id 也不在 effect identity 内。
- 弹幕 manager reset 只丢引用不 abort，调用层吞 AbortError，旧请求的 finally/渲染路径没有稳定 token。
- 播放记录 API 的 read-compare-write、POST/DELETE/clear-all 在当前进程内可交错，且没有 `save_time` 防旧写。

## 3. 修复方案

- 推荐卡片改用 document navigation，直接建立新的播放会话。
- 换源统一读取最新 sources ref；先 hydrate 和校验当前集 URL，再按 operation generation 与 `/play` 页面身份提交。同步 URL 元数据，失败路径统一释放锁，旧记录不再在确认新源前删除。
- initializer 增加 generation/cleanup，各 await 后校验；已提交事件改为 player identity 校验；source/id 加入 effect identity，same-URL 换源也重跑并在 identity 变化时重建播放器。
- 弹幕 manager 持有 controller/token，reset 或新 key abort 旧请求；AbortError 保持取消语义，旧集/旧 player/旧 request 不再渲染或清理新状态。
- playrecords API 按 username 在当前进程内串行 mutation，并按 `save_time` 拒绝旧 POST。
- 返回顶部控制器删除常驻 RAF + timer，收敛为 passive scroll 触发的单 RAF。

## 4. 改动文件清单

- `src/components/play/RecommendationsSection.tsx`
- `src/components/play/RecommendationsSection.test.tsx`
- `src/app/play/hooks/useSourceSwitcher.ts`
- `src/app/play/hooks/useSourceSwitcher.test.ts`
- `src/app/play/hooks/usePlayerInitializer.ts`
- `src/app/play/hooks/usePlayerInitializer.test.ts`
- `src/app/play/hooks/useDanmuController.ts`
- `src/app/play/hooks/useDanmuController.test.ts`
- `src/app/play/hooks/useEpisodeDanmuSync.ts`
- `src/app/play/hooks/useEpisodeDanmuSync.test.ts`
- `src/app/play/utils/danmakuRuntime.ts`
- `src/app/play/utils/danmakuRuntime.test.ts`
- `src/app/api/playrecords/route.ts`
- `src/app/api/playrecords/route.test.ts`
- `src/app/play/hooks/useBackToTopController.ts`
- `src/app/play/hooks/useBackToTopController.test.ts`
- `src/app/play/page.tsx`
- `.codestable/audits/2026-07-15-playback-deep-review/`

## 5. 验证结果

- 已知阶段性结果：播放核心 6 个 suites / 20 个 tests 通过。
- 弹幕、initializer、source switch 组合 5 个 suites / 19 个 tests 通过。
- playrecords route 4 个 tests 通过；initializer/source switch 锁相关 2 个 suites / 6 个 tests 通过。
- 独立 reviewer 对 same-URL 换源路径复核为 clear，并定向复跑 10 个 tests 通过。
- 多轮目标 ESLint、typecheck 与 `git diff --check` 曾阶段性通过。
- `pnpm exec jest --runInBand`：62 suites / 252 tests 全部通过。
- `pnpm typecheck`、`pnpm build`、本轮全部 TS/TSX 文件的 `eslint --max-warnings=0`、`git diff --check`：通过。
- `pnpm lint:strict`：被 147 条仓库既有 warning 阻断；`pnpm format:check`：被全仓历史格式债务阻断。本轮新增测试与 CodeStable 文档已单独通过 Prettier。
- 本地生产包浏览器冒烟到认证边界通过；无本地登录态，未完成登录后播放页目视验收。

## 6. 遗留事项

- 进程内 mutation queue 不是多实例最终一致性方案；生产多进程/多副本仍需存储层 CAS、事务或原子 upsert。
- 为避免切换失败导致数据丢失，旧 source key 不再提前删除；新源保存进度后旧/新记录可能同时出现在继续观看。安全迁移应在新源首次保存成功后再删除旧 key，保存失败时保留旧记录。
- 新用户弹幕默认策略仍待产品确认。
- 播放状态机大文件、reducer/state/ref/aliases、重复 ended/loading 路径未在本轮完整重构。
- 未经用户授权，不提交、不推送。
