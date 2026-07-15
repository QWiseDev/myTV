---
doc_type: issue-fix
issue: 2026-07-15-episode-skip-integrity
path: fast-track
fix_date: 2026-07-15
tags: [play, episode, source-check, skip]
---

# 选集测速与跳过配置完整性修复记录

## 1. 问题描述

选集/换源面板的页码、测速缓存和检查结果没有完整纳入 episode 与 run identity：回到选集页可能停留在旧页，切集后复用上一集测速，等长 sources 替换不重测，旧检查 run 也可能继续写回。跳过配置请求则可能跨 source 写回，absolute 片尾配置 round-trip 错误，关闭重开设置面板会沿用默认值或未保存编辑。

## 2. 根因

- `EpisodeSelector` 把测速尝试与结果主要按 source key 缓存，缺少 episode 维度；effect 只依赖 sources 长度，无法识别等长替换。
- 选集页码同步没有把返回 tab 与最新 value 作为完整触发条件；旧 run 的更新缺少当前 runId 门禁。
- HLS 检测正则只识别结尾或 query，不识别 `.m3u8#fragment`。
- `SkipController` 直接把异步配置结果写入 state，没有 source/id identity 或 generation；表单恢复逻辑把 absolute 片尾按 remaining 反推。
- 组件还保留 attemptedSources 双重 state/ref、write-only ref 和无效 timer/ref，增加状态推理成本。

## 3. 修复方案

- 选集页重新激活时按最新 episode 推导分页；测速缓存 key 使用 `sourceKey + episodeIndex`。
- sources effect 依赖完整数组，等长替换也重新筛选；旧 episode check runId 的 update/完成路径均不能写入当前结果。
- HLS URL 检测支持 query 与 fragment。
- `SkipController` 用 source/id identity 与 request generation 加载配置；换源立即清旧配置，旧请求不能写回。
- absolute 片尾直接 round-trip start/end；关闭或重新打开设置面板时从当前已保存配置恢复。
- 删除 attemptedSources 重复 state、write-only videoInfo ref 和 SkipController 无效时间/timer refs。

## 4. 改动文件清单

- `src/components/EpisodeSelector.tsx`
- `src/components/EpisodeSelector.test.tsx`
- `src/app/play/utils/episodeSourceCheck.ts`
- `src/app/play/utils/episodeSourceCheck.test.ts`
- `src/components/SkipController.tsx`
- `src/components/SkipController.test.tsx`
- `.codestable/audits/2026-07-15-playback-deep-review/finding-04.md`
- `.codestable/audits/2026-07-15-playback-deep-review/finding-08.md`

## 5. 验证结果

- 已知阶段性结果：EpisodeSelector / episodeSourceCheck / SkipController 共 3 个 suites / 14 个 tests 通过。
- 定向覆盖最新 episode 分页、分集缓存、等长 sources 替换、`.m3u8#fragment`、旧 skip 请求、换源立即清配置、absolute 片尾和关闭重开恢复。
- 目标 ESLint、typecheck 曾在本轮阶段性改动后通过。
- `pnpm exec jest --runInBand`：62 suites / 252 tests 全部通过。
- `pnpm typecheck`、`pnpm build`、本轮全部 TS/TSX 文件的 `eslint --max-warnings=0`、`git diff --check`：通过。
- `pnpm lint:strict`：被 147 条仓库既有 warning 阻断；`pnpm format:check`：被全仓历史格式债务阻断。本轮新增测试与 CodeStable 文档已单独通过 Prettier。
- 本地生产包浏览器冒烟到认证边界通过；无本地登录态，未完成登录后选集/跳过交互目视验收。

## 6. 遗留事项

- 自动测速仍使用固定并发上限，尚未完成统一 abort/controller 与调度重构。
- 同集多个同类型跳过片段、短片头冷却、自动跳集与延迟 `ended` 组合仍未处理。
- `EpisodeSelector` / `SkipController` 仍是较长组件；本轮只清理确定性重复状态并修复完整性问题，没有进行无关的大拆分。
- 未经用户授权，不提交、不推送。
