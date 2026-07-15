---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: bug-03
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 03：Bangumi 非数组响应可直接崩首页

## 速答

客户端 Bangumi 请求不检查 HTTP 状态，也不把 JSON 归一化成数组；上游返回错误对象时，首页会对对象执行 `.find()` 并抛出渲染异常。

## 关键证据（修复前）

- `src/lib/bangumi.client.ts:58-74` — 直接 `response.json()` 并返回，未检查 `response.ok` 或结果类型。
- `src/lib/bangumi-shared.ts:14-16` — 项目已有非数组转空数组的 `normalizeBangumiCalendar()`，客户端遗漏复用。
- `src/components/BangumiSection.tsx:23-27` — 无保护调用 `bangumiCalendarData.find(...)`。

## 影响

Bangumi 返回 429/500 JSON 错误体或其它非数组响应时，新番区块会触发 `find is not a function`；普通 `Suspense` 不能捕获该渲染错误。

## 修复方向

客户端检查 `response.ok` 并复用 `normalizeBangumiCalendar()`；新增非 ok、错误对象与缓存命中测试。

## 修复记录（2026-07-15）

- `GetBangumiCalendarData()` 现在先检查 `response.ok`，非 2xx 不再读取并透传错误对象。
- 缓存值和网络 JSON 都统一通过 `normalizeBangumiCalendar()`，组件拿到的始终是数组。
- timeout 清理由 `finally` 统一负责，缓存命中时不再提前创建无用定时器。
- 已补非 ok、非数组响应与有效缓存命中测试；最终全量 Jest、typecheck 与 build 已通过。

## 建议动作

`cs-issue`，因为这是可确定触发的首页崩溃路径。
