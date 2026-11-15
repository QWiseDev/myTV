# 独立直播分片代理（segment-proxy）

把 myTV 内置的 `/api/proxy/segment` 拆成独立服务，部署在**离直播源更近**的
服务器上（如国内机器）。主站只负责改写播放列表，播放器直接从这里拉分片，
不再绕道主站所在机房。

```
播放器 ──HTTPS──▶ 124(segment-proxy, 国内) ──▶ 国内直播源（快）
   │
   └─播放列表──▶ 主站 /api/proxy/m3u8 ──经 124 /fetch 代取──▶ 直播源
                 （主站与源不通时也能取到列表，相对路径靠 X-Final-Url 解析）
```

## 服务端点（均仅 GET）

| 端点       | 参数               | 用途                                                                  |
| ---------- | ------------------ | --------------------------------------------------------------------- |
| `/segment` | `url` `ua` `token` | 分片透传，附 CORS 头，播放器浏览器直连                                |
| `/fetch`   | `url` `ua` `token` | 原始抓取（透传上游状态/头），供主站代取播放列表；响应带 `X-Final-Url` |

`token` 仅在服务端设置 `PROXY_TOKEN` 时必须携带。

## 124 上的部署（已按此完成）

```bash
# 1. 服务本体 + systemd（注意 node 路径，本机为 /usr/local/bin/node）
scp segment-proxy.mjs root@124.220.134.40:/opt/segment-proxy/
scp segment-proxy.service root@124.220.134.40:/etc/systemd/system/
#    修改 unit 中 PROXY_TOKEN 与 node 路径后：
systemctl daemon-reload && systemctl enable --now segment-proxy

# 2. nginx HTTPS 入口：复用已放行端口的 IP 证书站点
#    本例挂在 migrated-apps.conf 的 8443 端口下，路径前缀 /seg/
#    location /seg/ { proxy_pass http://127.0.0.1:8100/; }
nginx -t && systemctl reload nginx
```

- 证书为 Let's Encrypt IP 证书（SAN=124.220.134.40，短效，由
  `certbot-ip-renew.timer` 自动续期）。
- 新开端口需在腾讯云安全组放行；8443 已放行故直接复用。
- 服务内置防护：仅 http/https、拒绝回环/内网/链路本地目标（SSRF）、
  30s 建连超时、客户端断开即取消上游。

## 主站接入（环境变量）

```bash
# /opt/mytv/.env
SEGMENT_PROXY_BASE=https://124.220.134.40:8443/seg
SEGMENT_PROXY_TOKEN=<与 124 的 PROXY_TOKEN 一致>
```

`docker compose up -d mytv-core` 重建容器生效。回滚：删除这两个变量并重建，
即回到内置 `/api/proxy/segment`。

与"浏览器直连"的关系：源配置了 `direct`（或用户开启全局直连）时优先直连，
不产生任何分片代理 URL。
