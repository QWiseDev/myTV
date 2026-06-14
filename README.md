<div align="center">

[![English Doc](https://img.shields.io/badge/Doc-English-blue)](README_EN.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue)](README.md)

</div>

---

# 卡拉米影视 (KLMTV)

<div align="center">
  <img src="public/logo.svg" alt="卡拉米影视 Logo" width="120">
</div>

> **卡拉米影视 (KLMTV)** 是基于 MoonTV 深度二次开发的影视聚合播放平台。项目聚焦自托管使用场景，提供影视聚合搜索、在线播放、网盘搜索、IPTV 直播、AI 推荐、弹幕、播放统计、TVBox 接入和后台配置能力。

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14.2.23-000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.2.0-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9.5-3178c6?logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.17-38bdf8?logo=tailwindcss)
![ArtPlayer](https://img.shields.io/badge/ArtPlayer-5.3.0-ff6b6b)
![HLS.js](https://img.shields.io/badge/HLS.js-1.6.13-ec407a)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey)

</div>

---

## 目录

- [项目状态](#项目状态)
- [功能总览](#功能总览)
- [功能说明](#功能说明)
- [Docker 部署](#docker-部署)
- [首次配置](#首次配置)
- [管理后台](#管理后台)
- [客户端使用](#客户端使用)
- [运维与更新](#运维与更新)
- [技术栈](#技术栈)
- [安全与隐私](#安全与隐私)
- [License](#license)
- [致谢](#致谢)

---

## 项目状态

- 部署后是**空壳应用**，不内置影视播放源和直播源，需要自行配置。
- 推荐使用 Docker / Docker Compose / Dockge / Portainer / Komodo 等 Docker 方式部署。
- 弹幕接口不内置公共服务地址。如需外部弹幕，请在后台配置自建 [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api) 服务地址。
- 本项目仅供学习和个人使用，禁止商业化使用和公开传播实例。

---

## 功能总览

| 功能点 | 说明 |
| ------ | ---- |
| 内容聚合 | 多源影视搜索、短剧、Bangumi 动漫、TMDB 演员搜索、发布日历 |
| 播放体验 | ArtPlayer 播放器、HLS.js、Chromecast、跳过片头片尾、剧集切换优化 |
| 弹幕系统 | 兼容 danmu_api 的第三方弹幕、弹幕样式配置、缓存和性能优化 |
| 网盘搜索 | PanSou 接入、网盘类型筛选、搜索结果缓存 |
| IPTV 直播 | m3u/m3u8 直播源、EPG 节目单、多源聚合、频道搜索 |
| AI 推荐 | OpenAI 兼容接口、模型参数配置、影视推荐对话 |
| 用户系统 | 登录注册、用户组权限、用户等级、非活跃用户清理 |
| 观看记录 | 播放记录、继续观看、新剧集提醒、个人/全局播放统计 |
| TVBox 接入 | TVBox 配置接口、Token 认证、IP 白名单、普通用户访问 |
| 管理后台 | 配置文件、视频源、直播源、分类、缓存、数据迁移、日志查看 |
| 多端使用 | Web、Selene 手机端、OrionTV 大屏端 |
| 存储支持 | Kvrocks、Redis、Upstash、localStorage |

---

## 功能说明

### 内容聚合

- **影视源聚合搜索**：支持多源搜索、流式输出、分页搜索、标题变体和语言感知过滤。
- **视频源管理**：后台可添加、编辑、禁用、排序、导入导出和检测视频源。
- **短剧功能**：支持短剧搜索、播放和详情展示，提供专用移动端 API 代理。
- **Bangumi 动漫**：支持动漫信息检测、Bangumi API 集成、3-6 位 ID 识别和缓存。
- **TMDB 演员搜索**：可配置 TMDB API Key，支持演员搜索、过滤和多语言结果。
- **发布日历**：展示即将上线内容，辅助追踪新剧、新片和更新节奏。

### 播放器与观看体验

- **播放器内核**：基于 ArtPlayer 5.3.0、HLS.js 1.6.13 和弹幕插件。
- **HLS 播放优化**：包含 iPad/iOS 适配、自动播放策略、缓冲和错误提示优化。
- **Chromecast 投屏**：根据浏览器能力检测投屏支持，避开不兼容厂商浏览器。
- **跳过片头片尾**：支持实时标记、可拖拽悬浮配置、剩余时间显示和跨集复用。
- **剧集体验**：选集分组、滚动翻页、剧集切换防抖和状态管理。
- **移动端适配**：优化音量控制、控制栏响应式布局和弹幕面板显示。

### 弹幕系统

- **弹幕来源**：兼容 [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api) 的 `/api/v2/comment` 接口。
- **后台配置**：在**管理后台 > 弹幕配置**填写自建弹幕 API 根地址。
- **无默认公共服务**：未配置地址时不会请求自建弹幕 API，避免默认打到任何个人服务器。
- **内容处理**：自动过滤解说、预告、无效内容，按时间排序并去重。
- **播放性能**：支持 Web Worker、设备分级、硬件加速、分段加载和数量限制。
- **用户配置**：支持字号、速度、透明度、显示区域、防重叠和弹幕类型过滤。

### 网盘搜索

- **PanSou 接入**：可在后台配置 PanSou 服务地址和请求超时时间。
- **网盘类型**：支持百度网盘、阿里云盘、夸克、天翼云盘、UC、移动云盘、115、PikPak、迅雷、123 等。
- **链接类型**：支持磁力链接和电驴链接展示。
- **缓存管理**：搜索结果进入统一缓存，后台可查看和清理。

### IPTV 直播

- **直播源配置**：支持 m3u / m3u8 地址导入。
- **EPG 节目单**：支持 EPG 地址和 `url-tvg` 节目单。
- **频道能力**：支持多源聚合、台标代理、频道搜索和刷新直播数据。
- **后台管理**：可添加、编辑、删除、排序直播源。

### AI 推荐

- **OpenAI 兼容接口**：支持配置 API 地址、API Key、模型、温度和最大 Token。
- **推荐能力**：根据用户输入进行影视推荐，也可解析 YouTube 视频和视频链接。
- **提示词管理**：后台可配置推荐提示词和模型参数。

### 用户与权限

- **登录注册**：支持账号密码登录、用户注册开关和管理员创建用户。
- **Telegram Magic Link**：支持 Telegram Bot 登录和自动 webhook 配置。
- **用户组权限**：可按用户组限制可用视频源和功能能力。
- **用户状态**：支持封禁、解封、角色设置、密码修改和非活跃用户清理。
- **用户等级**：用更友好的等级展示替代大数字登录次数。

### 观看记录与统计

- **继续观看**：保留播放进度，支持跨设备同步。
- **新剧集提醒**：继续观看和新剧集提醒分开展示。
- **播放统计**：统计观看时长、影片数量、最近记录、个人统计和全局统计。
- **收藏管理**：支持影片收藏和用户菜单快捷访问。

### TVBox 与大屏

- **TVBox API**：提供 TVBox 配置接口，兼容常见 TVBox 客户端。
- **安全控制**：支持 Token 认证、IP 白名单和请求频率限制。
- **普通用户访问**：支持普通用户通过专属 Token 访问 TVBox 配置。
- **大屏客户端**：可配合 OrionTV 在 Android TV 和平板上使用。

### 管理与运维

- **配置文件**：支持 JSON 配置编辑和远程配置订阅。
- **源浏览器与检测**：支持源站内容浏览、搜索、健康检查和移动端测试界面。
- **缓存管理**：统一查看和清理 YouTube、网盘、豆瓣、弹幕等缓存。
- **数据迁移**：支持整站数据导入导出和数据库迁移工具。
- **访问日志**：站长可查看访问日志和基础统计。

---

## Docker 部署

### 推荐方案：Kvrocks

Kvrocks 是基于 RocksDB 的持久化 Redis 协议兼容存储，推荐用于生产环境。

```yml
services:
  moontv-core:
    image: ghcr.io/QWiseDev/klmtv:latest
    container_name: moontv-core
    restart: on-failure
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=kvrocks
      - KVROCKS_URL=redis://moontv-kvrocks:6666
      - SITE_BASE=https://your-domain.com
      - NEXT_PUBLIC_SITE_NAME=卡拉米影视
    networks:
      - moontv-network
    depends_on:
      - moontv-kvrocks

  moontv-kvrocks:
    image: apache/kvrocks
    container_name: moontv-kvrocks
    restart: unless-stopped
    volumes:
      - kvrocks-data:/var/lib/kvrocks
    networks:
      - moontv-network

networks:
  moontv-network:
    driver: bridge

volumes:
  kvrocks-data:
```

### Redis 方案

Redis 默认配置可能导致数据丢失，必须开启持久化。

```yml
services:
  moontv-core:
    image: ghcr.io/QWiseDev/klmtv:latest
    container_name: moontv-core
    restart: on-failure
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=redis
      - REDIS_URL=redis://moontv-redis:6379
    networks:
      - moontv-network
    depends_on:
      - moontv-redis

  moontv-redis:
    image: redis:alpine
    container_name: moontv-redis
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - ./data:/data
    networks:
      - moontv-network

networks:
  moontv-network:
    driver: bridge
```

### Upstash 方案

适合无法自托管数据库的场景。先在 [Upstash](https://upstash.com/) 创建 Redis 实例，再填写 HTTPS Endpoint 和 Token。

```yml
services:
  moontv-core:
    image: ghcr.io/QWiseDev/klmtv:latest
    container_name: moontv-core
    restart: on-failure
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=upstash
      - UPSTASH_URL=https://your-instance.upstash.io
      - UPSTASH_TOKEN=your_upstash_token
```

### 启动

```bash
docker compose up -d
```

启动后访问 `http://your-server-ip:3000`，使用 `USERNAME` / `PASSWORD` 登录。

---

## 首次配置

### 1. 配置影视源

进入**管理后台 > 配置文件**，填入资源站配置。

```json
{
  "cache_time": 7200,
  "api_site": {
    "example_source": {
      "api": "http://example.com/api.php/provide/vod",
      "name": "示例资源站",
      "detail": "http://example.com"
    }
  },
  "custom_category": [
    {
      "name": "华语电影",
      "type": "movie",
      "query": "华语"
    },
    {
      "name": "美剧",
      "type": "tv",
      "query": "美剧"
    }
  ]
}
```

字段说明：

- `cache_time`：接口缓存时间，单位秒，建议 3600-7200。
- `api_site`：影视资源站点配置，支持苹果 CMS V10 格式。
- `api_site.*.api`：资源站 vod JSON API 地址。
- `api_site.*.name`：前台显示名称。
- `api_site.*.detail`：可选，网页详情根 URL，用于爬取剧集详情。
- `custom_category`：基于豆瓣搜索的自定义分类。

### 2. 配置弹幕接口

如需外部弹幕：

1. 自行部署 [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api)
2. 进入**管理后台 > 弹幕配置**
3. 填写你的 danmu_api 服务根地址
4. 保存后新加载的播放页会使用最新地址

未配置时不会请求自建弹幕 API。

### 3. 配置可选功能

- **网盘搜索**：管理后台 > 网盘搜索配置
- **AI 推荐**：管理后台 > AI 推荐配置
- **YouTube**：管理后台 > YouTube 配置
- **IPTV 直播**：管理后台 > 直播源配置
- **TVBox 安全**：管理后台 > TVBox 安全配置
- **Telegram 登录**：管理后台 > Telegram 登录配置

---

## 管理后台

访问 `http://your-domain:3000/admin` 并使用站长账号登录。

| 模块 | 主要用途 |
| ---- | -------- |
| 配置文件 | 编辑 JSON 源配置、配置订阅、拉取远程配置 |
| 站点配置 | 站点名称、公告、豆瓣代理、搜索页数、缓存时间、TMDB |
| 用户配置 | 注册开关、用户组、用户权限、封禁、角色、密码 |
| 视频源配置 | 源增删改查、导入导出、排序、检测 |
| 源检测 | 测试源可用性、源站浏览和搜索 |
| 直播源配置 | m3u/m3u8、EPG、频道刷新和排序 |
| 分类配置 | 自定义豆瓣搜索分类 |
| 网盘搜索配置 | PanSou 地址、超时、网盘类型 |
| AI 推荐配置 | OpenAI 兼容接口、模型参数、提示词 |
| YouTube 配置 | YouTube Data API v3 和演示模式 |
| 弹幕配置 | 自建 danmu_api 服务地址 |
| TVBox 安全配置 | Token、IP 白名单、频率限制 |
| 缓存管理 | 查看和清理各类缓存 |
| 数据迁移 | 导入导出整站数据 |
| 访问日志 | 查看站点访问记录 |
| 用户留言 | 查看和处理用户反馈 |

---

## 环境变量

### 必填变量

| 变量 | 说明 | 示例 |
| ---- | ---- | ---- |
| `USERNAME` | 站长账号 | `admin` |
| `PASSWORD` | 站长密码 | `your_secure_password` |
| `NEXT_PUBLIC_STORAGE_TYPE` | 存储类型 | `kvrocks` / `redis` / `upstash` |

### 存储变量

| 变量 | 说明 | 示例 |
| ---- | ---- | ---- |
| `KVROCKS_URL` | Kvrocks 连接 URL | `redis://moontv-kvrocks:6666` |
| `REDIS_URL` | Redis 连接 URL | `redis://moontv-redis:6379` |
| `UPSTASH_URL` | Upstash Endpoint | `https://xxx.upstash.io` |
| `UPSTASH_TOKEN` | Upstash Token | `AxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==` |

### 常用可选变量

| 变量 | 说明 | 默认值 |
| ---- | ---- | ------ |
| `SITE_BASE` | 站点 URL | 空 |
| `NEXT_PUBLIC_SITE_NAME` | 站点名称 | `卡拉米影视` |
| `ANNOUNCEMENT` | 站点公告 | 默认公告 |
| `NEXT_PUBLIC_SHORTDRAMA_API_BASE` | 短剧接口基址 | `https://api.r2afosne.dpdns.org` |
| `NEXT_PUBLIC_SEARCH_MAX_PAGE` | 搜索最大页数 | `5` |
| `NEXT_PUBLIC_DOUBAN_PROXY_TYPE` | 豆瓣数据代理类型 | `direct` |
| `NEXT_PUBLIC_DOUBAN_PROXY` | 自定义豆瓣代理 | 空 |
| `NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE` | 豆瓣图片代理类型 | `direct` |
| `NEXT_PUBLIC_DOUBAN_IMAGE_PROXY` | 自定义图片代理 | 空 |
| `NEXT_PUBLIC_DISABLE_YELLOW_FILTER` | 关闭内容过滤 | `false` |
| `NEXT_PUBLIC_FLUID_SEARCH` | 流式搜索输出 | `true` |

豆瓣代理类型支持 `direct`、`cors-proxy-zwei`、`cmliussss-cdn-tencent`、`cmliussss-cdn-ali`、`custom`。

---

## 客户端使用

### Web

直接访问部署域名即可使用。首次访问未登录页面会跳转到登录页。

### Selene 手机端

[Selene](https://github.com/MoonTechLab/Selene) 是 MoonTV 原作者开发的移动端应用，适合手机使用。

1. 从 [Selene Releases](https://github.com/MoonTechLab/Selene/releases) 下载安装包
2. 在应用设置中填入服务器地址：`https://your-domain.com`
3. 使用站长账号或普通用户账号登录
4. 播放记录和收藏会与网页端同步

注意：Selene 面向手机优化，不适合电视、平板和模拟器。

### OrionTV 大屏端

本项目可配合 [OrionTV](https://github.com/zimplexing/OrionTV) 在 Android TV 和平板上使用。

1. 在设备上安装 OrionTV
2. 配置后端地址：`http://your-domain:3000`
3. 使用站长账号或普通用户账号登录
4. 播放记录会与 Web / Selene 同步

---

## 运维与更新

### 手动更新镜像

```bash
docker compose pull
docker compose up -d
```

### Watchtower 自动更新

```yml
services:
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400 --cleanup
    restart: unless-stopped
```

### 数据备份

- 使用 Kvrocks / Redis 时，定期备份数据卷。
- 迁移服务器前，先导出后台数据或备份存储目录。
- 更新 `latest` 镜像前，建议确认最近变更并保留可回滚版本。

---

## 技术栈

| 分类 | 主要依赖 |
| ---- | -------- |
| 前端框架 | [Next.js 14.2.23](https://nextjs.org/) · App Router |
| UI & 样式 | [Tailwind CSS 3.4.17](https://tailwindcss.com/) · [Framer Motion 12](https://www.framer.com/motion/) |
| 语言 | TypeScript 4.9.5 |
| 播放器 | [ArtPlayer 5.3.0](https://github.com/zhw2590582/ArtPlayer) · [HLS.js 1.6.13](https://github.com/video-dev/hls.js/) · [artplayer-plugin-danmuku 5.2.0](https://github.com/zhw2590582/ArtPlayer) |
| 数据存储 | Kvrocks · Redis · Upstash · localStorage |
| 虚拟化 | [react-window 2.2.0](https://github.com/bvaughn/react-window) · ResizeObserver |
| UI 组件 | [@headlessui/react 2](https://headlessui.com/) · [Lucide Icons](https://lucide.dev/) · [React Icons 5](https://react-icons.github.io/react-icons/) |
| 质量工具 | ESLint · Prettier · Jest · Husky |
| 部署 | Docker · Docker Compose |

---

## 安全与隐私

### 重要建议

1. 使用强 `PASSWORD`。
2. 部署后在后台关闭公开注册，或只允许可信用户注册。
3. 不要公开分享个人实例链接。
4. TVBox 对外使用时建议启用 Token 和 IP 白名单。
5. 不要把密钥、Token、账号密码提交到仓库。

### 免责声明

- 本项目仅供学习和个人使用。
- 请勿用于商业用途或公开服务。
- 本项目不存储任何视频资源，所有内容来自第三方网站。
- 使用者应自行确认使用行为符合当地法律法规。
- 公开分享实例导致的法律问题由使用者自行承担。
- 本项目不在中国大陆地区提供服务，在该地区使用所产生的法律风险及责任属于用户个人行为，与项目无关。

---

## License

[![CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

本项目采用 [CC BY-NC-SA 4.0 协议](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 开源。

- 可以自由分享、复制和修改本项目。
- 必须保留署名和许可协议链接。
- 不得用于商业目的。
- 修改或衍生项目必须以相同许可协议分发。

© 2025 卡拉米影视 (KLMTV) & Contributors

---

## 致谢

### 原始项目

- [MoonTV](https://github.com/MoonTechLab/卡拉米影视) — 原始项目
- [Selene](https://github.com/MoonTechLab/Selene) — 手机端客户端
- [LibreTV](https://github.com/LibreSpark/LibreTV) — 灵感来源

### 核心依赖与数据服务

- [Next.js](https://nextjs.org/) — React 框架
- [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) — 网页视频播放器
- [HLS.js](https://github.com/video-dev/hls.js) — HLS 流媒体支持
- [react-window](https://github.com/bvaughn/react-window) — 虚拟滚动组件
- [Tailwind CSS](https://tailwindcss.com/) — CSS 框架
- [豆瓣](https://movie.douban.com/) — 影视信息数据
- [TMDB](https://www.themoviedb.org/) — 电影数据库
- [Bangumi](https://bangumi.tv/) — 动漫信息
- [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api) — 第三方弹幕接口
- [Zwei](https://github.com/bestzwei) — 豆瓣 CORS 代理
- [CMLiussss](https://github.com/cmliu) — 豆瓣 CDN 服务

---

<div align="center">

如果这个项目对你有帮助，请给个 Star 支持一下。

</div>
