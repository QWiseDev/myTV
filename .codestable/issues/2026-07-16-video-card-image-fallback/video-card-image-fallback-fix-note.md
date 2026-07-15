---
doc_type: issue-fix
issue: 2026-07-16-video-card-image-fallback
path: fast-track
fix_date: 2026-07-16
tags: [home, video-card, image, fallback]
---

# 卡片封面最终兜底修复记录

## 1. 问题描述

普通外图和豆瓣代理链耗尽后没有本地最终兜底；操作菜单又从原 poster 重新请求已知失败地址。

## 2. 根因

fallback 生成函数只覆盖代理切换，没有统一追加本地 placeholder；卡片和菜单各自计算图片地址，状态没有共享。

## 3. 修复方案

- 所有图片 fallback 链以 `/logo.svg` 收尾。
- `MobileActionSheet` 直接消费 `VideoCard` 当前 `imageSrc`，复用外图 unoptimized 策略并声明 48px 缩略图尺寸意图。

## 4. 改动文件清单

- `src/lib/utils.ts` 及测试
- `src/components/VideoCard.tsx` 及测试
- `src/components/MobileActionSheet.tsx`

## 5. 验证结果

- 回归覆盖普通外图到本地 placeholder、菜单复用当前 fallback、外图 unoptimized 策略。
- 生产首页浏览器检查 60 张图片无 broken image，12 张使用 `/logo.svg`；操作菜单封面 src 与卡片当前 src 一致，console 无 error。
- 最终全量 Jest：76 suites / 367 tests；类型检查、目标 ESLint、production build 通过。

## 6. 遗留事项

- 若部署产物自身缺少 `/logo.svg`，浏览器仍会显示资源错误；当前 build 与首页冒烟已确认该资源可用。
