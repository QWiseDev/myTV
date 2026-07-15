---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: performance-03
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 03：播放记录未决时会先后启动两组 priority 图片

## 速答

首屏把尚未加载的播放记录当作“确定为空”，先优先加载 3 张热门电影；记录返回后又优先加载 3 张继续观看封面。

## 关键证据

- `src/components/HomeClient.tsx:92-102` — `playRecords === null` 时被折成 `{}`，但 loading 单独传递。
- `src/components/HomeTabContent.tsx:67-68` — 仅用空对象判断是否存在继续观看，没有区分“未决”和“已确认为空”。
- `src/components/HomeTabContent.tsx:97-101` — 未发现记录时给前 3 张电影设置 `priority`。
- `src/components/ContinueWatching.tsx:105-117` — 记录返回后，前 3 张继续观看卡片同样设置 `priority`。

## 影响

有继续观看记录的用户会在首屏先后启动两组高优先图片，请求预算从 3 张扩大到最多 6 张，争抢带宽并削弱真正首屏内容的 LCP 优先级。

## 修复方向

把播放记录“未决”纳入 priority 决策，保证首屏只分配一组高优先图片。

## 建议动作

`cs-refactor`，因为目标是收口资源优先级而不改变页面内容。

## 修复记录（2026-07-16）

- 热门电影 priority 现在同时要求播放记录加载完成且确认为空；未决阶段不再提前抢占图片优先级。
- 有继续观看记录时仍由续播前 3 张持有 priority；确认无记录后，电影前 3 张才获得 priority。
- 新增 loading→resolved rerender 回归；全量 Jest 69 suites / 295 tests、typecheck、production build 与目标 ESLint 通过。
