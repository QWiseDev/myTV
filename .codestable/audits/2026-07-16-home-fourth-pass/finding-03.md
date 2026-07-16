---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-03'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
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

## 处理进展（2026-07-16）

- 卡片主入口改为覆盖整卡的原生链接；普通激活仍调用 `navigateVideoCardPlayUrl()`，修饰键点击保留浏览器原生新标签行为。
- 收藏与删除 SVG 改为真实具名按钮，收藏补 `aria-pressed`，操作区在 `focus-within` 时可见。
- 修饰键点击先阻止向父卡片冒泡；移动端不可见的桌面操作和豆瓣链接使用 `pointer-events-none`，显示或聚焦后才恢复命中；非交互徽章始终透传到主链接，聚合源指示器改为只阻止父级冒泡的原生播放链接。
- 豆瓣/Bangumi 图标链接补 accessible name 与焦点样式；ActionSheet 补 dialog、标题/描述关联和关闭按钮名称。
- 真实首页 accessibility snapshot 可识别“播放 {标题}”“收藏 {标题}”“删除 {标题} 的播放记录”；667×320 命中测试确认透明收藏/删除区域实际落到主播放链接，面板关闭后焦点恢复原播放链接。

## 建议动作

`cs-issue`，因为当前交互对键盘用户不可用。
