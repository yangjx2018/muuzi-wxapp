# 编辑主页（设计）· 微信 vs App 1:1 对照

**日期**：2026-09-26  
**入口**：小程序「我」→「Links」→ `/pages/me/edit-home/index?section=links`（linksOnly）  
**真值**：`MuuziGit/muuzi/src/screens/app/EditHomeScreen.tsx`（`linksOnly`）+ `StudioContentCard` / `MobileCollection` / `SocialLinkCard`  
**要求**：与手机端 App「主页内容」界面与功能 1:1

> 改代码必须对照本表。禁止再只改文案不补区块。

---

## 0. linksOnly 壳（验收）

| # | App | 小程序 | 状态 |
|---|-----|--------|------|
| 1 | 顶栏「主页内容」+ 返回 + 分享（滚出滚动区，固定） | `eh-links-nav-wrap` fixed + `eh-links-nav-spacer` | ✅ |
| 2 | 身份区：昵称/简介 + 头像 + 社交快捷 | `eh-links-identity` | ✅ |
| 3 | ＋添加内容 / ▤添加合集 / n/8 · 状态 | `eh-links-actions` | ✅ |
| 4 | 空态「让世界认识你」 | `eh-links-empty` | ✅ |
| 5 | 合集摘要卡 → 进合集编辑器 | `eh-col-summary` + 全屏 `eh-col-page`（对齐图2） | ✅ |
| 5a | 合集顶栏：完成 / 已保存 / ••• | `eh-col-page-head` | ✅ |
| 5b | 标题 + ✎、展示方式四宫格图标 | `eh-col-layouts` + CSS icons | ✅ |
| 5c | 成员卡：图标 / 标题 / URL / › / 移出合集 | `eh-col-member` | ✅ |
| 6 | 紧凑内容卡：标题 / URL / SVG 八格工具条 / 展开全字段 | `eh-scc` + `tool-*.svg` | ✅ |
| 6a | 拖拽柄 + 类型 pill + ↑↓ + 开关 | `eh-scc-handle` / `eh-scc-type` | ✅ |
| 6b | 整理内容 / 移到… | `eh-scc-dest` + `moveCollectionLink` | ✅ |
| 6f | 显示规则 → 查看规则设置 → 国家／地区规则弹层（预览未开通） | `eh-rules-dialog` 对齐 App ruleDialog | ✅ |
| 6g | 定时展示 → 未开通徽标 + 开始/结束空框（disabled，不可点选） | `eh-scc-datetime-off` + `picker disabled` 对齐 App `datetime-local disabled` | ✅ |
| 6h | 点击统计 → insightTabs（点击 / 流量来源未开通 / 国家地区未开通）+ 范围说明 + status | `eh-scc-insight-tabs` 对齐 App `.insightTabs` | ✅ |
| 6i | 发布 → 失败须结束处理中并固定底提示（含错误原文） | `eh-publish-feedback` + `_publishWatchdog` 对齐 App publishFeedback | ✅ |
| 7 | 展开后字段 + 布局 + 缩略图上传 | `eh-scc-body`（全 ITEM_FIELDS，含 cover_url） | ✅ |
| 8 | 显示 MuuZi 品牌开关 | `eh-brand-card` | ✅ |
| 9 | 底栏：添加 / 预览 / 设计 / 发布 | `eh-links-toolbar` | ✅ |
| 10 | 设计面板：封面 + 配色 | `linksPanel==='design'` | ✅ |
| 11 | 资料面板：头像 / 昵称 / 简介 | `linksPanel==='profile'` | ✅ |
| 12 | AddContentSheet 目录 | `eh-acs` | ✅ |

**单测**：`node --test test/m2-edit-home.test.js test/collections.test.js`

---

## 1. 已知限制（相对 App）

- 拖拽排序：小程序展示六要点柄 + ↑↓；触控拖拽手势二期（App `CardDragHandle` 指针捕获）
- SocialLinkCard 全量 OAuth 连接面板：首版走展开字段 + Studio 引导；平台连接状态二期
- StudioCardTools 未开通项（重点/规则/定时/访问）：图标与面板已对齐；定时为禁用空日期时间框（对齐 App `datetime-local disabled`），开通前不可点选、不落库
- 随机头像 / boring-avatars：完整「设计」编辑器已有；linksOnly 资料面板仍为上传头像

---

## 2. 完整编辑器（无 section=links）滚动顺序

封面 → 配色 → PROFILE → 合作 → 社交 → SECTIONS → 预览 → 分享 → 发布（既有 full-editor 路径）。
