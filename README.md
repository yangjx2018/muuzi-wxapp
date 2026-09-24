# muuzi-wxapp（MuuziWx）

MuuZi **登录态**微信小程序：Tab「连接 / 消息 / 我」+ 微信登录。  
与 `MuuziGit/miniapp`（只读 D9）分离；后端与手机 App 同节点 / 同 Platform。

仓库：https://github.com/yangjx2018/muuzi-wxapp

## 状态

- **P0**：工程骨架、配置、安全存储、启动会话路由、域名清单 — 本目录已落地。
- **M0+**：契约 A（GuDuu-OS）微信登录、UI 1:1、Matrix、支付等，见 `docs/`。
- **企业主页**：与 App 对等的编辑/发布、成员与邀请、开通企业版、员工链接加入，见 `docs/ENTERPRISE_HOME_WX_PARITY.md`。

## 本地打开

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入本仓库根目录（`project.config.json`）
3. `npm run check` / `npm test`

正式 AppId 由负责人配置；勿提交 AppSecret。

## 本地 vs 正式域名

| 环境 | 判定 | 节点白名单 | Platform |
|------|------|------------|----------|
| 开发者工具 | `envVersion === develop` | 正式节点 + 可选本地 `127.0.0.1:9000` | 默认 `https://www.muuzi.co` |
| 体验版 / 正式版 | `trial` / `release` | **仅**正式节点 | **仅** `https://www.muuzi.co` |

本地地址不会在正式包里被选用。可选覆盖：复制 `miniprogram/config.local.example.js` → `config.local.js`（已 gitignore；上传前请删除）。

**名片 / Creator**：需要节点提供 `POST /cosmac/muuzi/app-code`。本地 GuDuu 默认 `Connect` 关闭，会 404——请选 **im.muuzi.co**（不必单独启动 MuuZi 客户端）。本地 bot 仍可用于微信登录契约 A 联调。

## 目录

```
miniprogram/
  app.js|json|wxss
  config.js                 # PLATFORM_API、NODE_WHITELIST
  adapters/secure-store.js
  services/session.js|http.js
  pages/auth|connect|messages|me
docs/                       # PRD / SDD / 契约 A / 域名清单
```

## 边界（强制）

- Matrix token 只存本机，不上报 `www.muuzi.co`
- 节点选择仅 `NODE_WHITELIST`（首期 `im.muuzi.co`）
- 不依赖 `GuDuuOS-Team`；不实现 openid 中央存储
- 勿提交 `.e2e-local-credentials.json` / `config.local.js` / `project.private.config.json`
