# MuuZi 微信小程序 PRD

**产品**：MuuZi 微信小程序（登录态业务版）  
**范围**：① 登录/注册/找回（含微信登录）② 底部导航第 2、第 5、第 4 模块（优先级：登录 → 连接 → 我 → 消息）  
**对标源码**：`F:\wsl_projects\muzzi\MuuziGit\muuzi\`（React 共享业务层；iOS 仅为 WKWebView 壳）  
**后端**：与 MuuZi 手机 App **同一套后端**（官方 Platform Creator API + 用户所选 GuDuu OS 节点 Matrix / Field）  
**文档版本**：v1.1  
**状态**：仅需求，不实现代码  
**依据截图**：  
- 图 A：登录页 `AUTH / 001`（主理人入口）  
- 图 B：底部 Tab 首页 · **连接** · Muu · **消息** · **我**

---

## 1. 背景与目标

### 1.1 背景

现有 MuuZi 手机端（Web 业务 + iOS 壳）先经登录进入节点会话，再进入底部五 Tab：

| 序号 | 官方名称 | 路由 | 本 PRD |
|------|----------|------|--------|
| **0** | **登录 / 注册 / 找回** | `/login`、`/join*`、`/recover*` | **M0 必做（先于业务 Tab）** |
| 1 | 首页 | `/`、`/discover` | 不在本期 |
| **2** | **连接** | `/connect` | **P0** |
| 3 | Muu | `/muu` | 不在本期（设置内可有跳转入口，见「我」） |
| **4** | **消息** | `/messages` | **P2** |
| **5** | **我** | `/me` | **P1** |

手机端真值：登录 `screens/auth/LoginScreen.tsx`；Tab `components/BottomNav.tsx`。  
仓内既有 `miniapp/` 为 **只读公开主页**（D9），**不是**本 PRD 的登录态产品；本期在 `MuuziWx` 建设登录态业务小程序。

### 1.2 目标

1. **1:1 还原登录页**（主理人入口）：节点选择、账号密码登录、忘记密码/注册链路；「或使用其他方式」在小程序中改为 **微信登录**（替换 App 的 Apple / Google）。  
2. 在微信小程序中 **1:1 还原**「连接」「我」「消息」的界面结构、文案层级、交互状态与业务闭环。  
3. **不新建业务后端**：复用手机 App 同一节点登录与 Platform API、同一 Matrix/Field。  
4. 按优先级交付：**登录(M0) → 连接 → 我 → 消息**，每阶段可独立验收。  
5. 明确微信平台差异（微信登录、录音、E2EE、推送、支付、Studio）的对等策略，禁止 silently 砍功能却仍宣称 1:1。

### 1.3 非目标（本期不做）

- 首页动态/发现、发帖 `/post/new`、Digest、公开创作者浏览的完整复制（可后续迭代）。  
- 中心 Tab「Muu」完整对话产品（「我」设置中允许跳转入口，完整能力另立 PRD）。  
- 中央商城经营、私有 Nexus、改无关后端契约。  
- 将「赠卡邀请」做成可用功能（手机端已标 **暂未开放**，小程序保持同等 stub）。  
- 在小程序中保留 Apple / Google 第三方登录按钮（改为微信登录；账号密码登录保留）。

---

## 2. 用户与场景

### 2.1 主用户

- 已在 GuDuu OS 节点注册的创作者/从业者。  
- 需要当面跨语种沟通、展示名片、管理主页与店铺、在节点内收发消息的人。

### 2.2 关键场景（摘要）

0. **进入产品**：选节点 → 账号密码或微信登录 → 进入连接/我/消息。  
1. **展会/面谈**：打开「连接」→ 面对面交流 / 扫码交流 → 保存轮次 → 事后在消息或话题列表续聊。  
2. **递名片**：展示个人/企业/虚拟主体已发布主页二维码与链接。  
3. **主页经营**：在「我」编辑 Links/Shop、设置、会员、空间、留言箱。  
4. **业务沟通**：在「消息」按工作区查看单聊/频道，收发文本与附件，处理邀请。

### 2.3 登录前提

与手机端一致：用户必须完成 **节点选择 + 节点账号会话（Matrix）**，再通过 GuDuu Connect 换取官方 Creator 会话（`openCreatorSession` / `loadCreatorSession`）。  
扫码访客加入（`/connect/join`）允许 **未登录**，走节点 Guest 能力，不冒充登录用户。

---

## 3. 实现优先级与里程碑

| 阶段 | 模块 | 完成定义 |
|------|------|----------|
| **M0** | **登录 / 注册 / 找回** | 登录页 UI 1:1；节点选择；**微信登录主路径必须打通**；账号密码登录可用；忘记密码与建立账号主路径；未登录不可进业务 Tab。缺微信换票则 M0 不通过 |
| **M1** | 第 2 模块 · 连接 | Hub + 名片 + 面对面/扫码交流主路径 + 现场话题 CRUD + Join 访客入口；UI 1:1 |
| **M2** | 第 5 模块 · 我 | 主页壳 + 设置全树 + 子页功能对等；Studio 外链策略明确 |
| **M3** | 第 4 模块 · 消息 | 收件箱/工作区/筛选/私信/聊天/附件/邀请/房间设置对等；Matrix 同步稳定 |

依赖：M0 为 M1–M3 硬前置。M1 可先于完整消息交付，但「已保存的现场交流」链到消息在 M3 前可用占位，M3 必须打通。

---

## 3A. 模块〇 · 登录（M0 · 必做）

**对标源码**：`LoginScreen.tsx`（`AUTH / 001`）、`AuthKit.tsx`、`NodePicker.tsx`、`auth-routes.tsx`、`services/guduu.ts`（`loginAtNode`）。  
**依据截图**：主理人入口登录页。

### 3A.1 UI 结构（与 App 1:1，第三方区例外）

| 区域 | 内容 | 要求 |
|------|------|------|
| 顶栏品牌 | Logo +「MuuZi」+ `// 主理人入口`；右侧 `SESSION / READY`（或等价会话态）+ 设置齿轮 | 布局/字重对齐 AuthShell |
| 步骤标 | `AUTH / 001`（蓝色小字） | 文案一致 |
| 标题 | 「登录 MuuZi」 | 一致 |
| 导语 | 「用同一个 MuuZi ID，找回你的作品、Agent，和替你说话的分身 Muu。」 | 一致 |
| 通知条 | 如被动下线、Studio 清理未完成等 Notice | 有则展示，可读一次清理 |
| 节点卡片 | 当前节点域名（如 `im.muuzi.co`）+「更换节点」 | 无节点不可登录 |
| 账号 | 标签「账号或邮箱」；占位「请输入账号或邮箱」 | |
| 密码 | 标签「密码」；可显隐 | |
| 安全验证（条件） | 节点 step-up 时出现 6 位邮箱验证码 | 按钮文案改为「完成安全验证」 |
| 辅助 | 「忘记密码？」右对齐 → 找回流程 | |
| 主按钮 | 「登录 MuuZi」+ 右箭头；未就绪禁用 | 浅品牌蓝主按钮 |
| **其他方式** | App：`或使用其他方式` + Apple + Google | **小程序：同分隔文案 + 仅「微信登录」**（见下） |
| 页脚 | 「还没有 MuuZi ID？**建立新账号**」 | |
| 法律说明 | 「账号、密码和 Matrix 会话只会送往你选择的 GuDuu OS 节点，不会送往 Nexus。」 | **必须保留** |
| 底栏 | `MUUZI 身份验证` · `NODE / READY` 或 `NODE / REQUIRED` | |

### 3A.2 第三方登录差异（强制）

| 项 | 手机 App | 微信小程序 |
|----|----------|------------|
| 分隔文案 | 「或使用其他方式」 | **保持不变** |
| 按钮 | Apple + Google（节点 `auth/config` 未就绪则灰显） | **删除 Apple / Google**，改为 **单个「微信登录」** |
| 行为 | 节点 OAuth 就绪后可用 | **已确认**：在**用户所选节点**用 `wx.login` code 换 Matrix 会话 → `beginSession` → 段 B；已绑定直接进，未绑定走绑定页 |
| 可用性 | App 未配置则灰显 | **M0 必须可用** |
| 绑定范围 | — | 同一微信可在**不同节点**分别绑定；**同一节点内**一微信号 **仅对应一个** MuuZi（禁止同节点一对多） |

微信登录产品要求（**硬性，不可降级为 stub**）：

1. **必须对接**：使用微信小程序登录能力（如 `wx.login`）取得 `code`，经获准换票端点换成与手机 App **同一套** GuDuu 节点 Matrix 会话，再 `beginSession`、Creator 换票。不做微信登录 = M0 不通过。  
2. 登录成功后的 Matrix `user_id` / 设备会话与账号密码登录进入的是 **同一套节点身份体系**；未绑定须走绑定页。  
3. **不得**把账号密码或 Matrix token 发往 Nexus；微信 `code` 仅发往**当前所选节点**的获准换票端点，不得进日志明文。  
4. **同节点**：一微信号禁止对应多个 MuuZi；**跨节点**：同一微信可在不同节点分别绑定。  
5. 账号密码登录仍保留；微信为第一推荐。  
6. 须在节点侧补齐微信登录契约（仓内旧只读小程序「契约未提供」豁免不适用本期）。

### 3A.3 关联流程（须可达）

| 流程 | App 路由 | 小程序 | 说明 |
|------|----------|--------|------|
| 登录 | `/login` | `pages/auth/login` | 本页 |
| 建立账号 | `/join` → verify → password | 对等页 | 注册邮箱→验证码→设密 |
| 找回密码 | `/recover` → verify → password | 对等页 | 忘记密码入口 |
| 更换节点 | NodePicker | 对等 | 未选节点主按钮不可用 |
| 设置（登录前） | AuthShell 齿轮 | 对等 | 语言/节点偏好等与 App 一致范围内 |

### 3A.4 登录成功后

1. `beginSession(node, matrixLogin)` 持久化会话。  
2. 进入业务默认页：**固定进入连接 Tab**（已确认）。  
3. 后台/首次进「我」时再 `loadCreatorSession`；失败不得清掉已成功的节点登录，须可重试。

### 3A.5 账号密码登录规则（对齐 `rules.ts` / `loginAtNode`）

- 须已选节点；标识符 + 密码通过 `validLogin`。  
- 支持账号或邮箱；step-up 时须 6 位数字码。  
- 错误展示 Notice，不清空无关键字段（安全码场景除外按 App）。


### 3A.6 两段换票模型（与手机 App 对齐 · 可复用边界）

手机 App **没有**微信进节点；登录与平台身份是 **两段独立过程**。小程序必须按同一模型设计，禁止把微信 `code` 直接打到 Platform 会话接口。

#### 段 A · 节点会话（拿到 Matrix）

| 路径 | 手机 App | 微信小程序 |
|------|----------|------------|
| 账号密码 | `loginAtNode` → `access_token` / `user_id` / `device_id` | **同样复用**（备选） |
| 微信 | **无** | **须新建（已确认宿主=所选节点）**：`wx.login` → **当前节点**用 `code` 换同构 Matrix 会话 → `beginSession`；未绑定走绑定页；同节点一微信号一 MuuZi，跨节点可分别绑定 |

段 A 产出：`MuuZiSession`（只存节点 Matrix 凭证；不发往 Nexus）。

#### 段 B · 平台创作者会话（Connect app-code 换票）

在已有 `MuuZiSession` 之后，与手机 **完全相同**：

1. `POST {nodeOrigin}/cosmac/muuzi/app-code`，`Authorization: Bearer <Matrix access_token>` → 短时 `app_code`（前缀 `mza_`，见 `muuzi-identity-profile.json`）
2. `GET {PLATFORM_API}/api/creator/config` 确认 `method === "guduu-connect-app-code"`
3. `POST {PLATFORM_API}/api/creator/session`，body：`{ node_domain, app_code, client }`（小程序 `client` 可用 `"miniapp"`；协议同 App）
4. 校验返回的 `creator.matrix_user_id` / `node_domain` / `instance_id` 与当前节点账号一致
5. 得到 Creator `session_token`，经 `loadCreatorSession` 缓存；后续只调 `/api/creator/**`

源码真值：`creator.ts` 的 `issueAppCode` / `openCreatorSession`；`creatorSession.ts` 的 `loadCreatorSession`。

#### 可复用结论（产品强制）

| 能力 | 小程序是否复用手机方式 |
|------|------------------------|
| 段 B（app-code → Creator 会话） | **必须原样复用**，不另建第二套平台登录 |
| 段 A 密码登录 | **可复用** |
| 段 A 微信 → Matrix | **手机无实现；须补契约并与段 B 串联** |
| 微信 code 直接换 Creator | **禁止**（Platform 只认节点签发的 `mza_` app_code） |

失败语义与手机一致：段 B 失败 **不得**清掉已成功的段 A 节点登录，须提示可重试。

---

## 4. 全局产品原则

### 4.1 UI 1:1

- 布局、信息层级、主按钮文案、空态/加载/错误文案以手机端当前实现为准（见源码组件，不以设计稿臆造）。  
- 底部导航：**已确认三 Tab** — `连接 · 消息 · 我`（不做首页/Muu）。视觉语言（选中态胶囊、图标线宽、未读红点）对齐 `BottomNav`。  
- 色彩：白底 + 品牌蓝强调；字体与间距对齐现有 `ConnectScreen.css` / `ProfileScreen.module.css` / `MessagesScreen.module.css` 观感。

### 4.2 后端同一

| 能力域 | 真值位置 | 小程序要求 |
|--------|----------|------------|
| 创作者主页/会员/关注/兴趣等 | `PLATFORM_API` + `/api/creator/*` | 同源、同鉴权、同错误码 |
| 现场话题 | `/api/creator/field/v1/*` | 同 |
| 语音识别/翻译/合成 | Field speech API | 同；采集方式可适配微信录音 |
| 现场访客节点 API | 邀请人节点 `guest/*`、`host/*` | 同 |
| 聊天 | 用户节点 Matrix Client-Server | 同账号、同房间，禁止另建 IM |

### 4.3 诚实失败

- 能力未开放（如语音 `speech: false`、赠卡）必须展示与手机端同等说明，不得伪造成功。  
- 网络/鉴权失败：可重试，不静默清空本地待确认数据（Field 本机 outbox 语义保留）。

---

## 5. 模块二 · 连接（P0）

**源码入口**：`ConnectScreen.tsx`、`ConnectCardScreen.tsx`、`ConnectJoinScreen.tsx`、`FieldTalk`、`FieldEncounters`、`FieldHostInvite`、`FieldVisitorFlow` 等。

### 5.1 信息架构与路由

| 小程序页面（建议） | 对标路由 | 说明 |
|--------------------|----------|------|
| 连接 Hub | `/connect` | 默认 Tab |
| 面对面交流 | `/connect/talk` | `FieldTalk` |
| 现场交流续聊 | `/connect/continue` | `FieldResume` |
| 我的名片 | `/connect/card` | QR + 多主体名片 |
| 扫码加入（访客） | `/connect/join`、`/connect/join/:invitationId` | **登录门外** |

### 5.2 Hub 功能清单

| ID | 功能 | 行为 | 状态 |
|----|------|------|------|
| C-01 | 品牌文案区 | `MEET · CONNECT · CONTINUE` / 「每次见面，都有下文。」 | 已上线 |
| C-02 | 面对面交流主 CTA | 进入 talk；副文案「进入后检查语音服务」 | 已上线 |
| C-03 | 我的名片 | 进入名片页 | 已上线 |
| C-04 | 赠卡邀请 | 展开说明「赠卡领取服务尚未开放…」 | **暂未开放（保持 stub）** |
| C-05 | 已保存的现场交流 | 列表：进消息房间 / 「继续扫码交流」 | 已上线（依赖 Matrix） |
| C-06 | 现场话题 | 新建/结束/删除话题；分页；能力门控 | 已上线 |

### 5.3 我的名片

| ID | 功能 | 行为 |
|----|------|------|
| C-10 | 名片源选择 | 个人 / 企业 / 虚拟主体（有权限且未停用） |
| C-11 | 刷新主页列表 | 重拉 orgs + subjects |
| C-12 | 未发布态 | 「先发布这份主页」→ 跳转编辑路径 |
| C-13 | 就绪态 | 头像、名称、headline、二维码、复制链接 |
| C-14 | 编辑入口 | 个人→编辑主页；虚拟→主体编辑；企业→空间 |

**后端**：`fetchPage` / org page / `fetchVirtualPage` / `fetchPublicPage`；QR 由前端对公开 URL 生成。

### 5.4 面对面交流（FieldTalk）

| ID | 功能 | 行为 | 备注 |
|----|------|------|------|
| C-20 | 模式切换 | 「面对面」↔「扫码交流」 | |
| C-21 | 语音能力探测 | `fieldCapabilities`；不可用时文字仍可用 | |
| C-22 | 语音知情同意 | 告知 Google Cloud 处理后再开启 | |
| C-23 | 双语区 | 我 / 对方语言选择；翻转对方区域 | |
| C-24 | 按住说话 | 识别→翻译→可选合成朗读 | 手机端强调 iPhone 原生桥；小程序用微信录音 API 对等 |
| C-25 | 输入文字 | 无麦路径 | |
| C-26 | 确认/翻译并保存 | 同语种可直接保存；跨语种需翻译 | |
| C-27 | 保存到节点 | 写入 Field/Matrix 话题房间 | |
| C-28 | 结束交流 | 对话框：继续 / 去名片 / 回连接 | |
| C-29 | 本机待保存恢复 | 崩溃/杀进程后可恢复 pending | |

**语音语言**：与 `fieldSpeech.ts` 中 `speechLanguages` 清单一致（中英日韩等服务端返回子集）。

### 5.5 现场话题（FieldEncounters）

| ID | 功能 | API |
|----|------|-----|
| C-30 | 能力查询 | `GET /api/creator/field/v1/capabilities` |
| C-31 | 列表分页 | `GET .../encounters` |
| C-32 | 新建独立话题 | `POST .../encounters` + Idempotency-Key |
| C-33 | 结束话题 | `POST .../encounters/:id/close` |
| C-34 | 删除话题 | `POST .../encounters/:id/delete`（需 deletion 能力） |

说明文案需保留诚实边界（以当时线上为准）：话题服务仅保存名称/语言/状态；确认后的交流文字写入消息频道。勿再写「交流文字保存尚未开放」若 Matrix 保存已接通。

### 5.6 访客加入（ConnectJoin）

| ID | 功能 | 行为 |
|----|------|------|
| C-40 | 多语言 UI | 页面语言选择 |
| C-41 | 解析邀请 | URL/存储中的节点与 link |
| C-42 | Guest 能力检查 | 节点 `guest/capabilities` |
| C-43 | 临时文字交流 | `FieldVisitorFlow`：申请加入、等待确认、发文字、历史、结束清设备 |

**强制**：不自动加好友；访客凭据仅本机临时保存；邀请人节点为唯一 Field 宿主。

### 5.7 连接模块验收要点（产品）

- Hub 三块入口与 stub 行为一致。  
- 名片仅展示 **已发布** 主页。  
- 语音关闭时文字路径仍可用；开启路径有同意与失败提示。  
- 话题创建幂等；删除二次确认。  
- 访客路径可在无登录下完成文字交流主路径。

---

## 6. 模块五 · 我（P1）

**源码入口**：`ProfileScreen.tsx` + `/me/*` 子路由（见 `App.tsx`）。

### 6.1 主页壳（非 settings）

| ID | 功能 | 行为 |
|----|------|------|
| M-01 | 身份区 | 头像（进编辑）、显示名、认证标、节点名·域名、账号切换 chevron |
| M-02 | 分享主页 | `ProfileShareSheet` |
| M-03 | 主页地址行 | 无地址时引导设置 |
| M-04 | 快捷工具 | 商品 / 设计 / 设置 |
| M-05 | Links 卡片 | → 编辑主页 links section |
| M-06 | Shop 卡片 | → 我的店铺 |
| M-07 | 账号切换 Sheet | 单账号设备；退出并登录其他账号 |

### 6.2 设置页信息架构（必须完整还原树）

```
设置
├── 通知设置（NotificationSettings）
├── 访客统计（近30天 / 近7天 / 累计；无资格显示 —）
├── 主页
│   ├── 分享主页地址
│   ├── Pro · 自定义主页地址 → /me/address
│   ├── 我的店铺 → /me/shop
│   ├── 主页配色（本地 skins，仅影响公开主页）
│   ├── 留言收件箱 → /me/contacts
│   ├── 代理权限与人设 → /me/agent-access
│   ├── Agent 卡与邀请分享 → /me/sharing
│   ├── 管理主体 → /me/subjects
│   ├── 模块顺序与显示 → /me/edit-home
│   ├── 社交账号绑定 → /me/edit-home
│   └── 网页版 Studio（复制链接打开，已确认）
├── 会员与认证
│   ├── 会员 → /me/membership
│   ├── 认证 → Studio（复制链接；提交在 Studio）
│   └── 个人与企业空间 → /me/spaces
├── 分身 Muu
│   ├── 形象与声音 → /muu（本期可「跳转未实现」或后续 Muu PRD）
│   ├── 我在找·我能做·报价 → /me/interests
│   └── 代我排期 → /me/interests
└── 账号
    ├── 企业与邀请 → /enterprise/invitations
    ├── 账号安全 → /me/security
    └── 退出当前节点
```

另：`/me/saved` 收藏页在手机端可由首页入口进入；若小程序无首页，须在「我」或设置中提供可达入口，避免功能孤儿。

### 6.3 子功能摘要

| 路由 | 能力摘要 | 主要后端 |
|------|----------|----------|
| `/me/edit-home`、`/me/profile` | 草稿编辑、发布、头像上传、模块/社交 | `/api/creator/page`、uploads |
| `/me/shop` | 店铺与精选商品配置 | storefront + creator |
| `/me/address` | Pro slug 修改（付费+冷却） | slug/billing |
| `/me/contacts` | 留言收件箱与接收设置 | Contact Inbox API + Matrix inbox |
| `/me/agent-access` | 代理权限与人设 | Agent Access API |
| `/me/sharing` | Agent 卡分享/邀请 | Agent Sharing API |
| `/me/subjects`、`.../edit` | 虚拟人/虚拟企业 | subjects API |
| `/me/membership` | 套餐/试用/下单 | billing、orders；**支付渠道需微信适配** |
| `/me/interests` | 兴趣与排期规则 | interests |
| `/me/spaces` | 个人/企业空间 | orgs |
| `/me/security` | 改密/找回 | 节点/认证模块 |
| `/enterprise/*` | 企业邀请接受 | invitations |
| `/me/saved` | 收藏动态 | `/api/creator/saved` |

### 6.4 「我」模块产品约束

- 统计、会员、认证状态 **分项失败互不影响**（与 `ProfileScreen` 并行拉取一致）。  
- 认证申请仍在 Studio；小程序 **复制链接** 引导打开，不内嵌 web-view。  
- Apple IAP 不适用；会员购买 **已确认：微信小程序 JSAPI 支付为主**（`createOrder` + 微信渠道）；未配置渠道时诚实提示，禁止假开通。  
- 退出节点必须清除本地会话与 Creator token，不得残留可复用凭据。

---

## 7. 模块四 · 消息（P2）

**源码入口**：`MessagesScreen.tsx`、`MatrixContext`、`matrix-*.ts`。

### 7.1 收件箱

| ID | 功能 | 行为 |
|----|------|------|
| N-01 | 工作区抽屉/轨道 | 全部消息；业务工作区；Muu 工作区；关注私聊；节点工作区 |
| N-02 | 筛选 Tab | 消息 / 未读 / @我 |
| N-03 | 类型筛选 | 全部 / 单聊 / 频道·Muu |
| N-04 | 搜索 | 已同步会话名称与预览 |
| N-05 | 发起私信 | 输入 `@user:server` 创建/打开 DM |
| N-06 | 对话邀请 | 接受 / 拒绝 |
| N-07 | 房间列表项 | 头像、标题、预览、时间、未读；样式对齐 MCN 目录砖 |
| N-08 | 空态 | 按筛选/工作区给出对应文案 |
| N-09 | 未开始的 Muu 会话 | 可展开/收起空 AI 房 |

工作区定义（`matrix-workspaces.ts`）：

- 业务工作区：陌生人咨询与业务沟通  
- Muu 工作区：Muu/Agent 任务与报告  
- Muu 关注私聊区：已关注对象（依赖 `/api/creator/following` 分类）

### 7.2 会话内

| ID | 功能 | 行为 |
|----|------|------|
| N-20 | 消息 / 文件 Tab | 文件视图过滤附件 |
| N-21 | 文本发送 | 草稿按房间隔离；回复引用 |
| N-22 | 表情 | Emoji picker |
| N-23 | 附件 | 照片与视频；文件（含 pdf/zip/音视频等） |
| N-24 | 加载更早 | 保持滚动锚点 |
| N-25 | 失败重试 | 未发出消息可点重试 |
| N-26 | 已读 | 可见且通知就绪后 `markRead` |
| N-27 | 房间设置 | 成员列表、邀请、移出、相关设置 |

### 7.3 与连接的交叉

- 现场交流房间可从连接列表 `?room=` 打开。  
- 业务收件箱频道可链到「留言接收设置」`/me/contacts`。

### 7.4 消息模块风险（必须写入计划）

1. **Matrix 在小程序运行**：需可行的同步方案（小程序内 matrix 客户端或受控中继）。无论何种实现，**房间与事件真值仍在用户节点**，禁止第二套聊天库。  
2. **E2EE**：手机端存在解密失败文案；小程序须明确设备密钥策略，不能静默丢密文。  
3. **推送**：对齐 `notifications` 注册；微信订阅消息/模板消息仅为触达通道，不能替代 Matrix 收件真值。

---

## 8. 跨模块：登录、会话、安全

| 项 | 要求 |
|----|------|
| 未登录拦截 | 除 Join 访客、登录/注册/找回外，业务 Tab 必须跳转登录 |
| 节点选择 | **首期仅白名单节点**（已确认）；禁止硬编码未登记 homeserver 冒充生产 |
| 密码登录 | `loginAtNode` 语义；凭据只到所选节点 |
| 微信登录 | 见 §3A.2；`code` 仅到获准换票端点 |
| Matrix token | 仅存小程序安全存储；**不得**发往官方 Creator API 以外未授权方 |
| Creator 换票 | 走既有 Connect app-code / session；失败关闭 |
| 域名白名单 | request/upload/socket 合法域名登记 Platform + 节点方案 |
| 隐私 | 登录法律说明、Field 语音同意、访客设备清理文案必须保留 |

---

## 9. UI / 内容规范

1. **文案**：优先复用源码中文字符串；赠卡、语音未开放、微信未打通等不得改写为「已支持」。  
2. **登录页**：1:1 还原图 A；仅第三方区改为微信。  
3. **图标**：连接=双人；消息=气泡；我=头像或 profile；选中态对齐 `BottomNav`。  
4. **动效**：滚动时导航可 condensed；不引入无关炫光。  
5. **无障碍**：保留主要按钮名称语义。

---

## 10. 成功指标（产品）

- M0：**微信登录**可进入业务 Tab 并与 App 同账号体系互通；账号密码亦可登录；注册/找回可达。  
- M1：测试账号可完成「建话题 → 文字交流保存 → 展示名片分享」。  
- M2：设置树每项可达；编辑并发布主页后名片 QR 更新。  
- M3：两端（手机 App ↔ 小程序）同一 Matrix 账号互通文本消息。  
- 无「假成功」：能力关闭、支付失败、解密失败均如实提示（微信登录本身不得以「未开通」交差）。

---

## 11. 已确认决策 / 待确认决策

### 已确认

| # | 议题 | 结论 | 确认日期 |
|---|------|------|----------|
| 1 | 底部导航 | **A：三 Tab** — `连接 · 消息 · 我`；不做首页/Muu Tab | 2026-09-21 |
| 2 | 微信登录段 A | **宿主 A：用户所选节点**提供「微信 code → Matrix 会话」。**绑定 3**：已绑定直接进；未绑定走绑定页。**约束**：同一微信可在**不同节点**分别绑定 MuuZi；**同一节点内禁止**一微信号对应多个 MuuZi | 2026-09-21 |
| 3 | 登录成功落地页 | **A：固定进入连接 Tab** | 2026-09-21 |
| 4 | Matrix 技术路线 | **A：小程序内直接跑 Matrix 客户端**；房间真值在节点；禁止第二套聊天库 | 2026-09-21 |
| 4b | E2EE 首期标准 | **A**：明文/可解密消息与 App 互通；解密失败明确提示（不假装已读）；完整跨端密钥恢复放后续 | 2026-09-21 |
| 5 | 会员支付 | **A：微信小程序支付（JSAPI）为主**；走现有 `createOrder` + 微信渠道；未配置则诚实提示不可用（不用 Apple IAP） | 2026-09-21 |
| 6 | Studio 打开方式 | **B：复制 Studio 链接**，提示到手机浏览器/电脑打开（不做小程序内 web-view） | 2026-09-21 |
| 7 | 节点域名 | **A：首期仅支持已登记白名单节点**（如 `im.muuzi.co`）；选择器只列白名单；非白名单提示「小程序暂未接入」 | 2026-09-21 |

### 待确认

无（本期立项项已全部确认）。

### 相关契约交接

- **段 A（微信→节点 Matrix）**：`docs/contracts/CONTRACT_A_NODE_WECHAT_LOGIN.md`  
  - **实现仓：`GuDuuOS/GuDuu-OS`（cosmac）**  
  - **禁止在 `GuDuuOS/GuDuuOS-Team`（已退役）或 MuuZi 官方库存 openid**  
- **段 B（app-code→Creator）**：沿用既有 GuDuu Connect / `muuzi-identity-profile.json`（无需本轮新契约）  
- **实施排期**：`docs/实施排期.md`

---

## 12. 源码索引（需求溯源）

| 区域 | 路径 |
|------|------|
| 登录页 | `muuzi/src/screens/auth/LoginScreen.tsx` |
| 认证壳/第三方区 | `muuzi/src/screens/auth/AuthKit.tsx`（`SocialSignInOptions`） |
| 认证路由 | `muuzi/src/screens/auth/auth-routes.tsx` |
| 节点选择 | `muuzi/src/screens/auth/NodePicker.tsx` |
| 节点登录 API | `muuzi/src/services/guduu.ts` → `loginAtNode` |
| Tab 定义 | `muuzi/src/components/BottomNav.tsx` |
| 路由表 | `muuzi/src/App.tsx` → `AppRoutes` |
| 连接 / 我 / 消息 | 见 v1.0 各节索引 |
| 既有只读小程序（非本期） | `MuuziGit/miniapp/` |

---

**文档结束（PRD）**
