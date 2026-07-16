---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'performance-06'
nature: performance
severity: P2
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 06：SSR critical 空结果与失败触发重复拉取

## 速答

服务端把 critical 请求失败和合法空结果都压成 `[]`，而缓存与客户端 availability 又把 `[]` 解释为“未加载”，同一次首页访问会在最长 5 秒 SSR 后立即再拉一次电影数据。

## 关键证据

- `src/lib/home-data.server.ts:61-75` — critical 异常被 catch 为 `[]`，并且只有非空数组才写入 60 秒进程缓存。
- `src/lib/home-data-types.ts:28-46` — availability 只按数组长度判断，无法区分成功空、失败与未加载。
- `src/hooks/useHomeData.ts:268-276` — SSR 返回空数组时客户端立即进入 critical fallback 请求。
- `src/lib/home-data-loader.test.ts:93-99` — 客户端 loader 已把“成功空数组”定义为不同于失败的合法结果，当前 SSR contract 丢失了这层语义。

## 影响

上游超时会先占用最长 5 秒 TTFB，再发生 hydration 后重拉；快速失败或合法空结果也不会被短缓存吸收，连续 SSR 会重复访问上游。

## 修复方向

让 SSR 初值携带 loaded/success 语义，或明确缩窄为可失败的 critical result；缓存和客户端 fallback 不再只用数组长度推断状态。

## 建议动作

`cs-issue`，因为需要修正当前“空值即缺失”的运行时契约，而不是单纯改写结构。
