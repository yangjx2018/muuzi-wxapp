# MuuZi 微信小程序 SDD（软件设计说明）

**对应 PRD**：`docs/PRD.md`（v1.1）  
**范围**：登录(M0，含微信登录) → 连接(P0) → 我(P1) → 消息(P2)  
**后端原则**：与 MuuZi 手机 App 共用同一 Platform + 同一用户节点，不新增业务真值库  
**文档版本**：v1.1  
**状态**：设计说明，不含实现代码

---

## 1. 设计目标与约束

### 1.1 目标

- 在微信小程序中复刻 `MuuziGit/muuzi` 的 **登录页** 与登录态三模块页面流、状态机与 API 语义。  
- UI 1:1：登录页对齐图 A / `LoginScreen`；业务模块对齐现网 App。  
- **唯一 UI 例外**：`SocialSignInOptions` 的 Apple/Google **改为微信登录**。

### 1.2 硬约束

1. **禁止** 为聊天、话题、主页草稿另建服务端库。  
2. **禁止** 把 Matrix access token 发给官方 Platform（除既有 Connect 换票协议要求的材料外）。  
3. **禁止** 将仓内 `miniapp/`（D9 只读）直接当作本业务壳而不加登录与三模块。  
4. **禁止** 在小程序登录页保留 Apple/Google 按钮。  
5. 账号密码与微信 `code` **只发往获准端点**（所选节点登录 API / 立项冻结的微信换票 API），不进 Nexus，不进明文日志。  
6. Field 语音：原始音频不落业务库；同意文案与手机端一致。  
7. 幂等：Field 话题 create/close/delete、消息发送重试必须保留 Idempotency / 客户端重试键语义。

### 1.3 对标架构（手机端）

```
iOS WKWebView 壳
    → muuzi React SPA（/login + BottomNav）
        → PLATFORM_API (/api/creator/*)
        → 用户 GuDuu 节点（Matrix CS + Field + login）
```

小程序替换「壳 + SPA」为「原生小程序页面 + 共享逻辑层」，后端三角不变。

---

## 2. 逻辑架构

| 层 | 职责 | 建议落点 |
|----|------|----------|
| 表现层 | WXML/WXSS，1:1 还原 | `miniprogram/pages/**` |
| 状态层 | 会话、Creator、Matrix、VM | `stores/` |
| 领域服务 | 对齐 `muuzi/src/services/*` | `services/` |
| 适配层 | 微信登录、录音、安全存储、分享、支付 | `adapters/wechat/*` |
| 远端 | Platform + Node | 不变 |

```
MuuziWx/miniprogram/
  pages/auth/          # login / join / recover / node
  pages/connect/
  pages/me/
  pages/messages/
  adapters/wechat-login.ts
```

---

## 3. 导航与信息架构

### 3.0 未登录 vs 已登录

| 状态 | 可见 |
|------|------|
| 未登录 | `auth/*`；`connect/join`（访客） |
| 已登录 | Tab：连接 / 消息 / 我 |

`app.onLaunch`：无 Session → `pages/auth/login`；有 Session → 业务 Tab。

### 3.1 TabBar（已确认）

**三 Tab**：连接 · 消息 · 我。不做首页/Muu。登录成功 **固定进入连接**（已确认）。

### 3.2 路由映射

| App | 小程序 | 需登录 |
|-----|--------|--------|
| `/login` | `pages/auth/login` | 否 |
| `/join*` | `pages/auth/join*` | 否 |
| `/recover*` | `pages/auth/recover*` | 否 |
| `/connect*` | `pages/connect/*` | 是（join 除外） |
| `/messages` | `pages/messages/index` | 是 |
| `/me*` | `pages/me/*` | 是 |

---

## 4. 模块设计 · 登录（M0）

### 4.1 页面结构（对齐 LoginScreen）

```
AuthShell(section=主理人入口)
  StepLabel AUTH / 001
  AuthTitle 登录 MuuZi
  AuthLead …
  Notice?（session notice）
  NodePicker
  form: 账号或邮箱 / 密码 / (step-up 验证码) / 忘记密码 / PrimaryAction
  Notice?（error）
  WeChatSignInOptions   ← 替换 Apple/Google
  FooterLink 建立新账号
  LegalNote（节点非 Nexus）
  StatusStrip NODE / READY|REQUIRED
```

### 4.2 账号密码时序（段 A · 密码）

```
选节点 → loginAtNode(node, method, id, password, code?)
  → step_up? → 完成安全验证
  → beginSession → 业务页
  →（按需）loadCreatorSession → 段 B
```

对齐：`services/guduu.ts`、`screens/auth/rules.ts`。

### 4.3 微信登录（段 A · 微信；手机无对等实现）

**UI**：分隔文案「或使用其他方式」+ 单按钮「微信登录」（禁止 Apple/Google）。

**时序（仅段 A · 已确认宿主=所选节点）**：

```
已选节点 → wx.login → POST 当前节点微信登录接口(code, appId…)
  → 已绑定：返回 MatrixLoginResponse 同构会话 → beginSession
  → 未绑定：进入绑定页（绑定成功后再 beginSession）
  → 同节点若该微信号已绑其他 MuuZi：拒绝并提示（禁止一对多）
  → 业务默认页 →（按需）loadCreatorSession → 段 B
```

**硬性交付**：节点侧微信登录契约 + 小程序前端同迭代；M0 必须可用。  
**约束**：跨节点可分别绑定；同节点一微信号仅一个 MuuZi。

### 4.3.1 段 B · 平台换票（与手机相同 · 必须复用）

有 `MuuZiSession` 后，**禁止**用微信 `code` 打 Platform；只走 Connect app-code：

```
issueAppCode:
  POST {nodeOrigin}/cosmac/muuzi/app-code
  Authorization: Bearer <Matrix access_token>
  → app_code (mza_…)

openCreatorSession:
  GET  {PLATFORM_API}/api/creator/config   // method=guduu-connect-app-code
  POST {PLATFORM_API}/api/creator/session
       { node_domain, app_code, client: "miniapp"| "app", … }
  → 校验 creator 与 session.user_id / node 一致
  → Creator session_token
```

实现应对齐 `creator.ts` / `creatorSession.ts` / `muuzi-identity-profile.json`。  
段 B 失败保留段 A；并发换票共用一次（同 `loadCreatorSession`）。

### 4.4 注册与找回

邮箱 → 验证码 → 设密；视觉延续 AuthShell；API 同节点 account。

---

## 5. 会话与鉴权

```
MuuZiSession { user_id, device_id, access_token, node, auth_via? }
CreatorSession { token, creator }
```

冷启动：读 Session → 校验节点 → 可选 loadCreatorSession → Tab。  
Creator 仅 `/api/creator/**`；分项失败隔离。

存储：Matrix/Creator token 加密；Field 访客凭据分 key；skinId 本地。

---

## 6. 模块设计 · 连接 / 我 / 消息

> 须先完成 M0。需求细节见 PRD §5–§7。

### 6.1 连接

Hub / Talk / Continue / Card / Join / Encounters。  
API：`/api/creator/field/v1/*`。语音用 `RecorderManager`。

### 6.2 我

主页壳 + 设置树 + 子页一对一。会员 **微信 JSAPI 支付**；Studio **复制链接**打开（已确认，无 web-view）。

### 6.3 消息

- **已确认路线 A**：小程序内直接跑 Matrix 客户端（精简 SDK 或自研 sync/发信）。  
- 房间与事件真值仍在用户节点；禁止第二套 IM。  
- `ensureWorkspaces` 使用 `#muuzi-{sha256}-{key}` 与 App 同房。  
- E2EE 首期（已确认）：明文/可解密互通；解密失败诚实提示；完整密钥恢复后续再做。

---

## 7. 配置与安全

| 键 | 含义 |
|----|------|
| `PLATFORM_API` | 官方 API Origin |
| 节点 Origin | **首期仅白名单节点**（已确认，如 `im.muuzi.co`）；选择器不展示未登记节点 |
| 微信登录 | **当前所选节点**上的微信 code→Matrix 接口 |
| 小程序 AppId | 构建期注入 |

安全：Token/code 脱敏；Join 无 Creator 写；法律说明不可删；微信失败不得半登录。

---

## 8. 交付里程碑

| 里程碑 | 工程交付 |
|--------|----------|
| **M0** | 登录 1:1 + **微信登录主路径必通** + 密码保留 + 注册/找回 |
| M1 | 连接 |
| M2 | 我 |
| M3 | 消息 + 双端互通 |

---

## 9. 源码对照

| 单元 | 源码 |
|------|------|
| 登录 | `LoginScreen.tsx` |
| 第三方→微信 | `AuthKit.tsx` `SocialSignInOptions` |
| 节点登录 | `guduu.ts` `loginAtNode` |
| 连接/我/消息 | `Connect*` / `ProfileScreen` / `MessagesScreen` |

---

**文档结束（SDD v1.1）**
