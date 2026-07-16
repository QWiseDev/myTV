---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'maintainability-11'
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 11：VideoCard 同时保留覆盖链接与根节点导航

## 速答

整卡覆盖 a 已拥有主导航，外层 div 仍绑定同一 handleClick，形成两套播放事件所有权。

## 关键证据

- src/components/VideoCard.tsx:615-636 — 覆盖链接拦截普通主键点击并调用 handleClick。
- src/components/VideoCard.tsx:721-736 — 根 div 同时绑定 onClick={handleClick}，覆盖链接铺满整个卡片。
- src/components/VideoCard.tsx:534-582 — 收藏和删除入口必须持续 preventDefault + stopPropagation，避免操作后又触发根导航。

## 影响

新增任一卡片内交互时，只要漏掉一层传播门禁，就会在完成操作后同时跳转播放；两套入口也增加触摸、辅助点击和测试矩阵复杂度。

## 修复方向

让覆盖链接成为唯一主导航入口，根节点只承担布局、右键和拖拽语义；子操作不再为旧根点击通道维护防冒泡补丁。

## 建议动作

cs-refactor，因为用户可见导航保持不变，目标是收口单一事件所有权。
