---
doc_type: audit-finding
audit: 2026-06-27-home-review
finding_id: security-01
nature: security
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 01：AI 回复未经净化直接注入 HTML

## 速答

首页 AI 推荐弹窗把 AI 返回文本格式化成 HTML 后直接 `dangerouslySetInnerHTML`，格式化函数没有先 escape 或 sanitize 原始内容，存在 XSS 风险。

## 关键证据

- `src/components/AIRecommendModal.tsx:347` — 使用 `dangerouslySetInnerHTML` 渲染 AI 回复。
- `src/components/AIRecommendModal.tsx:348` — HTML 来源是 `formatAIResponseWithLinks(message.content, ...)`。
- `src/lib/ai-recommend.client.ts:225` — `let formatted = content;` 直接以模型返回的原始文本作为 HTML 基底。
- `src/lib/ai-recommend.client.ts:253` — 后续只是用正则替换标题、粗体、列表和换行。
- `src/lib/ai-recommend.client.ts:293` — 返回 `formatted`，没有 HTML escape 或 sanitize。

## 影响

触发条件是用户打开 AI 推荐并收到包含 HTML/脚本事件属性的回复。模型输出本身不能视为可信输入，用户也可以通过提示诱导模型输出 HTML。影响是当前站点前端上下文内的脚本执行风险。

## 修复方向

优先避免 `dangerouslySetInnerHTML`，改成 React 节点渲染；如果必须保留 HTML，先对模型文本做 HTML escape，再只允许白名单标签/属性，或引入成熟 sanitizer。

## 处理结果

已在 `formatAIResponseWithLinks()` 中先 escape 原始 AI 回复，再追加受控展示标签；新增测试覆盖原始 HTML 和片名内 HTML 不会被注入。

## 建议动作

`cs-issue`，因为这是安全缺陷，不是单纯结构优化。
