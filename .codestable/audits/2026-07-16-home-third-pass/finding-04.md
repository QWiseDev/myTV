---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "bug-04"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 04：封面 fallback 耗尽后显示坏图并在菜单重复失败

## 速答

普通外图和豆瓣 fallback 链没有最终本地占位；最后一次失败后卡片反而隐藏占位并显示失败 src，操作菜单又从原 poster 重算并重复请求旧失败地址。

## 关键证据

- `src/lib/utils.ts:248-281` — 普通外图只返回原 URL，豆瓣代理链也没有统一追加 `/logo.svg`。
- `src/components/VideoCard.tsx:342-353` — fallback 耗尽时把图片标记为已加载。
- `src/components/VideoCard.tsx:674-698` — 已加载状态隐藏 `ImagePlaceholder` 并显示当前失败图片。
- `src/components/VideoCard.tsx:614-617,900-915` — ActionSheet poster 从原 poster 重新计算，没有复用卡片已成功的 fallback src。
- `src/components/MobileActionSheet.tsx:182-193` — 菜单图片没有 fallback，48px 缩略图也未声明 `sizes`。

## 影响

第三方图片 403/404 或代理/CDN 全部失败时，首页显示坏图；用户再打开操作菜单会重复请求已知失败 URL，增加无效流量并继续显示空白缩略图。

## 修复方向

所有 fallback 链统一以本地 `/logo.svg` 收尾；ActionSheet 复用卡片当前 `imageSrc`，并声明适合 48px 缩略图的加载参数。

## 建议动作

`cs-issue`，因为当前最终降级路径不能保证可显示图片。

## 修复记录（2026-07-16）

- 普通外图与豆瓣代理 fallback 链都追加本地 `/logo.svg`。
- `MobileActionSheet` 复用卡片当前 `imageSrc`，不再从原 poster 重启失败链；缩略图复用 unoptimized 判定并声明 48px 尺寸意图。
- 浏览器生产态首页检查 60 张图片无 broken image，12 张已落到本地 placeholder；操作菜单封面与卡片当前 src 一致。
- 修复记录见 `.codestable/issues/2026-07-16-video-card-image-fallback/video-card-image-fallback-fix-note.md`。
