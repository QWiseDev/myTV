---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'bug-02'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 02：收藏页卡片初始被误判为未收藏

## 速答

FavoritesSection 明知所有卡片都来自收藏列表，却没有把该事实交给 VideoCard；卡片在延迟查询完成前固定以 false 渲染并执行“添加收藏”。

## 关键证据（修复前）

- src/components/FavoritesSection.tsx:73-80 — 收藏列表只传 from='favorite'，没有传递已收藏初值。
- src/components/VideoCard.tsx:218-257 — 收藏状态初值固定为 false，isFavorited 又通过延迟调度异步读取。
- src/components/VideoCard.tsx:479-500 — 用户在结果返回前操作时进入 saveFavorite 分支，并以当前卡片字段重新覆盖收藏。
- .codestable/audits/2026-07-15-home-deep-review/finding-07.md:29,39,55-57 — 旧 finding 已记录短暂误判，但最终只收口查询竞态与监听所有权，初始 false 仍存在。

## 影响

收藏 tab 刚渲染后立即悬浮、右键或长按，已有收藏会显示“添加收藏”；执行后会用缺少 search_title 等补全字段的当前 payload 覆盖旧记录。

## 修复方向

让 from='favorite' 的 source-backed 卡以已收藏为明确初值，同时保留后续事件同步；补延迟查询未完成时的操作回归。

## 建议动作

cs-issue，因为旧 finding 的行为缺口仍可直接触发错误写入。

## 修复进展（2026-07-16）

- VideoCard 的 source-backed favorite 卡片首帧直接初始化为已收藏，延迟 isFavorited 仍可覆盖为最新真实状态。
- 新增回归覆盖“首帧取消收藏 + 延迟查询同步为未收藏”；旧实现稳定失败，修复后通过。
- 修复记录见 .codestable/issues/2026-07-16-home-favorite-card-initial-state/home-favorite-card-initial-state-fix-note.md。
