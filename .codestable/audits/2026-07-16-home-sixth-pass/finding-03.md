---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'bug-03'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 03：多指触摸可提前结束长按并误触播放

## 速答

useLongPress 只读取 touches[0]，不拒绝多指也不跟踪首个 touch identifier；任一触点结束都会结束整个手势并手动触发播放。

## 关键证据（修复前）

- src/hooks/useLongPress.ts:103-125 — touchstart/touchmove 永远读取第一个触点，没有 touches.length 或 identifier 门禁。
- src/hooks/useLongPress.ts:128-136 — 任一 touchend 都直接 preventDefault、stopPropagation 并调用 handleEnd。
- src/hooks/useLongPress.ts:86-97 — 未达到长按阈值时 handleEnd 会直接调用 onClick。
- src/components/VideoCard.tsx:683-688 — VideoCard 把 onClick 绑定为播放导航。

## 影响

第一指开始手势后加入第二指，任一触点抬起且移动未超过阈值，就可能在两指轻触或轻微缩放时意外跳到播放页。

## 修复方向

只接受单指手势并记录活动 touch identifier；出现第二指或找不到原触点时取消手势，不触发 click。

## 建议动作

cs-issue，因为当前触摸边界会产生非用户意图的页面导航。

## 修复进展（2026-07-16）

- useLongPress 记录活动 touch identifier，只接受单指开始；活动期间临时监听 document capture touchstart，因此第二指落在兄弟控件、另一张卡或页面其他区域也会取消。
- 多指取消后持续 preventDefault/stopPropagation，避免浏览器再合成原生 click；若最后一个外部触点不经过 Hook，下一次确认的单指 touchstart 会清除旧抑制状态。
- 五个新增多指回归覆盖 Harness 外第二触点、两种抬指顺序和下一次单指可用性；修复后 useLongPress 8/8 通过。
- 修复记录见 .codestable/issues/2026-07-16-home-multitouch-long-press/home-multitouch-long-press-fix-note.md。
