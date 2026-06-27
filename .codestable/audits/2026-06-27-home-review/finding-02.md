---
doc_type: audit-finding
audit: 2026-06-27-home-review
finding_id: bug-02
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 02：AI 状态检查把 401 当成可用并缓存

## 速答

首页 AI 推荐按钮的可用性判断会把 `/api/ai-recommend/status` 的 401 响应当成可用，并缓存 12 小时，导致未登录或登录失效用户仍看到 AI 推荐入口。

## 关键证据

- `src/app/api/ai-recommend/status/route.ts:11` — 服务端从 cookie 解析登录态。
- `src/app/api/ai-recommend/status/route.ts:12` — 没有登录用户时进入分支。
- `src/app/api/ai-recommend/status/route.ts:13` — 返回 `{ enabled: false }`，HTTP 状态为 401。
- `src/hooks/useAiRecommendStatus.ts:43` — 前端初始状态为 `true`。
- `src/hooks/useAiRecommendStatus.ts:60` — `response.ok` 为 false 时走状态码判断。
- `src/hooks/useAiRecommendStatus.ts:62` — 只有 403 被视为不可用，401 会得到 `true`。
- `src/hooks/useAiRecommendStatus.ts:64` — 误判结果会写入本地缓存。
- `src/hooks/useAiRecommendStatus.ts:6` — 缓存 TTL 是 12 小时。
- `src/components/HomeClient.tsx:114` — `aiEnabled` 为真时渲染 AI 推荐按钮。

## 影响

未登录、登录过期或 cookie 异常用户会看到 AI 推荐按钮；点击后真实 `/api/ai-recommend` 请求仍会返回 401。影响是首页入口误展示和一次失败交互，安全边界主要仍由服务端 POST 守住。

## 修复方向

将 401 明确视为不可用，不缓存失败登录态为可用；初始状态可改为 `null` 或 `false`，避免状态检查前闪现按钮。

## 处理结果

已将 AI 状态默认值改为不可用，401 / 非 ok 响应统一判定为不可用；新增 hook 测试覆盖 401 不展示入口和缓存命中路径。

## 建议动作

`cs-issue`，因为这是确定的状态判断 bug。
