# R · 韧性与回归清单

**对应**：`实施排期.md` R.1 / R.2 · `验收文档.md` §5–§7  
**日期**：2026-09-22  
**原则**：真机项须产品/开发勾选；下列「代码门」由 `node --test test/r-hardening.test.js` 自动断言。

---

## 1. 全里程碑回归（R.1）

| 范围 | 检查项 | 方式 | 状态 |
|------|--------|------|------|
| 门禁 | `node check.js` + `node --test test/*.test.js` | 自动 | 2026-09-22 通过（93+） |
| M0 | 密码登录进连接；微信绑定路径（本地 bot）；未登录拦截；Join 访客除外 | 真机/工具 | 待产品签字栏 |
| M1 | Hub / 名片 / 话题 / FieldTalk 文字+语音 / Join / 已保存占位 | 真机对照 App | 待产品签字栏 |
| M2 | 主页壳 / 设置树 / 编辑发布 / 子页 / 会员 JSAPI 诚实 / Studio 复制 / 退出清会话 | 真机 | 待产品签字栏 |
| M3 | sync 列表 / workspace / 收件箱 / 文本会话 / E2EE 诚实 / 深链 / Tab 红点 | 真机双端互通 | 待产品签字栏 |
| 脏数据 | App 同账号仍正常；公开主页未被误改；Field/Matrix 无重复脏房 | 真机 | 待勾 |

对照 App 同账号时：密码登录 `user_id` 一致；workspace alias `#muuzi-{sha256}-{key}` 同房；明文消息互通。

---

## 2. 弱网 / 杀进程 / 权限拒绝（R.2）

### 2.1 弱网与断网

| 编号 | 场景 | 期望 | 代码门 / 真机 |
|------|------|------|----------------|
| R-N-01 | 创建话题连点 / 弱网重试 | 同一 `Idempotency-Key`，不重复建话题 | 代码：`pages/connect` 持 `_closeKeys`/`_deleteKeys` + create key；真机再验 |
| R-N-02 | 关闭/删除话题弱网重试 | 复用同一 key | 同上 |
| R-N-03 | 会话发文本弱网失败 | 本地 `failed` 气泡 + 可重试；同一 `txnId` | 代码：`matrixChat.sendText` / `retryMessage` |
| R-N-04 | 登录换票失败 | 明确错误；不半登录进 Tab | 真机 + 既有 M0 测试 |
| R-N-05 | Matrix sync 断网 | ready 错误可读；不假装可聊天 | 真机；skeleton 测 unknown token |
| R-N-06 | JSAPI 支付未配/失败 | 诚实提示；不假开通 | 代码：`wechatPay` + membership 页 |

### 2.2 杀进程 / 冷启

| 编号 | 场景 | 期望 | 代码门 / 真机 |
|------|------|------|----------------|
| R-K-01 | 已登录杀进程再开 | `session.restore` 恢复；进业务而非假登录 | 代码：`session.restore` + store keys |
| R-K-02 | FieldTalk 待确认 outbox | 杀进程后可读同一 pending | 代码：`fieldOutbox` 持久槽 |
| R-K-03 | 退出节点 | `clearLocal` 清 Matrix/Creator/sync since；回登录 | 代码 + M2.7 测试 |
| R-K-04 | 深链 `?room=` 冷启 | `pendingRoom` 在 sync ready 后进入会话 | 代码：`app.js` + `messageDeepLink` |

### 2.3 权限拒绝

| 编号 | 场景 | 期望 | 代码门 / 真机 |
|------|------|------|----------------|
| R-P-01 | 拒麦克风 | 文案含「麦克风权限」；不假成功识别 | 代码：`fieldAudioCapture.ensureMicAuth` |
| R-P-02 | 录音中途中断 | 「本次录音未完成或已中断」 | 代码：`onError` / `onStop` |
| R-P-03 | 订阅消息未授权 | 设置页如实显示未授权，不假装已开推送 | 代码：`meSettings` + settings 页 |
| R-P-04 | 选图/上传失败 | 诚实失败；明文附件主路径已通 | 代码：`onAttach` / `matrixMedia` |
| R-P-05 | 体验版打开 dev 页 | 提示并回登录 | 代码：`dev-guard.test.js` |

### 2.4 真机勾选栏（须手测）

```
节点：____________  账号：____________  日期：____________
弱网：☐ R-N-01~06
杀进程：☐ R-K-01~04
权限：☐ R-P-01~03
结论：通过 / 不通过    产品：____  开发：____
```

---

## 3. 自动化

```bash
node check.js
node --test test/*.test.js
```

韧性相关断言集中在 `test/r-hardening.test.js`。
