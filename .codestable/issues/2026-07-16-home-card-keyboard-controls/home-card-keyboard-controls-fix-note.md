---
doc_type: issue-fix
issue: 2026-07-16-home-card-keyboard-controls
path: fast-track
fix_date: 2026-07-16
tags: [home, video-card, keyboard, accessibility, navigation]
---

# 首页卡片键盘操作修复记录

## 1. 问题描述

首页卡片主播放入口是带点击事件的普通 `div`，收藏与删除直接绑定 SVG；键盘和读屏用户无法可靠播放、收藏或删除记录。

## 2. 根因

视觉卡片承担交互，但 DOM 中没有对应的原生可聚焦控件；隐藏操作区也只有 hover 可见，图标没有 accessible name。

## 3. 修复方案

- 增加覆盖整卡的原生播放链接；普通激活仍走 `navigateVideoCardPlayUrl()`，避免恢复慢 RSC 导航，修饰键点击保留原生链接行为。
- 收藏、删除改为具名按钮，收藏增加 `aria-pressed`；按钮聚焦时显示操作区和 focus ring。
- 修饰键点击在保留默认行为前先阻止父卡片冒泡；小屏隐藏态操作区和豆瓣链接不参与 pointer hit testing，非交互徽章始终透传到主链接；聚合源指示器改为具名原生播放链接，普通与修饰键点击只阻断父级重复导航。
- 豆瓣/Bangumi 链接补名称与焦点样式；ActionSheet 关闭按钮同步补名称。

## 4. 改动文件清单

- `src/components/VideoCard.tsx`
- `src/components/VideoCard.test.tsx`
- `src/components/VideoCardBadges.tsx`
- `src/components/AggregateSourceIndicator.tsx`
- `src/components/MobileActionSheet.tsx`
- `src/components/MobileActionSheet.test.tsx`
- `.codestable/audits/2026-07-16-home-fourth-pass/index.md`
- `.codestable/audits/2026-07-16-home-fourth-pass/finding-03.md`

## 5. 验证结果

- 旧实现无法按 role/name 查询播放链接、收藏按钮和删除按钮，新增回归稳定失败。
- `pnpm exec jest src/components/VideoCard.test.tsx --runInBand`：1 suite / 31 tests 通过。
- 合并交互回归：4 suites / 45 tests 通过。
- `pnpm exec jest --runInBand`：81 suites / 399 tests 通过。
- `pnpm typecheck`、目标 ESLint 与 `git diff --check`：通过。
- SSH 隧道 Redis `PING=PONG`，production build 无连接错误并通过。
- 真实首页 accessibility snapshot 可识别具名播放链接、收藏按钮与删除按钮；667×320 坐标命中确认透明按钮区域落到主播放链接，矮屏操作面板关闭后焦点恢复原播放链接，console 0 warning / 0 error。

## 6. 遗留事项

`VideoCard.tsx` 在本阶段前已有整文件 Prettier 漂移；本次没有把纯格式化噪音混入修复提交，改动行由目标 ESLint、typecheck 与 diff 检查覆盖。
