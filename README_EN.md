<div align="center">

[![English Doc](https://img.shields.io/badge/Doc-English-blue)](README_EN.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue)](README.md)

</div>

---

# 卡拉米影视 (KLMTV)

<div align="center">
  <img src="public/logo.png" alt="卡拉米影视 Logo" width="120">
</div>

> 🎬 **卡拉米影视 (KLMTV)** is a comprehensive video streaming platform deeply customized from MoonTV. Built on top of the original version, it adds **50+ major feature enhancements** including **YouTube Integration**, **Cloud Drive Search**, **AI Recommendations**, **Short Drama**, **IPTV Live TV**, **Bangumi Anime**, **Playback Statistics**, **Danmaku System**, and more, delivering the ultimate online streaming experience.

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14.2.23-000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.2.0-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9.5-3178c6?logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.17-38bdf8?logo=tailwindcss)
![ArtPlayer](https://img.shields.io/badge/ArtPlayer-5.3.0-ff6b6b)
![HLS.js](https://img.shields.io/badge/HLS.js-1.6.13-ec407a)
![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![Version](https://img.shields.io/badge/Version-1.0.0-orange)

</div>

---

## 📢 Project Overview

This project is a deeply customized version based on **MoonTV**, continuously developed from **v4.3.1** to the current **v1.0.0**, with **50+ major feature modules** and **300+ detailed optimizations** added. The project was officially renamed **卡拉米影视 (KLMTV)** in 2025, focusing on building a smarter, more convenient, and more efficient video aggregation platform. See [CHANGELOG](CHANGELOG) for all new features.

### 💡 Core Enhancement Highlights

#### 🎥 Content Ecosystem Expansion

- **YouTube Integration**: Complete YouTube search, playback, live streaming with cookieless domain support
- **Cloud Drive Search (PanSou)**: Integrated advanced filtering and cache management
- **Short Drama Features**: Search, playback, dedicated detail pages, mobile API proxy
- **IPTV Live TV**: m3u/m3u8 subscriptions, EPG program guide (multi-source & url-tvg support), source aggregation, logo proxy, channel search within current source
- **Bangumi Anime**: Intelligent anime detection, API integration, caching mechanism

#### 🤖 AI Recommendation System

- **AI Content Recommendations**: Support for GPT-5/o series models, dynamic prompt management
- **Multiple Card Types**: Video recommendations, YouTube videos, video link parsing
- **TMDB Actor Search**: Complete actor search, filtering, and caching
- **Release Calendar**: Upcoming content preview and tracking

#### 💬 Danmaku Ecosystem

- **Third-party Danmaku API**: Integrated Tencent Video, iQiyi, Youku, Bilibili platforms, smart content matching prevents trailers
- **Smart Performance Optimization**: Device-based tiered rendering, Web Worker acceleration, hardware acceleration
- **Complete Configuration System**: Font size, speed, opacity, display area, anti-overlap adjustments
- **Smart Caching**: localStorage persistence, 30-minute cache, auto cleanup of expired data
- **Web-exclusive Input**: Simple "Danmu" button for quick sending (auto-hidden on mobile)

#### 📊 User Management Enhancement

- **Telegram Magic Link Authentication**: Secure and convenient Telegram-based login with auto webhook configuration
- **User Level System**: Replaces large login count numbers with friendly level display
- **Playback Statistics**: Complete viewing data statistics, analysis, visualization, global/personal stats tab switching
- **Dual Reminder System**: New episodes (red theme) and continue watching (blue theme) with gradient badges and halo effects
- **User Group Permissions**: Fine-grained permission control for AI Assistant, YouTube features
- **Inactive User Cleanup**: Smart auto-cleanup with detailed configuration and logging

#### 🎮 Player Feature Enhancement

- **Chromecast Casting**: Smart browser detection, auto-excludes OPPO, Xiaomi, Huawei, Samsung vendor browsers
- **iPad/iOS Optimization**: HLS.js official source optimization, smart device detection, multi-attempt autoplay strategy
- **Skip Intro/Outro**: Real-time marking button, draggable floating config window, remaining time mode, position persistence
- **Mobile Optimization**: Volume control hover optimization, responsive controller, danmaku config desktop-only display
- **Episode Group Scrolling**: Playback page episode selection supports scroll pagination for smooth browsing

#### 📱 Interface Experience Optimization

- **Virtual Scrolling**: react-window 2.2.0, smooth loading for massive content, smart container size detection (ResizeObserver)
- **Virtual Scrolling Toggle**: Gradient styles, icons, animations, user switchable display modes
- **Responsive Grid**: 2-8 column adaptive, auto-calculated optimal layout
- **Douban Details Enhancement**: Complete rating, cast & crew, premiere date, duration, production info
- **User Menu Features**: Update reminders, continue watching (with new episode badges), favorites quick access, TVBox settings integration
- **Login Interface Modernization**: Dynamic random wallpapers, gradient cards, responsive design
- **Back to Top Button**: Quick return for long pages like release calendar

#### 🔐 Security & Storage

- **TVBox Complete Ecosystem**:
  - IP whitelist, Token authentication, full API compatibility
  - Deep JAR diagnostic system (file header verification, smart health check)
  - Spider management system (multi-Spider JAR backup sources, fallback proxy, gaotianliuyun third backup source)
  - Regular user access support (`/api/tvbox-config` endpoint)
- **Source Browser & Testing Module**: Source testing, health checks, mobile responsive layout
- **Resource Search API Authentication**: Enhanced security with user authentication
- **Calendar Cache Migration**: Migrated from localStorage to database, cross-device sync support
- **Cache Optimization**: Unified cache management (YouTube, cloud drive, Douban, danmaku)
- **Enhanced Storage Modes**: Full Kvrocks/Redis/Upstash support, memory cache prevents QuotaExceededError
- **User Registration System** (configurable toggle)

---

## ⚠️ Important Notices

### 📦 Project Status

- **Notice**: After deployment, this is an **empty shell project** with **no built-in video sources or live streaming sources**. You need to collect and configure them yourself.
- **Demo Sites**: Public demo instances are for short-term testing only. Databases may be cleaned regularly.

### 🚫 Distribution Restrictions

**Do NOT promote this project on Bilibili, Xiaohongshu (RedNote), WeChat Official Accounts, Douyin (TikTok China), Toutiao, or other Chinese mainland social platforms through videos or articles. This project does NOT authorize any "Tech Weekly/Monthly" projects or sites to include it.**

### 📜 Open Source License

This project is licensed under **CC BY-NC-SA 4.0**, with the following terms:

- ❌ **Commercial use is prohibited**
- ✅ **Personal learning and use is allowed**
- ✅ **Derivative works and distribution are allowed**
- ⚠️ **Any derivative projects must retain this project's address and be open-sourced under the same license**

---

## ✨ Complete Feature List

### 🎬 Content Aggregation

- ✅ Multi-source video aggregation search (streaming output, smart variants, language-aware filtering)
- ✅ YouTube integration (search, live streaming, iframe playback, time filtering & sorting)
- ✅ Cloud drive search (PanSou integration, advanced filtering, cache management)
- ✅ Short drama features (search, playback, dedicated detail pages, mobile API proxy)
- ✅ IPTV live TV (m3u subscriptions, EPG guide, multi-source support, url-tvg, source aggregation, channel search)
- ✅ Bangumi anime (info detection, API integration, 3-6 digit ID support)
- ✅ TMDB actor search (filtering, caching)

### 🤖 Smart Recommendations

- ✅ AI recommendation system (GPT-5/o support, dynamic prompts)
- ✅ Release calendar (upcoming content preview)
- ✅ Douban details enhancement (complete cast & crew info)
- ✅ Smart search optimization (language-aware, fuzzy matching)

### 💬 Danmaku System

- ✅ Third-party danmaku API based on [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api), supporting Tencent, iQiyi, Youku, Bilibili, and more
- ✅ Smart content matching (auto-filter commentary, trailers, irrelevant content)
- ✅ Smart performance optimization (device tiering, Web Worker, hardware acceleration, segmented loading)
- ✅ Complete configuration (font size, speed, opacity, display area, anti-overlap, type masking)
- ✅ Smart caching (localStorage, 30-min expiry, page refresh persistence)
- ✅ Danmaku input (web-only "Danmu" button, auto-hidden on mobile)
- ✅ EXT-X-MEDIA URI handling (prevents HLS audio track loading errors)

### 📊 User Management

- ✅ Telegram Magic Link authentication (secure convenient login, auto webhook config)
- ✅ User level system (replaces large login count numbers)
- ✅ Playback statistics (watch time, video count, recent records, global/personal tab switching)
- ✅ Dual reminder system (new episodes red theme, continue watching blue theme, gradient badges)
- ✅ VideoCard watch update display (replaces popup-style updates)
- ✅ User group permissions (AI, YouTube feature control)
- ✅ Inactive user auto-cleanup (smart config, logging)
- ✅ Login time tracking (enhanced admin analytics)

### 🎮 Player Enhancement

- ✅ Chromecast casting (smart browser detection, excludes vendor browsers)
- ✅ iPad/iOS optimization (HLS.js official source optimization, smart device detection, multi-attempt autoplay retry)
- ✅ Skip intro/outro (real-time marking button, draggable floating window, remaining time mode, cross-episode support)
- ✅ Danmaku config panel (desktop display, mobile hidden)
- ✅ Volume control optimization (hover area optimization, precise detection)
- ✅ Episode switching optimization (debounce, state management, correct playback time reset)
- ✅ Episode group scroll pagination (smooth browsing for large episode counts)

### 🎨 Interface Experience

- ✅ Virtual scrolling (react-window 2.2.0, ResizeObserver smart detection, progressive loading)
- ✅ Virtual scrolling toggle (gradient styles, icons, animations, user switchable)
- ✅ Responsive grid (2-8 column adaptive, actual container width dynamic calculation)
- ✅ Douban details enhancement (rating, cast & crew, premiere date, duration, production info)
- ✅ User menu enhancement (update reminders, continue watching with new episode badges, favorites quick access, TVBox settings)
- ✅ Login/register modernization (dynamic random wallpapers, gradient cards, responsive design)
- ✅ Back to top button (long pages like release calendar)
- ✅ Completed series badges (based on vod_remarks, search API priority)
- ✅ Search result filtering (source, title, year filtering, year sorting)
- ✅ Video card right-click/long-press menu (new tab play, favorites, etc.)

### 🔐 Security & Storage

- ✅ TVBox complete ecosystem (IP whitelist, Token auth, full API compatibility, regular user access)
- ✅ TVBox deep diagnostics (JAR file header verification, smart health check, config field display)
- ✅ Spider management system (multi-JAR backup sources, fallback proxy, gaotianliuyun third backup source)
- ✅ Source browser & testing module (source testing, health checks, mobile responsive)
- ✅ Resource search API authentication (enhanced security)
- ✅ Calendar cache database migration (cross-device sync)
- ✅ Unified cache management system (YouTube, cloud drive, Douban, danmaku)
- ✅ Kvrocks/Redis/Upstash storage (full compatibility handling)
- ✅ Memory cache prevents QuotaExceededError (Kvrocks/Upstash memory cache)
- ✅ User registration system (configurable toggle, admin user creation)
- ✅ Cross-device original episode tracking (prevents API cache issues)

### 🛠️ Technical Optimization

- ✅ ArtPlayer 5.3.0 + HLS.js 1.6.13 (official source optimization)
- ✅ Danmaku plugin 5.2.0 (Web Worker acceleration, useWorker: true, lockTime: 2)
- ✅ Next.js SSR compatibility (dynamic import, client-side loading)
- ✅ Docker build optimization (no-cache flag, dependency verification)
- ✅ TypeScript type safety (const assertion, type annotations)
- ✅ Semantic versioning (Git tag-based, CHANGELOG auto-extraction)
- ✅ HLS.js mobile optimization (buffer strategy, memory management, ABR optimization)
- ✅ Douban details engine refactor (accurate parsing based on real HTML structure)

---

## 🗺 Table of Contents

- [Tech Stack](#-tech-stack)
- [Deployment](#-deployment)
  - [Docker Self-Hosted Deployment](#-docker-self-hosted-deployment)
  - [Recommended: Kvrocks Storage](#-recommended-kvrocks-storage)
  - [Redis Storage](#-redis-storage-risk-of-data-loss)
  - [Upstash Cloud Storage](#️-upstash-cloud-storage-docker)
- [Configuration File](#️-configuration-file)
- [Environment Variables](#-environment-variables)
- [Feature Configuration](#️-feature-configuration)
- [Auto Update](#-auto-update)
- [Mobile App Usage](#-mobile-app-usage)
- [AndroidTV / Tablet Usage](#-androidtv--tablet-usage)
- [Changelog](#-changelog)
- [Security & Privacy Notice](#-security--privacy-notice)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)

---

## 🔧 Tech Stack

| Category       | Main Dependencies                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | [Next.js 14.2.23](https://nextjs.org/) · App Router                                                                                                                                            |
| UI & Styling   | [Tailwind CSS 3.4.17](https://tailwindcss.com/) · [Framer Motion 12](https://www.framer.com/motion/)                                                                                           |
| Language       | TypeScript 4.9.5                                                                                                                                                                               |
| Player         | [ArtPlayer 5.3.0](https://github.com/zhw2590582/ArtPlayer) · [HLS.js 1.6.13](https://github.com/video-dev/hls.js/) · [artplayer-plugin-danmuku 5.2.0](https://github.com/zhw2590582/ArtPlayer) |
| State Mgmt     | React Context API · React Hooks                                                                                                                                                                |
| Data Storage   | Kvrocks · Redis · Upstash · localStorage                                                                                                                                                       |
| Virtualization | [react-window 2.2.0](https://github.com/bvaughn/react-window) · ResizeObserver                                                                                                                 |
| UI Components  | [@headlessui/react 2](https://headlessui.com/) · [Lucide Icons](https://lucide.dev/) · [React Icons 5](https://react-icons.github.io/react-icons/)                                             |
| Code Quality   | ESLint · Prettier · Jest · Husky                                                                                                                                                               |
| Deployment     | Docker · Docker Compose                                                                                                                                                                        |

---

## 🚀 Deployment

### 🐳 Docker Self-Hosted Deployment

This project **only supports Docker or Docker-based platforms** (such as Dockge, Portainer, Komodo, etc.).

### 📦 Recommended: Kvrocks Storage

Kvrocks is a persistent Redis-compatible storage based on RocksDB, recommended for production environments.

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
      # Optional: Site configuration
      - SITE_BASE=https://your-domain.com
      - NEXT_PUBLIC_SITE_NAME=卡拉米影视 (KLMTV)
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

### 🔴 Redis Storage (Risk of Data Loss)

Redis default configuration may lead to data loss. Persistence must be enabled.

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

### ☁️ Upstash Cloud Storage (Docker)

Suitable for scenarios where self-hosted databases are not available. Fully managed Redis service.

1. Register an account at [upstash.com](https://upstash.com/) and create a Redis instance
2. Copy **HTTPS ENDPOINT** and **TOKEN**
3. Use the following configuration:

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

### Start and Initialize

1. Save one of the configurations above as `docker-compose.yml`
2. Start services:

   ```bash
   docker compose up -d
   ```

3. Visit `http://your-server-ip:3000`
4. Login with `USERNAME` / `PASSWORD`
5. Open **Admin Panel > Configuration File** to import video source configuration
6. If external danmaku is needed, open **Admin Panel > Danmaku Configuration** and enter your self-hosted danmaku API base URL

### Update Docker Images

```bash
docker compose pull
docker compose up -d
```

For production, regularly back up Kvrocks/Redis volumes to avoid losing configuration, users, and playback records during container removal or host migration.

## ⚙️ Configuration File

After deployment, it's an empty shell application. You need to fill in the configuration in **Admin Panel > Configuration File**.

### 📝 Configuration Format

```json
{
  "cache_time": 7200,
  "api_site": {
    "example_source": {
      "api": "http://example.com/api.php/provide/vod",
      "name": "Example Resource",
      "detail": "http://example.com"
    }
  },
  "custom_category": [
    {
      "name": "Chinese Movies",
      "type": "movie",
      "query": "华语"
    },
    {
      "name": "US TV Series",
      "type": "tv",
      "query": "美剧"
    }
  ]
}
```

### 📖 Field Description

- **cache_time**: API cache duration (seconds), recommended 3600-7200
- **api_site**: Video resource site configuration
  - `key`: Unique identifier (lowercase letters/numbers)
  - `api`: Resource site vod JSON API address (supports Apple CMS V10 format)
  - `name`: Display name in the interface
  - `detail`: (Optional) Web detail root URL for scraping episode details
- **custom_category**: Custom categories (based on Douban search)
  - `name`: Category display name
  - `type`: `movie` (movies) or `tv` (TV series)
  - `query`: Douban search keyword

### 🎯 Recommended Custom Categories

**Movie Categories**: Popular, Latest, Classic, High-rated, Hidden Gems, Chinese, Western, Korean, Japanese, Action, Comedy, Romance, Sci-Fi, Mystery, Horror, Healing

**TV Series Categories**: Popular, US Series, UK Series, Korean Drama, Japanese Drama, Chinese Drama, Hong Kong Drama, Japanese Animation, Variety Shows, Documentaries

You can also enter specific content like "Harry Potter", which works the same as Douban search.

---

## 🌐 Environment Variables

### Required Variables

| Variable                   | Description    | Example Value                   |
| -------------------------- | -------------- | ------------------------------- |
| `USERNAME`                 | Admin account  | `admin`                         |
| `PASSWORD`                 | Admin password | `your_secure_password`          |
| `NEXT_PUBLIC_STORAGE_TYPE` | Storage type   | `kvrocks` / `redis` / `upstash` |

### Storage Configuration

| Variable        | Description            | Example Value                     |
| --------------- | ---------------------- | --------------------------------- |
| `KVROCKS_URL`   | Kvrocks connection URL | `redis://moontv-kvrocks:6666`     |
| `REDIS_URL`     | Redis connection URL   | `redis://moontv-redis:6379`       |
| `UPSTASH_URL`   | Upstash endpoint       | `https://xxx.upstash.io`          |
| `UPSTASH_TOKEN` | Upstash Token          | `AxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==` |

### Optional Configuration

| Variable                              | Description             | Default  | Options                                                                                 |
| ------------------------------------- | ----------------------- | -------- | --------------------------------------------------------------------------------------- |
| `SITE_BASE`                           | Site URL                | Empty    | `https://example.com`                                                                   |
| `NEXT_PUBLIC_SITE_NAME`               | Site name               | `MoonTV` | Any string                                                                              |
| `ANNOUNCEMENT`                        | Site announcement       | Default  | Any string                                                                              |
| `NEXT_PUBLIC_SEARCH_MAX_PAGE`         | Max search pages        | `5`      | `1-50`                                                                                  |
| `NEXT_PUBLIC_DOUBAN_PROXY_TYPE`       | Douban data proxy type  | `direct` | `direct` / `cors-proxy-zwei` / `cmliussss-cdn-tencent` / `cmliussss-cdn-ali` / `custom` |
| `NEXT_PUBLIC_DOUBAN_PROXY`            | Custom Douban proxy     | Empty    | URL prefix                                                                              |
| `NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE` | Douban image proxy type | `direct` | `direct` / `server` / `img3` / `cmliussss-cdn-tencent` / `cmliussss-cdn-ali` / `custom` |
| `NEXT_PUBLIC_DOUBAN_IMAGE_PROXY`      | Custom image proxy      | Empty    | URL prefix                                                                              |
| `NEXT_PUBLIC_DISABLE_YELLOW_FILTER`   | Disable adult filter    | `false`  | `true` / `false`                                                                        |
| `NEXT_PUBLIC_FLUID_SEARCH`            | Streaming search output | `true`   | `true` / `false`                                                                        |

### Douban Proxy Options

**DOUBAN_PROXY_TYPE Options**:

- `direct`: Server directly requests Douban (may be blocked)
- `cors-proxy-zwei`: Via CORS proxy provided by [Zwei](https://github.com/bestzwei)
- `cmliussss-cdn-tencent`: Tencent Cloud CDN provided by [CMLiussss](https://github.com/cmliu)
- `cmliussss-cdn-ali`: Alibaba Cloud CDN provided by [CMLiussss](https://github.com/cmliu)
- `custom`: Custom proxy (requires `DOUBAN_PROXY`)

**DOUBAN_IMAGE_PROXY_TYPE Options**:

- `direct`: Browser directly requests Douban image domain
- `server`: Server proxies requests
- `img3`: Douban official Alibaba Cloud CDN
- `cmliussss-cdn-tencent`: CMLiussss Tencent Cloud CDN
- `cmliussss-cdn-ali`: CMLiussss Alibaba Cloud CDN
- `custom`: Custom proxy (requires `DOUBAN_IMAGE_PROXY`)

---

## 🎛️ Feature Configuration

All features can be configured in the **Admin Panel** without modifying code or restarting services.

### Admin Panel Access

Visit `http://your-domain:3000/admin` and login with admin account.

### Admin Panel Feature Modules

The admin panel provides the following feature modules (some features are owner-only):

#### 📁 Configuration File (Owner Only)

- **Configuration Subscription**:
  - Subscription URL settings
  - Auto-fetch remote configuration
  - Support for Base58 encoded JSON format
- **Configuration File Editor**:
  - JSON format configuration editor
  - Online save configuration

#### ⚙️ Site Configuration

- **Basic Settings**:
  - Site name
  - Site announcement
- **Douban Data Proxy**:
  - Direct/Cors Proxy/Douban CDN/Custom proxy
  - Custom proxy URL
- **Douban Image Proxy**:
  - Direct/Server proxy/Official CDN/Custom proxy
  - Custom image proxy URL
- **Search Interface Settings**:
  - Max search pages (1-50)
  - API cache time (seconds)
  - Fluid search toggle
- **Content Filtering**:
  - Adult content filter toggle
- **TMDB Actor Search**:
  - TMDB API Key
  - Language settings (Chinese/English/Japanese/Korean)
  - Feature enable toggle

#### 👥 User Configuration

- **User Registration Settings** (Owner Only):
  - User registration toggle
  - Auto cleanup inactive users
  - Retention days configuration
- **User Group Management**:
  - Add/Edit/Delete user groups
  - Available video source permission configuration
- **User List**:
  - Batch assign user groups
  - Add/Edit users
  - Change password
  - Ban/Unban users
  - Set admin privileges
  - Delete users

#### 🎬 Video Source Configuration

- **Video Source Management**:
  - Add video source (name, API address)
  - Batch enable/disable/delete
  - Import/Export video sources (batch config management for backup and migration)
  - Video source validity detection
  - Drag-and-drop sorting
  - Edit/Delete individual sources
- **Source Browser & Testing Module**:
  - Browse and search source content
  - Source testing and health checks
  - Mobile responsive layout
  - Side drawer test results display

#### 📺 Live Source Configuration

- **Live Source Management**:
  - Add live source (name, m3u/m3u8 address)
  - Refresh live source data
  - Drag-and-drop sorting
  - Edit/Delete live sources

#### 🏷️ Category Configuration

- **Custom Categories**:
  - Add/Edit custom categories
  - Drag-and-drop sorting
  - Douban search-based categories

#### 🔍 Cloud Drive Search Configuration

- **Basic Settings**:
  - Cloud drive search feature toggle
  - PanSou service address
  - Request timeout
- **Supported Cloud Disk Types**:
  - Baidu Netdisk, Aliyun Drive, Quark, Tianyi Cloud
  - UC Drive, Mobile Cloud, 115 Drive, PikPak
  - Xunlei, 123 Drive
  - Magnet links, ED2K links

#### 🤖 AI Recommendation Configuration

- OpenAI API configuration
- Model selection and parameters
- Recommendation prompt management

#### 🎥 YouTube Configuration

- YouTube Data API v3 key
- Search and cache configuration
- Feature enable toggle

#### 💬 Danmaku Configuration

- Danmaku API base URL configuration
- Compatible with the `/api/v2/comment` endpoint from [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api)
- If not configured, the self-hosted danmaku API is not requested; newly loaded playback pages use the latest saved URL

#### 🔐 TVBox Security Configuration

- IP whitelist management
- Token authentication configuration
- TVBox API settings

#### 🗄️ Cache Management (Owner Only)

- View and clear various caches
- YouTube, cloud drive, Douban, danmaku cache statistics

#### 📦 Data Migration (Owner Only)

- Import/Export entire site data
- Database migration tools

---

## 🔄 Auto Update

### Using Watchtower

[Watchtower](https://github.com/containrrr/watchtower) can automatically detect and update Docker containers to the latest images.

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

### UI Tools Auto Update

- **Dockge**: Built-in auto-update feature
- **Portainer**: Supports container image auto-update
- **Komodo**: Provides auto-update configuration options

---

## 📱 Mobile App Usage

### Selene - Official Mobile Client

[Selene](https://github.com/MoonTechLab/Selene) is the official mobile app developed by the original MoonTV author, built with Flutter and optimized for mobile phones.

#### Supported Platforms

- **Android**: 5.0+ (API 21), ARM64 architecture only
- **iOS**: 12.0+

#### Key Features

- 🎨 Modern Material Design 3 interface
- 🌗 Dark/light theme support
- 🔍 Multi-source aggregated search (with SSE real-time search)
- ▶️ High-performance FVP video player
- 📊 Smart playback tracking
- ❤️ Personal favorites management
- 🎬 Support for movies, TV series, anime, variety shows

#### Usage Instructions

1. Download the latest version from [Selene Releases](https://github.com/MoonTechLab/Selene/releases)
   - Android: Download `.apk` file
   - iOS: Download `.ipa` file (requires self-signing)
2. Install the app on your phone
3. Open the app, fill in your server domain in settings: `https://your-domain.com`
4. Login with admin or regular user account
5. All playback records and favorites will sync with the web version automatically

#### Important Notes

- ⚠️ Selene is optimized for mobile phones, **NOT compatible with tablets, TVs, emulators**
- ⚠️ For Android TV or tablets, please use OrionTV below

---

## 📺 AndroidTV / Tablet Usage

### OrionTV - Large Screen Client

This project works with [OrionTV](https://github.com/zimplexing/OrionTV) on Android TV and tablets.

#### Applicable Scenarios

- Android TV / Smart TVs
- Android tablets
- Large screen devices

#### Configuration Steps

1. Install OrionTV on your device
2. Configure backend address in OrionTV: `http://your-domain:3000`
3. Login with admin or regular user account
4. Playback records will sync with web and Selene automatically

---

## 📜 Changelog

For complete feature updates and bug fixes, see [CHANGELOG](CHANGELOG).

### Latest Version: v1.0.0 (2025-11-01)

#### Added

- 🔐 Telegram Magic Link Authentication: Implemented secure Telegram-based Magic Link authentication for convenient login
- 🤖 Auto-set Telegram Webhook: Automatically configure Telegram webhook when generating Magic Link, simplifying deployment
- 🔍 Resource Search Endpoint Authentication: Added user authentication check to /api/search/resources endpoint for enhanced API security
- 🎯 Source Browser Integration: Added source browser and testing module to admin panel with full source testing and management capabilities
- 🎨 Enhanced Source Browser UI: Optimized source browser and testing module UI for improved user experience

#### Improved

- 📱 Mobile Source Browser Layout: Improved mobile search controls and responsive layout for various screen sizes
- 🎯 Side Drawer Replaces Modal: Use side drawer instead of centered modal for source test results, optimizing space utilization
- 📐 Drawer Card Layout Optimization: Optimized card layout and spacing in drawer mode

#### Fixed

- 🔧 Prevent Upstash User Auto-deletion: Fixed user auto-deletion issue in Upstash environment and cleanup login statistics
- 🎭 Drawer z-index Fix: Increased drawer z-index to prevent mobile navigation overlay
- 🔄 Prevent Source Jumping: Fixed unexpected source jumping in source browser
- 🚪 Portal Rendering Viewport Fix: Use Portal to render drawer for proper viewport positioning
- 📱 Preview Modal z-index Fix: Fixed source browser preview modal z-index to prevent header overlay
- 🔒 Mobile Bottom Nav Overlay Fix: Prevent mobile bottom navigation from covering preview modal content
- ✨ Remove Short Drama Button Flicker: Removed flickering animation effect from short drama category buttons

### Major Milestone Versions

- **v1.0.0**: Telegram Magic Link authentication, Source Browser & Testing Module, video source import/export, API duplicate call optimization
- **v5.5.0**: User level system, release calendar, inactive user cleanup
- **v5.4.0**: Complete short drama features, playback statistics system
- **v5.3.0**: YouTube integration, AI recommendation system, TVBox security config
- **v5.2.0**: ArtPlayer 5.3.0 upgrade, cloud drive search integration
- **v5.1.0**: Bangumi API, IPTV features, virtual scrolling support
- **v5.0.0**: Douban details engine refactoring
- **v4.3.1**: User registration, danmaku system foundation

View [Complete Changelog](CHANGELOG) for all version changes.

---

## 🔐 Security & Privacy Notice

### ⚠️ Important Security Recommendations

1. **Set Strong Password**: Use a complex `PASSWORD` environment variable
2. **Disable Public Registration**: Close user registration in admin panel
3. **Personal Use Only**: Do not publicly share or distribute your instance link
4. **Comply with Local Laws**: Ensure usage complies with local laws and regulations

### 📋 Disclaimer

- This project is for educational and personal use only
- Do not use for commercial purposes or public services
- All content comes from third-party websites, this site stores no video resources
- Users are solely responsible for legal issues arising from public sharing
- Project developers assume no legal responsibility for user actions
- **This project does not provide services in mainland China**. Legal risks and responsibilities from usage in that region are the user's personal actions, unrelated to this project

---

## 📄 License

[![CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

This project is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

**This means**:

- ✅ You are free to share, copy, and modify this project
- ✅ You must give appropriate credit, provide a link to the license
- ❌ You may not use this project for commercial purposes
- ⚠️ If you remix, transform, or build upon the material, you must distribute your contributions under the same license

© 2025 卡拉米影视 (KLMTV) & Contributors

Based on [MoonTV](https://github.com/MoonTechLab/卡拉米影视) with extensive customization.

---

## 🙏 Acknowledgments

### Original Projects

- [MoonTV](https://github.com/MoonTechLab/卡拉米影视) — Original project
- [Selene](https://github.com/MoonTechLab/Selene) — Official mobile app
- [LibreTV](https://github.com/LibreSpark/LibreTV) — Inspiration source

### Core Dependencies

- [Next.js](https://nextjs.org/) — React framework
- [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) — Powerful web video player
- [HLS.js](https://github.com/video-dev/hls.js) — HLS streaming support
- [react-window](https://github.com/bvaughn/react-window) — Virtual scrolling component
- [Tailwind CSS](https://tailwindcss.com/) — CSS framework

### Data Sources & Services

- [Douban](https://movie.douban.com/) — Movie & TV info data
- [TMDB](https://www.themoviedb.org/) — Movie database
- [Bangumi](https://bangumi.tv/) — Anime information
- [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api) — Third-party danmaku API
- [Zwei](https://github.com/bestzwei) — Douban CORS proxy
- [CMLiussss](https://github.com/cmliu) — Douban CDN service

### Special Thanks

- All sites providing free video APIs
- Open source community contributors
- Users who provide feedback and suggestions

---

## 📊 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=QWiseDev/klmtv&type=Date)](https://www.star-history.com/#QWiseDev/klmtv&Date)

---

<div align="center">

**If this project helps you, please give it a ⭐ Star!**

Made with ❤️ by 卡拉米影视 (KLMTV) Team

</div>
