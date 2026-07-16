---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-04'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
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

## 建议动作

`cs-issue`，因为这是用户 mutation 与手势 timer 的确定性竞态。
