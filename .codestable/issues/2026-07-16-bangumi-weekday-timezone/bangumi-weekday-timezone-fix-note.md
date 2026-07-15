---
doc_type: issue-fix
issue: 2026-07-16-bangumi-weekday-timezone
path: fast-track
fix_date: 2026-07-16
tags: [home, bangumi, timezone, hydration]
---

# Bangumi weekday 跨时区错误修复记录

## 1. 问题描述

生产 `mytv-core` 使用 UTC，中国浏览器使用 UTC+8。两端在跨日窗口分别以本地 `Date#getDay()` 选择 Bangumi weekday，会生成不同首屏内容；原 memo 还会在数据引用不变时保留旧日期。

## 2. 根因

`src/components/BangumiSection.tsx` 没有定义业务时区，render 结果隐式依赖执行环境；`useMemo` 只把 `bangumiCalendarData` 作为依赖，没有把日期纳入计算边界。

## 3. 修复方案

- 使用 `Intl.DateTimeFormat` 显式按 `Asia/Shanghai` 生成 `Sun` 至 `Sat` weekday。
- 直接从当前日期和日历数据计算可见条目，移除不正确的日期 memo。
- 测试固定在 UTC 与上海已跨日的时间点，并覆盖后续 rerender 换日。

## 4. 改动文件清单

- `src/components/BangumiSection.tsx`
- `src/components/BangumiSection.test.tsx`
- `.codestable/audits/2026-07-16-home-second-pass/finding-01.md`
- `.codestable/audits/2026-07-16-home-second-pass/index.md`

## 5. 验证结果

- `pnpm exec jest src/components/BangumiSection.test.tsx --runInBand`：1 suite / 4 tests 通过。
- `pnpm exec jest --runInBand`：68 suites / 293 tests 通过。
- `pnpm typecheck`：通过。
- 目标 ESLint 与 `git diff --check`：通过。
- 通过 SSH 隧道连接 Redis 的 `pnpm build`：通过，未出现 Redis 连接拒绝日志。

## 6. 遗留事项

当前“今日”明确采用 `Asia/Shanghai` 产品时区；若未来需要按每位用户本地时区展示，应另行定义用户时区配置与 SSR 传递契约。
