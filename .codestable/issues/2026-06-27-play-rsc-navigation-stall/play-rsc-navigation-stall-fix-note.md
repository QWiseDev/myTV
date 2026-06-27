---
doc_type: issue-fix
issue: 2026-06-27-play-rsc-navigation-stall
path: fast-track
fix_date: 2026-06-27
tags: [home, play, navigation]
---

# 首页播放点击无反馈修复记录

## 1. 问题描述

首页点击豆瓣卡片进入 `/play` 时，浏览器先发起 App Router RSC 请求；该请求慢时当前页面保持不变，用户看起来像点击后没有任何变化。

## 2. 根因

`VideoCard` 使用 `router.push(playUrl)` 进入播放页。App Router 客户端导航需要等待 `/play?...&_rsc=...` payload 返回后才提交路由切换；生产冷路径下该 RSC 请求可明显变慢。

## 3. 修复方案

播放卡片点击改为浏览器文档导航，由 `navigateVideoCardPlayUrl` 统一调用 `location.assign(playUrl)`，避免播放入口被 RSC 客户端导航阻塞。

## 4. 改动文件清单

- `src/components/VideoCard.tsx`
- `src/lib/video-card-utils.ts`
- `src/lib/video-card-utils.test.ts`

## 5. 验证结果

- `eslint src/components/VideoCard.tsx src/components/VideoCard.test.tsx src/lib/video-card-utils.ts src/lib/video-card-utils.test.ts --quiet` 通过。
- `tsc --noEmit --incremental false` 通过。
- `jest src/components/VideoCard.test.tsx src/lib/video-card-utils.test.ts --runInBand` 通过。

## 6. 遗留事项

需要部署后用线上浏览器确认首页点击播放时不再出现长时间无反馈。
