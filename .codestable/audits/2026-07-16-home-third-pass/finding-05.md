---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "bug-05"
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 05：热门区块失败被伪装成真实空数据

## 速答

聚合和分项 loader 把 HTTP、网络、解析和超时失败统一转换为空数组或 `code: 200`，Hook 随后只关闭 loading；用户看到空横栏但没有错误或重试入口。

## 关键证据

- `src/app/api/home/route.ts:22-42` — 聚合异常返回 HTTP 200 + `EMPTY_HOME_DATA`。
- `src/lib/home-data-loader.ts:59-75` — 非 2xx、网络和 JSON 失败统一返回空快照。
- `src/lib/home-data-loader.ts:88-152` — 电影、TV、综艺超时/失败使用成功形状空列表，Bangumi 返回 `undefined`。
- `src/hooks/useHomeData.ts:122-176` — 空 fallback 被提交并结束各 section loading，没有 error state。

## 影响

热门电影、剧集、综艺或新番加载失败后与真实无内容无法区分；监控也可能把聚合失败记录为 2xx，用户无法只重试失败区块。

## 修复方向

区分 data fallback 与 error，给四个 section 建立独立 error/retry 状态；已有成功数据在刷新失败时继续保留。

## 建议动作

`cs-issue`，因为错误被转成了错误的可见业务状态。

## 修复记录（2026-07-16）

- 聚合 route 异常改为 HTTP 502 + `no-store`，监控不再把失败记成成功 2xx。
- 分项 loader 用 `{ ok, data/error }` 区分成功空数据与失败；失败不再 patch 空数组覆盖已有内容。
- 热门电影、剧集、综艺和新番拥有独立 error/loading/retry 状态，同区重复重试复用一个 in-flight Promise。
- 有旧数据时失败或重试继续显示旧卡片；无数据失败时显示可访问的错误与重试入口。
- 修复记录见 `.codestable/issues/2026-07-16-home-section-reliability/home-section-reliability-fix-note.md`。
