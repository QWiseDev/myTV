---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: bug-02
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 02：TV/综艺共用状态会覆盖已有有效数据

## 速答

TV 与综艺被合并成一个 secondary 可用性和 loading 状态；只缺其中一项时会同时重拉两项，失败 fallback 还会把已有非空数据覆盖成空数组。

## 关键证据（修复前）

- `src/lib/home-data-types.ts:29-33` — 只有 TV 与综艺都非空才算 `hasSecondaryData`。
- `src/lib/home-data-client.ts:33-36` — 两个区块共用 `secondaryLoading`。
- `src/hooks/useHomeData.ts:136-158` — secondary fallback 同时 patch TV 与综艺。
- `src/lib/home-data-loader.ts:105-124` — 两个请求失败/超时都以 `{ code: 200, list: [] }` 解析。
- `src/components/HomeTabContent.tsx:107-136` — 两个区块共同受 `secondaryLoading` 控制。

## 影响

服务端只拿到 TV 或综艺之一时，已有区块会重新显示骨架并重复请求；若重拉失败，原本可展示的数据会被空数组覆盖。

## 修复方向

拆分 TV/综艺 availability 与 loading；缺哪个只补哪个，patch 时保留已有非空 section，并补“部分成功 + 另一项失败”测试。

## 修复记录（2026-07-15）

- 首页 availability 新增独立 `hasTvData` / `hasVarietyData`，loading 同步拆为 `tvLoading` / `varietyLoading`。
- secondary fallback 只请求缺失的 section，patch 时只写本次实际请求的字段；已有 TV 或综艺数据不再被另一项的空 fallback 覆盖。
- `HomeTabContent` 分别消费两项 loading，部分数据可立即展示。
- 已补“只缺综艺时仅补综艺并保留 TV”、独立 loading 和按选择请求的测试；最终全量 Jest、typecheck 与 build 已通过。

## 建议动作

`cs-issue`，因为当前 fallback 会实际丢失可用数据。
