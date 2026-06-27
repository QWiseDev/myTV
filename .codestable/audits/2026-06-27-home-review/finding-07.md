---
doc_type: audit-finding
audit: 2026-06-27-home-review
finding_id: maintainability-07
nature: maintainability
severity: P2
confidence: medium
suggested_action: cs-refactor
status: resolved
---

# Finding 07：`source+id` 存储 key 解析散落且不一致

## 速答

首页继续观看、收藏夹和播放记录操作都在手写解析 `source+id` 存储 key，有的用 `split('+')`，有的用 `indexOf('+')`。这让 delimiter 约定变成隐式知识，也给包含 `+` 的 id 留下边界风险。

## 关键证据

- `src/lib/db.client.ts:652` — 客户端存储 key 由 `generateStorageKey(source, id)` 生成。
- `src/lib/db.client.ts:653` — 实现是模板字符串 `` `${source}+${id}` ``。
- `src/components/ContinueWatching.tsx:122` — 首页继续观看组件内定义 `parseKey`。
- `src/components/ContinueWatching.tsx:123` — 用 `key.split('+')` 解析 source 和 id。
- `src/hooks/usePlayRecordActions.ts:42` — 删除播放记录时也用 `key.split('+')`。
- `src/hooks/useFavoriteItems.ts:42` — 收藏夹改用 `key.indexOf('+')`。
- `src/hooks/useFavoriteItems.ts:43` — source 取 delimiter 前。
- `src/hooks/useFavoriteItems.ts:44` — id 取 delimiter 后全部内容。
- `src/app/api/playrecords/route.ts:122` — 服务端保存播放记录时也手写 `key.split('+')`。
- `src/app/api/favorites/route.ts:99` — 服务端保存收藏时同样手写 `key.split('+')`。

## 影响

目前 source 和 id 大多来自站点配置，通常不会触发；但解析规则分散后，任何 delimiter 变化或 id 中包含 `+` 的源都会需要多点同步修改。维护成本和边界风险都偏高。

## 修复方向

在共享位置提供 `parseStorageKey()`，明确 delimiter 规则、返回值和非法 key 行为；逐步替换首页、收藏夹、播放记录 API 和追更逻辑中的手写解析。

## 处理结果

已新增 `src/lib/storage-key.ts`，统一 `generateStorageKey()` 和 `parseStorageKey()`；项目内 `key.split('+')` / `key.indexOf('+')` 手写解析已清零，并新增解析测试。

## 建议动作

`cs-refactor`，因为这是统一共享约定的低风险重构。
