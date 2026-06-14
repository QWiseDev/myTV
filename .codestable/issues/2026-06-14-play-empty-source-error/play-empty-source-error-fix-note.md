---
doc_type: issue-fix
issue: 2026-06-14-play-empty-source-error
path: fast-track
fix_date: 2026-06-14
tags: [play, source-initialization]
---

# 播放页无播放源不提示修复记录

## 1. 问题描述

访问只带 `title/year/douban_id` 的播放页时，如果按标题搜索不到播放源，页面没有明确提示用户未找到播放源。

## 2. 根因

`useSourceInitialization` 在初始化失败或搜索结果为空时只调用独立的 `errorHandler.handleError`，没有同步写入播放页渲染使用的 `state.player.error`。因此页面主渲染分支拿不到错误信息，无法显示 `ErrorScreen`。

## 3. 修复方案

给 `useSourceInitialization` 增加 `setError` 入参，初始化失败统一通过 `failInitialization` 同时写入 `errorHandler`、`state.player.error` 并结束 loading。新一轮初始化开始时清空旧错误。

## 4. 改动文件清单

- `src/app/play/hooks/useSourceInitialization.ts`
- `src/app/play/page.tsx`
- `src/app/play/hooks/useSourceInitialization.test.ts`

## 5. 验证结果

- `pnpm test -- src/app/play/hooks/useSourceInitialization.test.ts --runInBand` 通过。
- `pnpm typecheck` 通过。

## 6. 遗留事项

未做线上浏览器复测；当前验证覆盖了无播放源时写入页面错误状态的核心路径。
