# MuuziWx 功能巡检问题清单（对标 MuuziGit App）

> 规则：只记有源码证据的问题；修完勾掉并写复验证据。禁止编造。

## 批次 0 — 摸底

近期 Bug 修复回归（好友冷启动 / 分享面板 / 面对面停播 / open-home 原生成品预览 / 扫码隔离）均通过源码核对与定向单测。

Tab：App 五 Tab；小程序故意三 Tab（连接/消息/我）。Feed / Discover / 分身对话为有意缺口。

---

## 批次 1 — sheet 点击 / 文案（已修）

| ID | 级 | 状态 | 修复 |
|---|---|---|---|
| WX-1 | P1 | ✅ | `edit-home` 全部 sheet → `catchtap="noop"` |
| WX-2 | P2 | ✅ | `login` bind sheet → `noop` |
| WX-3 | P2 | ✅ | 设置「分身 Muu」改为占位文案 |

过期测试校准：`onLoginTap`、AAC `startMeterPulse`（非产品回退）。

---

## 批次 2–4 — 接线巡检

- 主路径 wxml handler：**无缺失**
- settings 17 个 url：**均在 app.json**
- 全仓：**0** 处 `catchtap="true"`

---

## 批次 5 — 审计新发现（已修）

| ID | 级 | 状态 | 问题与修复 |
|---|---|---|---|
| WX-M-001 | P1 | ✅ | UI 有「删除 Muu 会话」但无实现 → `matrixChat.deleteAiSession`（leave+forget）+ runtime 导出 |
| WX-M-002 | P1 | ✅ | 建私信/接受邀请后立刻进房可能空 → `ensureLocalJoined` 补本地 join |
| WX-ME-01 | P2 | ✅ | 未发布主页也 `refreshPageAddress` → 仅 `published_at` 时解析 |
| WX-C-01 | P1 | ✅ | Join 缺 `guest/preview` → 补路由 + `fieldInvitationPreview` + `entryVerified` 门禁（对齐 App） |

---

## 批次 6 — 认证 join / recover / OTP（已修）

| ID | 级 | 状态 | 问题与修复 |
|---|---|---|---|
| WX-A-01 | P1 | ✅ | 注册成功后等 Creator 才进 Tab → `enterDefaultTab()` 先于 `ensureCreatorSession` |
| WX-A-02 | P1 | ✅ | 微信建号路径丢 `bind_token` → 注册前取出并 `wechat.bindAccount` |
| WX-A-04 | P2 | ✅ | OTP `type="number"` 丢前导零 → login/join/recover verify 改为 `type="digit"` |
| WX-A-03 | P3 | 记录 | 独立 bind 页已死链；主路径走 login sheet；暂不删页 |

证据：`test/auth-audit-fixes.test.js`

---

## 批次 7 — 连接 continue / host / talk / invite（已修）

| ID | 级 | 状态 | 问题与修复 |
|---|---|---|---|
| WX-CF-001 | P1 | ✅ | continue 不订阅 Matrix → `subscribe` + hide/unload 解订 |
| WX-CF-002 | P1 | ✅ | 恢复门禁 OR → App 同款 rooms **AND** field workspace |
| WX-CF-003 | P1 | ✅ | 无效 room 卡住「创建中」→ toast 后 `navigateBack` |
| WX-CF-004 | P2 | ✅ | invite 缺 revision/expiresAt 校验 → `INVALID_INVITE` |
| WX-CF-005 | P2 | ✅ | 发送缺 2000 字节门禁 → `utf8ByteLength` + `canSend` |
| WX-CF-006 | P1 | ✅ | 话题失败无重试 → `retryTopicPrep` +「重试准备话题」 |
| WX-CF-007 | P2 | ✅ | busy 无取消 → `cancelBusyOp` +「取消本次操作」 |
| WX-CF-008 | P3 | 记录 | talk/host 个别未绑 handler；主路径扫码嵌 invite |

证据：`test/connect-field-audit-fixes.test.js`

---

## 批次 8 — 我的子页 shop / contacts / membership / spaces（已修）

| ID | 级 | 状态 | 问题与修复 |
|---|---|---|---|
| WX-ME-02 | P1 | ✅ | contacts 不订阅 Matrix → connect 按钮卡未就绪 → `subscribe` |
| WX-ME-03 | P2 | ✅ | spaces 缺「查看企业邀请」→ 对齐 App SpacesScreen 补入口 |

通过核对（未改）：shop 精选/发布/实物链接、membership 试用/下单/轮询/诚实失败、enterprise-invitations、settings 行路由。

有意差：企业 Pro 套餐购买仍引导 Studio（与 App 一致）；小程序已实现编辑企业主页 / 成员与邀请 / 开通企业版。

证据：`test/me-subpage-audit-fixes.test.js`、`test/enterprise-home-parity.test.js`

---

## 复验

`node --test "test/*.test.js"` → **205 pass / 0 fail**

---

## 有意不做（非回归）

- Feed / Discover / 中心 Muu Tab
- `pages/me/muu` stub（诚实占位）
- 赠卡邀请「暂未开放」
- App 级通用文件附件（PDF/zip）；小程序以图/视频为主
- 企业 Pro 套餐购买（与 App 一样引导 Studio）
- Feed / Discover / 中心 Muu Tab（见上）
