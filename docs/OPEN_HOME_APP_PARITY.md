# 公开主页「看成品」：微信小程序 vs MuuziGit App 1:1 对照

**日期**：2026-09-25  
**主仓**：`MuuziWx`  
**对照真值**：`MuuziGit` 公开页 SSR（`server/api/lib/render-page.js`）+ App `CreatorScreen` / `AudioPlayer`  
**小程序页面**：`pages/me/open-home`（编辑主页「看成品」/ 分享打开主页）

> 本文是实现真值。改代码前先对照本表；改完后逐项勾验收。禁止再用「复制链接」冒充「打开」。

---

## 0. 根因（已复现）

| 现象 | 证据 |
|------|------|
| 图1 点任意条目 → Toast「条目链接已复制」 | `open-home/index.js` → `openItem` → `copyShareUrlFallback` |
| App 点条目 → **打开** URL / 页内播放 / 展示正文 | SSR：`<a href target="_blank">`；音频：`<audio controls>`；自定义：`.note-card` 展示 `body` |
| 小程序把所有 section 压成「标题+箭头」假链接卡 | `sectionsFromPublished` 丢掉 `type` / `image_url` / `price` / `body` |

**复现路径**：编辑主页 → 看成品 → 在原生预览点「个人作品集 / 白噪音 / 店铺 / 合作流程」任一条 → 仅复制。

---

## 1. 图1 功能点逐项对照

| # | 图1 区块 | App（真值）UI | App 点击行为 | 小程序改前 | 目标（1:1） |
|---|----------|---------------|--------------|------------|-------------|
| A | 顶栏品牌 logo | 圆形 `logo.png` | 回站点首页 | 已改 logo | 保持 |
| B | 顶栏分享 | box↑ SVG | `navigator.share` / 复制主页 URL | 已有好友分享+回退 | 保持（分享的是**主页**，不是条目） |
| C | 头像 / 昵称 / 简介 | avatar + name + bio/headline | — | 已有 | 保持 |
| D | 社交圆钮 | `.social` 图标 | 打开社交 URL / mailto | 有图标；点了仍复制 | **打开**（能挂 web-view 则内开，否则进打开页） |
| E | **个人作品集**等 `links` | 白底链接卡 ± 图；箭头 | **打开** `item.url` | 假链接卡 → 复制 | **打开** URL |
| F | **白噪音**等 `audio` | 页内 `<audio>` 或试听轨 | **播放**；非直链则打开试听页 | 当链接复制 | 直链 mp3 等 → **InnerAudio 播放**；否则打开试听页 |
| G | **合作流程**等 `custom` | 笔记卡：标题 + **正文** + 可选 CTA | 正文直接可读；有 url 才打开 | 压成链接 → 复制 | **页内展示 body**；有 url 才「打开」 |
| H | **店铺** `shop` | 双列商品卡：图 / 价 /「购买 →」 | **打开**商品/店铺 URL | 压成链接 → 复制 | **店铺网格 UI** + 打开 URL |
| I | **抖音/TikTok** | 直链卡或可展开画廊/iframe | **打开** TikTok；画廊页内展开 | 压成链接 → 复制 | 打开 URL（画廊能力二期；先打开） |
| J | 页脚「加入 / 条款」 | footer CTA | 展示 | 已有 | 保持 |

---

## 2. 微信平台约束（必须写进实现，禁止装傻）

| 能力 | App | 微信小程序 |
|------|-----|------------|
| 打开任意 https | 系统浏览器 / `_blank` | **仅**已登记「业务域名」可进 `<web-view>` |
| 配置 | 无 | 微信后台业务域名 + `config.WEBVIEW_BUSINESS_HOSTS` 同时命中 |
| 体验版默认 | — | `WEBVIEW_BUSINESS_HOSTS=[]`（防「无法打开该页面」） |

**策略（写死）：**

1. **主页整页**：主机在白名单 → 挂整页 `web-view`（页内所有 `<a>` 与 App SSR 一致）= 最强 1:1。  
2. **原生预览**（未配业务域名时）：必须按 section 类型渲染；点击走 `openLink.openHttps`：  
   - **直链图片**（扩展名或 Unsplash 等图床）→ `wx.previewImage` 全屏查看（不依赖业务域名）；失败进 open-link 页内预览。  
   - **直链视频 / 音频文件** → `pages/me/open-media` 原生播放；失败可复制到浏览器。  
   - 可 embed 的普通网页 → `pages/me/open-link` 挂 web-view；  
   - 音频区直链 → 本页 InnerAudio 播放（与 open-media 并存）；  
   - custom 无 url → 只展示正文，不复制；  
   - 不可 embed 的网页 → 进入 `open-link` **查看页**（标题/说明/预览），**禁止**一上来 Toast「条目链接已复制」；仅在用户点「复制到浏览器打开」时才复制。

> 生产环境：图片/音视频 CDN 主机还需登记到微信 **downloadFile 合法域名**（与业务域名是两套白名单）。开发者工具可关「校验合法域名」联调。

---

## 3. 实现任务（按序，禁止跳步）

### T1 — 对照文档（本文件）✅

### T2 — `services/openLink.js`

- `isDirectAudio(url)` / `isDirectImage(url)` / `isDirectVideo(url)` / `classifyMedia(url)`  
- `canEmbedUrl(url)`（复用 `profileShare.canEmbedHomeUrl`）  
- `openHttps(url, opts)`：图 → `previewImage`；音视频直链 → `open-media`；否则 → `open-link`  
- 禁止默认 `copyShareUrlFallback`

### T3 — `pages/me/open-link` / `pages/me/open-media`

- embed 模式：`<web-view src>`  
- 图片回退：页内 `<image>` +「全屏查看」  
- `open-media`：`<video>` / InnerAudio  
- view 模式：展示 title/note/url +「复制并到浏览器打开」（次要）

### T4 — 重写 `open-home` section 模型与 UI

- `sectionsFromPublished` 保留 `type` 与商品/音频/自定义字段  
- wxml：`links` / `shop` / `audio` / `custom` / 其它  
- `openItem` → `openLink`；音频 `toggleAudio`；custom 无 url 不导航

### T5 — 测试与复验

- 更新 `test/m2-open-home.test.js`：禁止 `条目链接已复制` 作为唯一路径；断言 section type / open-link / audio  
- 手工：各类型点按不出现「假打开」

---

## 4. 验收勾选

- [x] links：点开进入打开页或 web-view，不立即复制 Toast（代码路径已改；待真机点验）
- [x] **直链图片**：`previewImage` 全屏（Unsplash / 常见扩展名）
- [x] **直链视频/音频文件**：`open-media` 原生播放
- [x] audio 直链：本页可播可停（InnerAudioContext）
- [x] custom：正文可见；无 url 不触发复制
- [x] shop：双列图+价；点击打开
- [x] 分享按钮仍分享主页（回归）
- [x] 品牌 logo 仍在（回归）
- [x] 未配业务域名时不挂非法 web-view（回归「无法打开该页面」）
- [x] 单测 `test/m2-open-home.test.js` 覆盖打开路径 / open-link / open-media / 禁止「条目链接已复制」

---

## 5. 已知二期（本批不做，避免半吊子）

- Instagram / TikTok 可展开画廊与 iframe 播放器（需媒体 API + 业务域名）
- 整页 web-view 依赖运营在微信后台登记业务域名后写入 `WEBVIEW_BUSINESS_HOSTS`（见 `docs/P0_微信合法域名清单.md`）

---

## 6. 本批落地文件

| 文件 | 作用 |
|------|------|
| `docs/OPEN_HOME_APP_PARITY.md` | 本对照真值 |
| `miniprogram/services/openLink.js` | 打开 https：图预览 / 音视频播放 / web-view / 查看页（不默认复制） |
| `miniprogram/pages/me/open-link/*` | 内嵌 web-view、图片预览或查看页 |
| `miniprogram/pages/me/open-media/*` | 直链视频 / 音频原生播放 |
| `miniprogram/pages/me/open-home/*` | 按 type 渲染 + 打开/播放 |
| `miniprogram/app.json` | 注册 open-link |
| `test/m2-open-home.test.js` | 回归断言 |