# 契约 A · 节点微信小程序登录与绑定

**契约 ID**：`muuzi-node-wechat-miniprogram-login.v1`  
**状态**：提案 / 待提供方实现（本文档 **不含代码实现**）  
**对齐产品决策**：`MuuziWx/docs/PRD.md` §3A.6、§11（段 A 宿主=所选节点；同节点一微信号一账号；跨节点可分别绑定）  
**对齐历史命名**：`GuDuuOS/MuuZi`（MuuziGit）`docs/DEVELOPMENT_PLAN.md` §14「契约 A」  
**文档版本**：v1.0  
**日期**：2026-09-21

---

## 0. 一句话

小程序用 `wx.login` 拿到临时 `code`，交给**用户当前所选 GuDuu OS 节点**，换出与密码登录 **同构** 的 Matrix 会话；之后仍走现有 **段 B**（`app-code` → MuuZi Platform Creator 会话）。  
**微信 openid/unionid 只允许落在节点侧**，禁止写入 MuuZi 官方库当作第二套账号。

---

## 1. 该在哪个仓改？（给负责人 / 排期用）

| 角色 | 仓库 | 是否本契约实现方 | 说明 |
|------|------|------------------|------|
| **节点登录提供方（主责）** | **`GuDuuOS/GuDuu-OS`**（本地常对应 `F:\wsl_projects\GuDuuOS`） | **是 · 必须在这里改** | 在 `cosmac/` 现有账号登录族旁实现本契约路由（与 `/cosmac/login/account`、`/cosmac/login/email` 同级）。公共契约定稿后可同步进 `contracts/` |
| **已退役总仓** | **`GuDuuOS/GuDuuOS-Team`** | **否 · 禁止再改** | 2026-09-10 已退役；不得作为实现、CI、部署或契约真值来源（见 `GuDuu-OS/docs/migrations/TEAM_REPOSITORY_RETIREMENT.md`） |
| **MuuZi 产品仓** | **`GuDuuOS/MuuZi`**（MuuziGit） | **否 · 本期不实现本契约服务端** | 只消费节点公开端口；**不得**存微信 openid 作身份真值（`AGENTS.md` / DEVELOPMENT_PLAN §13） |
| **小程序工程** | **`MuuziWx`** | **消费者（契约就绪后再写）** | 调本契约 + 既有段 B；本文档先交给节点开发 |
| **Platform / Marketplace** | 各自私有仓 | **不负责本契约** | 段 B 仍用既有 Connect app-code；本契约不新增 Platform 微信登录 |

### 推荐落地路径（提供方）

1. 在 **`GuDuuOS/GuDuu-OS`** 实现 `cosmac` 路由 + 节点配置项（小程序 AppId/Secret、启用开关）。  
2. 补节点侧测试与运维说明（如何为白名单节点配置微信小程序凭据）。  
3. 若需进入公共契约树：在 `GuDuu-OS/contracts/` 增加机器可读 Schema，发版后由 MuuZi 更新 `guduu-contracts.lock.json`（顺序：扩展契约 → 提供方升级测试 → 消费者接入）。  
4. **不要**在 Team、不要在 MuuZi `server/` 里实现「用 code 换 Matrix」。

---

## 2. 范围与非目标

### 2.1 范围内（本契约）

- 小程序 `code` → 节点签发 Matrix 登录结果（成功态字段与现有账号登录兼容）。  
- 未绑定时的 **绑定已有节点账号** 流程。  
- 能力发现（节点是否启用微信小程序登录）。  
- 同节点绑定唯一性约束。

### 2.2 非目标

- 不改变段 B：`POST /cosmac/muuzi/app-code` 与 `POST {PLATFORM}/api/creator/session`。  
- 不实现 Apple/Google。  
- 不在 MuuZi 官方服务存储 openid/unionid。  
- 不替代邮箱注册主路径（密码/邮箱登录仍保留）。  
- 不解决「任意节点域名」微信合法域名问题（小程序首期白名单节点，见 PRD 决策 7）。

---

## 3. 角色与数据边界

| 数据 | 允许存放位置 | 禁止 |
|------|--------------|------|
| 微信小程序 `AppId` / `AppSecret` | **节点受控配置**（0600 / LoadCredential 等；不进 Git） | 客户端、MuuZi 官方仓、日志明文 |
| `openid` / `unionid`（若使用） | **仅节点数据库**，绑定到本节点 Matrix `user_id` | MuuZi Platform DB、小程序本地当长期身份真值 |
| Matrix `access_token` | 仅小程序安全存储 ↔ 节点 | 不得作为请求体发给 MuuZi Platform（换 Creator 仍只发 `app_code`） |
| 微信临时 `code` | 仅当次请求发往**当前节点** | 日志、分析、二次转发第三方 |

主体格式保持不变：

```text
account_id = guduu-node:<instance_id>:<matrix_user_id>
```

绑定完成后，该主体必须与邮箱/密码登录得到的主体 **可互通**（同一 `user_id`）。

---

## 4. 基础约定

| 项 | 值 |
|----|-----|
| Base URL | 用户所选节点 `nodeOrigin`（HTTPS；与现有登录同源） |
| 协议族 | 与现有 `/cosmac/login/*`、`/cosmac/register/*` 同 CORS / 限流策略族 |
| Content-Type | `application/json; charset=utf-8` |
| 字符编码 | UTF-8 |
| 幂等 | 绑定类写操作必须支持 `Idempotency-Key` 请求头（UUID）；重放返回同一结果 |
| 限流 | 按 IP + `openid`（若已知）+ `appid`；失败也计入；建议不低于账号密码登录同等严格 |
| 时钟 | 响应可含 `server_time`（ISO-8601 UTC），可选 |

路径前缀（提案，提供方可微调但须文档同步）：

```text
/cosmac/login/wechat/miniprogram/
```

---

## 5. API 清单

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| `GET` | `/cosmac/login/wechat/miniprogram/capabilities` | 无 | 是否启用、支持的 appid、是否要求绑定 |
| `POST` | `/cosmac/login/wechat/miniprogram/session` | 无（持微信 `code`） | 用 code 换会话或返回需绑定 |
| `POST` | `/cosmac/login/wechat/miniprogram/bind` | 无（持 `bind_token` + 账号凭证） | 把微信身份绑到已有节点账号并返回会话 |
| `GET` | `/cosmac/login/wechat/miniprogram/binding` | Bearer Matrix | 查询当前账号是否已绑微信（可选） |
| `DELETE` | `/cosmac/login/wechat/miniprogram/binding` | Bearer Matrix | 解绑（可选，v1 可后置） |

以下为 **v1 必须实现**：`capabilities`、`session`、`bind`。  
`binding` GET/DELETE 可标为 v1.1。

---

## 6. 接口详细约定

### 6.1 能力发现

`GET /cosmac/login/wechat/miniprogram/capabilities`

**响应 200**

```json
{
  "protocol": "muuzi-node-wechat-miniprogram-login.v1",
  "available": true,
  "appid": "wx……………………",
  "bind_required_for_new": true,
  "allow_create_account": false,
  "scopes_note": "openid stored on this node only"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `protocol` | string | 必须等于契约 ID |
| `available` | boolean | false 时小程序应诚实提示未开放，不得假登录 |
| `appid` | string \| null | 本节点配置的小程序 AppId；与客户端编译 AppId **必须一致** 才能登录 |
| `bind_required_for_new` | boolean | **本产品决策要求为 true**：未绑定必须走绑定，禁止静默开新号 |
| `allow_create_account` | boolean | **本产品决策要求为 false**（首期）；若未来开放须另发契约修订 |

**响应 503 / available=false**：节点未配置微信凭据或管理员关闭。

---

### 6.2 用 code 换会话（主入口）

`POST /cosmac/login/wechat/miniprogram/session`

**请求**

```json
{
  "appid": "wx……………………",
  "code": "081…………………………………………",
  "device_name": "MuuziWx",
  "client": "miniprogram"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `appid` | 是 | 必须与节点配置及客户端一致 |
| `code` | 是 | `wx.login` 临时码，一次性；节点向微信换 `openid`（及可选 `session_key`，**不得**下发客户端） |
| `device_name` | 否 | 写入 Matrix 设备显示名 |
| `client` | 否 | 建议固定 `miniprogram`，供审计 |

**处理逻辑（提供方必须遵守）**

1. 校验 `appid`、`available`。  
2. 用节点保管的 AppSecret 调用微信 `code2Session`（失败映射错误码，不回传微信原始密钥材料）。  
3. 得到 `openid`（及可选 `unionid`）。  
4. 查本节点绑定表：  
   - **已绑定唯一 `user_id`** → 为该用户签发 Matrix 登录结果（同构于 `/cosmac/login/account` 成功体）→ **200 `status=authenticated`**。  
   - **未绑定** → **200 `status=bind_required`**，返回短时 `bind_token`（**不是** Matrix token）。  
   - **同 openid 映射到多个 user_id**（数据损坏）→ **500/409**，不得随机选一个登录。

**成功已绑定 · 200**

```json
{
  "status": "authenticated",
  "access_token": "…",
  "user_id": "@alice:im.muuzi.co",
  "device_id": "…",
  "refresh_token": null,
  "expires_in_ms": null,
  "homeserver": "https://im.muuzi.co",
  "binding": {
    "openid_bound": true,
    "bound_at": "2026-09-21T12:00:00Z"
  }
}
```

字段 `access_token` / `user_id` / `device_id` 必须与现有 `MatrixLoginResponse` 兼容，以便客户端 `beginSession` 零改编解码。

**需要绑定 · 200**

```json
{
  "status": "bind_required",
  "bind_token": "bdt_…",
  "bind_token_expires_in": 300,
  "bind_methods": ["email_code", "account_password"],
  "message": "请绑定已有 MuuZi 节点账号"
}
```

| 字段 | 说明 |
|------|------|
| `bind_token` | 短时单次或限次令牌；仅用于紧随其后的 `bind`；哈希存库 |
| `bind_token_expires_in` | 秒；建议 ≤ 300 |
| `bind_methods` | 节点支持的绑定证明方式 |

**禁止**：在 `bind_required` 响应中返回任何 Matrix `access_token`。

---

### 6.3 绑定已有账号

`POST /cosmac/login/wechat/miniprogram/bind`  
Header：`Idempotency-Key: <uuid>`

**请求（邮箱验证码示例）**

```json
{
  "bind_token": "bdt_…",
  "method": "email_code",
  "email": "user@example.com",
  "code": "123456"
}
```

**请求（账号密码示例）**

```json
{
  "bind_token": "bdt_…",
  "method": "account_password",
  "account": "alice",
  "password": "…"
}
```

**处理逻辑**

1. 校验 `bind_token` 未过期、未消费，并取出待绑 `openid`。  
2. 按 `method` 验证用户确为该节点已有账号（复用现有邮箱码 / 账号密码校验，**不要**另造一套密码库）。  
3. **唯一性**：若该 `openid` 已绑定其他 `user_id` → **409 `WECHAT_ALREADY_BOUND`**。  
4. 若该 `user_id` 已绑定其他 `openid` → **409 `ACCOUNT_ALREADY_HAS_WECHAT`**（v1 建议一账号一微信号；跨节点不受影响）。  
5. 写入绑定；消费 `bind_token`；签发 Matrix 登录结果 → **200 `status=authenticated`**（体同 6.2 成功态）。

**跨节点**：本接口只作用于**当前节点**。同一微信在节点 N1、N2 分别绑定是允许的，由各节点各自存绑定行。

---

### 6.4 查询绑定（可选 v1.1）

`GET /cosmac/login/wechat/miniprogram/binding`  
`Authorization: Bearer <Matrix access_token>`

```json
{
  "bound": true,
  "appid": "wx…",
  "bound_at": "2026-09-21T12:00:00Z"
}
```

不得返回 `openid` 明文（可返回布尔或脱敏）。

---

## 7. 错误码（机器可读）

响应建议形状：

```json
{
  "error": "人类可读中文",
  "code": "WECHAT_CODE_INVALID"
}
```

| code | HTTP | 含义 |
|------|------|------|
| `WECHAT_LOGIN_UNAVAILABLE` | 503 | 未配置或关闭 |
| `WECHAT_APPID_MISMATCH` | 400 | 客户端 appid 与节点不符 |
| `WECHAT_CODE_INVALID` | 400 | code 无效/过期/已用 |
| `WECHAT_PROVIDER_ERROR` | 502 | 调微信失败 |
| `BIND_TOKEN_INVALID` | 401 | bind_token 无效或过期 |
| `BIND_CREDENTIAL_INVALID` | 401 | 邮箱码/密码错误 |
| `WECHAT_ALREADY_BOUND` | 409 | 该微信号在本节点已绑其他账号 |
| `ACCOUNT_ALREADY_HAS_WECHAT` | 409 | 该账号在本节点已绑其他微信号 |
| `RATE_LIMITED` | 429 | 限流 |
| `INVALID_INPUT` | 400 | 缺字段/格式错 |

---

## 8. 安全要求（提供方验收必查）

1. AppSecret、`session_key` **永不**下发客户端、不进普通日志。  
2. `code` / `bind_token` 一次性或严格限次；防重放。  
3. 绑定写路径必须有 Idempotency-Key。  
4. 不得因微信登录绕过节点既有封禁/停用用户策略。  
5. CORS：仅对已登记小程序相关来源按现有节点登录 CORS 策略开放；服务间断言路由不开放浏览器 CORS。  
6. 审计日志：记录 `appid`、结果码、`user_id`（成功时）、IP；不记录 Secret/code 明文。

---

## 9. 与段 B（既有）的衔接（消费者）

小程序在本契约 `status=authenticated` 之后：

1. 本地 `beginSession(node, { access_token, user_id, device_id, … })`  
2. 需要 Creator API 时：`POST {node}/cosmac/muuzi/app-code`（Bearer Matrix）→ `POST {PLATFORM}/api/creator/session`  
3. **禁止**把微信 `code` 发给 Platform `/api/creator/session`

段 B 契约已存在：`muuzi-identity-profile.json` / `GuDuu-OS` Connect 文档；**本契约不修改段 B**。

---

## 10. 提供方交付物清单（给 GuDuu-OS 开发）

- [ ] 实现 §5–§6 三个必选接口 + 错误码  
- [ ] 节点配置项：启用开关、小程序 AppId、AppSecret（安全注入）  
- [ ] 绑定表：`(instance_id, appid, openid_hash) → user_id` 唯一索引  
- [ ] 与 `/cosmac/login/account` 同等限流与审计  
- [ ] 单元/集成测试：未绑定、已绑定、冲突绑定、错误 code、appid 不一致、幂等 bind  
- [ ] 运维文档：如何为 `im.muuzi.co`（及白名单节点）配置小程序凭据  
- [ ] （可选）公共 `contracts/` Schema + 变更说明，供 MuuZi 锁文件引用  

---

## 11. 消费者验收要点（给 MuuziWx，契约就绪后）

- [ ] `capabilities.available=false` → 诚实提示，不进 Tab  
- [ ] `authenticated` → 与密码登录同一 Session 形状进连接 Tab  
- [ ] `bind_required` → 绑定页；完成前不进业务 Tab  
- [ ] 同节点冲突 409 文案可读  
- [ ] 随后段 B app-code 换票成功；`creator.matrix_user_id` 一致  

---

## 12. 修订规则

- 只增字段不改语义：次版本。  
- 改路径、改 `status` 枚举、放宽「禁止静默开号」：必须升主版本并改契约 ID。  
- 与 MuuZi `DEVELOPMENT_PLAN`「契约 A」冲突时，以**本文件 + GuDuu-OS 合入的公共契约**为准，并回写 MuuZi 文档索引。

---

## 13. 交接说明（可直接转发）

**请 GuDuu-OS（cosmac）同学按本文实现节点侧微信小程序登录；请勿在 GuDuuOS-Team 或 MuuZi server 落 openid。**  
实现合并并在白名单测试节点配置 AppId/Secret 后，通知 MuuziWx / MuuZi 消费者联调段 A → 段 B。

联系上下文：

- 产品决策：`MuuziWx/docs/PRD.md` §11  
- 既有节点登录参考：`GuDuu-OS/cosmac` 路径 `/cosmac/login/account`、`/cosmac/login/email`  
- 段 B 参考：`contracts/guduu_contracts/muuzi-identity-profile.json`

---

**文档结束（契约 A v1.0 · 仅约定，无代码）**
