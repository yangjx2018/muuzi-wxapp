# 微信小程序 · 企业主页对等实现

**日期**：2026-09-24  
**主仓**：`MuuziWx`  
**对照真值**：`MuuziGit/muuzi`（手机 App）  
**背景**：领导确认 App 企业主页已完成；需核对小程序是否拉到合适代码。若未实现，按 App **1:1 复原**相关能力（非 Studio 替代）。

---

## 1. 核对结论（开工前）

| 能力 | App（真值） | 小程序（开工前） | 判定 |
|------|-------------|------------------|------|
| 空间切换列出企业 | `SpacesScreen` | `pages/me/spaces` | ✅ 已有 |
| **编辑 / 自动存草稿 / 发布企业主页** | `/me/org/:id/home` → `EditHomeScreen(orgId)` | 仅个人 `edit-home`；无 `orgId` | ❌ 缺失 |
| `saveOrgPage` / `publishOrgPage` | `creator.ts` | 仅有只读 `fetchOrgPage` | ❌ 缺失 |
| **成员与邀请**（席位链接 / 按账号 / 释放） | `/me/org/:id/members` | 无页 | ❌ 缺失 |
| **开通企业版**（节点组织 + link） | `/enterprise/new?from=app` | `enterprise-create` | ✅ 已补 |
| **员工邀请链接加入** | `/enterprise/join/:token` | `enterprise-join?token=` | ✅ 已补 |
| 企业邀请收件箱 + 成员墙授权 | `EnterpriseInvitationsScreen` | `enterprise-invitations` | ✅ 已有 |
| 名片展示企业主页 QR/链接 | `ConnectCardScreen` | `connect/card` + `fetchOrgPage` | ✅ 已有 |
| 名片「编辑」跳企业编辑器 | → `/me/org/:id/home` | → `spaces`（无编辑器） | ⚠️ 半通 |

**一句话**：名片可「看」企业主页；**不能在小程序内编辑/发布企业主页，也不能管成员**。此前 `WX_AUDIT_ISSUES` 写成「有意引导 Studio」——**本任务撤销该有意差，改为与 App 对等**。

---

## 2. App 真值路径（必须对齐）

```text
我的 → 个人与企业空间 (/me/spaces)
  ├─ 选企业 + owner/admin
  │     ├─ 编辑企业主页 → /me/org/:id/home   （同一 EditHomeScreen，走 org API）
  │     └─ 成员与邀请   → /me/org/:id/members
  ├─ 开通企业版 → /enterprise/new?from=app
  └─ 查看企业邀请 → /enterprise/invitations

连接 → 我的名片 → 选企业主页 → 编辑 → 企业编辑器
```

企业主页与个人主页共用编辑器 UI；差异：

- 读写：`GET/PUT …/orgs/:id/page`、`POST …/page/publish`
- 不跑个人 slug 注册、不拉 IG/TikTok 画廊、上传/短链带 `owner=org:{id}`
- 权限：仅 owner/admin（服务端重核）

---

## 3. 实现批次（按序，禁止跳步）

### 批次 A — 平台 API 客户端

文件：`miniprogram/services/creator.js`（+ 新建 `enterpriseOrganization.js`）

- `orgOwner(orgId)` → `org:{id}`
- `saveOrgPage` / `publishOrgPage`
- `fetchOrgMembers` / `searchOrgCandidates` / `inviteOrgMember` / `releaseOrgSeat`
- `createOrgInviteCode` / `deleteOrgInviteCode` / `removeOrgMember`
- `createOrgSeatLink` / `revokeOrgSeatLink` / `seatLinkUrl`
- `nodeOrganizationsReadiness` / `linkNodeOrganization`
- `createEnterpriseOrganization`：直连节点 `GET /cosmac/org/entries` + `POST /cosmac/tenants/self-service`（Matrix token 只发节点）

### 批次 B — 编辑企业主页

文件：`pages/me/edit-home/*`

- 路由：`/pages/me/edit-home/index?org=<orgId>`（对齐 App 语义）
- `bootstrap`：有 `org` 则 `fetchOrgPage`，跳过个人 slug 阶段
- `persist` / `publish`：走 org API
- 短链 / 头像上传：传入 `orgOwner`
- 企业模式不拉 IG/TikTok 媒体
- 标题：`编辑企业主页`；返回失败回落 `spaces?` 保留 org

### 批次 C — 成员与邀请页

新建：`pages/me/org-members/index`（js/wxml/wxss/json）

1:1 对齐 `OrgMembersScreen`：席位摘要、Pro/满席 Studio 复制、席位链接、搜索邀请、账号邀请、旧式邀请码、成员列表释放/移除。

### 批次 D — 开通企业版

新建：`pages/me/enterprise-create/index`

1:1 对齐 `EnterpriseCreateScreen`（`from=app` 语义）：节点建组织 → 填 slug → link → 跳转编辑主页 / 成员。

### 批次 E — 入口接线

- `spaces`：企业 + canManage →「编辑企业主页」「成员与邀请」；底部「开通企业版」
- `connect/card` `goEdit`：org → `edit-home?org=`
- `app.json` 注册新页
- 更新 `WX_AUDIT_ISSUES.md`：撤销「有意引导 Studio」表述

### 批次 F — 单测与复查

- 新增 `test/enterprise-home-parity.test.js`（源码契约：API 导出、路由、入口文案、org 分支）
- 跑既有 `me-subpage` / `m2-edit-home` / `m1-connect-card` 回归
- 复查：个人 edit-home 路径不被 org 分支破坏

---

## 4. 明确不做（本任务边界）

| 项 | 原因 |
|----|------|
| 虚拟企业主体（`vs_*` / subjects） | 非 org 企业主页 |
| 个人店铺 storefront | 独立产品面 |
| App 内购企业 Pro | App 亦引导 Studio 购买 |
| 公开页 SSR 成员墙渲染 | 服务端已有；客户端只编辑/发布 |
| web-view 嵌 Studio | PRD 禁止 |

---

## 5. 验收清单

- [x] 空间选企业 →「编辑企业主页」进入编辑器（源码契约 + 路由）
- [x] `saveOrgPage` / `publishOrgPage` 已接线；名片选企业 → 编辑直达 `edit-home?org=`
- [x] 「成员与邀请」：席位链接 / 按账号 / 释放（对齐 OrgMembersScreen）
- [x] 「开通企业版」：节点组织 + link（对齐 EnterpriseCreateScreen from=app）
- [x] 员工邀请链接加入页（对齐 EnterpriseJoinScreen，`?token=`）
- [x] 个人主页编辑路径：org 分支不覆盖无 org 时的 fetchPage/savePage
- [x] `node --test test/enterprise-home-parity.test.js` 与相关 me 单测通过
- [x] 审计修补：legacy 移除权限对齐 App（仅 owner 可移 admin）
- [x] 审计修补：edit-home banner `bind:back=goBack`（脏草稿先存再退；企业回空间）
- [x] 审计修补：返回企业空间保留选中 org（`?org=` + `me_space_org_id`）
- [ ] **真机**：编辑发布企业主页 → 名片可见；有 Pro 席位时生成链接并由另一账号加入

### 真机 / 开发者工具走查

**自动化脚本**（需先 `npm run devtools`，并在 IDE 里保持已登录；本地 `.e2e-local-credentials.json` 若密码失效会跳过自动登录）：

```bash
node scripts/verify-enterprise-home-smoke.js
```

**手工步骤：**

1. 登录 → **我** → 设置 → **个人与企业空间**
2. 若无企业：点 **开通企业版** → 建组织 → 填 slug → 关联 → **编辑企业主页**
3. 若有企业：选企业 → **编辑企业主页** → 改名称/简介 → 等「已保存」→ **发布**
4. **连接** → 我的名片 → 选该企业 → 应显示已发布内容；点编辑应进 `edit-home?org=`
5. 返回空间应仍选中该企业（不是个人空间）
6. （需企业 Pro）**成员与邀请** → 生成邀请链接 → 另一同节点账号打开  
   `/pages/me/enterprise-join/index?token=…` → 确认加入 → 在「企业与邀请」可开墙展示

**2026-09-24 联调记录：** 开发者工具已能打开并启用 automator:9420；本地 e2e 密码登录对 `im.muuzi.co` 返回凭证错误，未完成登录态冒烟。需人工在 IDE 登录后重跑脚本，或更新 `.e2e-local-credentials.json`。

---

## 6. 状态

| 批次 | 状态 |
|------|------|
| 文档 | ✅ 本文 |
| A API | ✅ |
| B edit-home | ✅ |
| C org-members | ✅ |
| D enterprise-create | ✅ |
| E 入口 | ✅ |
| F 测试复查 | ✅ |
| G enterprise-join | ✅ |
| H DevTools 冒烟脚本 | ✅ `scripts/verify-enterprise-home-smoke.js`（待有效登录态） |
