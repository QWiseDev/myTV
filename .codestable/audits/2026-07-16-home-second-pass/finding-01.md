---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: bug-01
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 01：Bangumi 按运行时本地日期选择会产生水合跨日错误

## 速答

Bangumi 在客户端组件 render 中直接读取运行环境日期；生产容器是 UTC、中国浏览器是 UTC+8，跨日窗口会让服务端与浏览器选择不同星期的番剧。

## 关键证据

- `src/components/BangumiSection.tsx:21-24` — `new Date().getDay()` 决定当前 weekday，结果依赖执行环境时区。
- `src/components/BangumiSection.tsx:51-54` — `useMemo` 只依赖数据，跨午夜后即使组件因其它状态重渲染也不会重新选日。
- `Dockerfile:36-45` — runner 基于 `node:20-alpine`，没有设置 `TZ`。
- 2026-07-16 02:15（Asia/Shanghai）运行态只读核实：生产 `mytv-core` 为 `UTC +0000` 周三，本地浏览器时区为 `CST +0800` 周四。

## 影响

中国用户每天约有 8 小时处于服务端与浏览器日期不同的窗口，可能看到水合不一致或错误 weekday 的新番；长时间驻留页面跨日后也不会稳定换日。

## 修复方向

建立单一、可测试的“今日”时区契约，并让服务端首屏与客户端换日使用同一 weekday。

## 建议动作

`cs-issue`，因为这是已由生产时区证实的用户可见日期错误。
