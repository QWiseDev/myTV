---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-03'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 03：卡片与图标操作缺少键盘语义

## 速答

`VideoCard` 的主播放入口是可点击 `div`，收藏和删除直接绑定在 SVG 上；三者都不能被键盘可靠聚焦和触发。

## 关键证据

- `src/components/VideoCard.tsx:641-648` — 主卡片只有 `onClick`，没有原生交互元素、`tabIndex` 或 Enter/Space 处理。
- `src/components/VideoCard.tsx:729-749` — 删除与收藏把 `onClick` 直接挂在 `Trash2` / `Heart` SVG 上，没有按钮语义和 accessible name。
- `src/components/MobileActionSheet.tsx:221-226` — 关闭图标按钮也没有 `aria-label`，读屏无法得知用途。

## 影响

只使用键盘或辅助技术的用户无法从首页播放内容、删除播放记录或切换收藏；读屏用户也无法辨认面板关闭操作。

## 修复方向

为主卡片提供等价键盘激活语义，把图标操作包成具名按钮，并补 `focus-visible` 状态。

## 建议动作

`cs-issue`，因为当前交互对键盘用户不可用。
