---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-04'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 04：移动操作关闭期与长按缺少生命周期门禁

## 速答

操作执行后面板仍保留 200ms 且按钮未禁用，异步收藏/删除可被重复触发；长按 timer 也没有 `touchcancel` 和卸载清理。

## 关键证据

- `src/components/MobileActionSheet.tsx:233-238` — action 以 fire-and-forget 方式执行后立即关闭，没有 pending 或 closing 门禁。
- `src/components/VideoCard.tsx:897-911` — 关闭动画期间组件仍挂载，旧 actions 在退场完成前仍可触发。
- `src/hooks/useLongPress.ts:48-60` — timer 到期后直接振动并调用旧 `onLongPress` 闭包。
- `src/hooks/useLongPress.ts:130-144` — 只返回 `touchstart/move/end`，缺少 `touchcancel`；hook 也没有卸载 cleanup。

## 影响

双击、快速连按或重复键盘激活可能提交两次收藏/删除；系统取消触摸或卡片在按压中卸载后，仍可能延迟打开菜单并触发振动。

## 修复方向

在 action 开始或 closing 阶段立刻禁用所有操作，并为长按统一增加 cancel/reset 与卸载清理。

## 处理进展（2026-07-16）

- ActionSheet 每次打开只允许执行一个 action，close 也有幂等门禁；closing 阶段按钮禁用且面板不接收指针操作。
- `VideoCard` 在收藏和删除业务 handler 内分别用 `Map` 保存各卡片 identity 的 pending Promise；同 identity 往返复用仍去重，不同 identity 可并行，旧 mutation 完成不会回写虚拟列表复用后的新卡片。
- `useLongPress` 统一 `resetGesture()`，覆盖移动越界、`touchcancel` 与卸载；嵌套交互控件不再启动卡片手势。
- 旧实现新增回归共稳定失败 10 条；修复后 ActionSheet、VideoCard、long-press 与 ContinueWatching 定向 4 suites / 45 tests 通过。
- 全量 Jest 81 suites / 399 tests、typecheck、目标 ESLint、production build 通过；浏览器焦点循环、关闭期圈定、退场恢复与移动命中通过，console 0 warning / 0 error。

## 建议动作

`cs-issue`，因为这是用户 mutation 与手势 timer 的确定性竞态。
