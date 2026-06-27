---
doc_type: audit-finding
audit: 2026-06-27-home-review
finding_id: performance-03
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 03：AI 弹窗并未做到按打开懒加载

## 速答

`AIRecommendModal` 使用了 `React.lazy`，但首页始终渲染该组件；即使弹窗未打开，组件 chunk 也会加载，内部 effect 也会执行。

## 关键证据

- `src/components/HomeClient.tsx:26` — `AIRecommendModal` 被 `lazy()` 包装。
- `src/components/HomeClient.tsx:153` — 首页总是渲染包裹弹窗的 `Suspense`。
- `src/components/HomeClient.tsx:154` — 总是挂载 `AIRecommendModal`，只通过 `isOpen` 控制显示。
- `src/components/AIRecommendModal.tsx:52` — 组件内 effect 会读取 `ai-recommend-messages`。
- `src/components/AIRecommendModal.tsx:91` — 另一个 effect 会写入 `ai-recommend-messages`。
- `src/components/AIRecommendModal.tsx:248` — `if (!isOpen) return null` 在 hooks 之后，不能阻止前面的 hooks 执行。

## 影响

每次进入首页都可能加载 AI 弹窗相关代码，并读写对话缓存，即使用户从未点击 AI 推荐。对首页首屏和低端设备来说，这是不必要成本。

## 修复方向

只在 `showAIRecommendModal` 为 true 时渲染懒加载组件；需要保留关闭动画时，可拆出轻量壳组件，把重逻辑放到打开后加载。

## 处理结果

已将 `AIRecommendModal` 的挂载条件收敛到 `showAIRecommendModal` 为 true 时，未打开时不再加载弹窗组件或运行其缓存 effect。

## 建议动作

`cs-refactor`，因为这是不改变功能语义的加载边界优化。
