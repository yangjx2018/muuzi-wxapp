/**
 * 本机联调覆盖（仅 develop 生效）。
 * 复制为 config.local.js 后按需改；config.local.js 已 gitignore。
 * 正式上传体验版/正式版前请删除 miniprogram/config.local.js，
 * 即便忘记删除，trial/release 也不会读取本文件。
 *
 * 说明：
 * - PLATFORM_API 默认仍是 https://www.muuzi.co（名片/Creator）
 * - 本地 bot:9000 默认未挂 MuuZi Connect 换票；名片需节点
 *   POST /cosmac/muuzi/app-code。本地 Connect 关闭时请改用 im.muuzi.co。
 */
module.exports = {
  // PLATFORM_API: 'https://www.muuzi.co',
  // 仅当微信后台已登记对应业务域名时再填，例如：
  // WEBVIEW_BUSINESS_HOSTS: ['im.muuzi.co', 'www.muuzi.co'],
  NODE_WHITELIST: [
    {
      domain: '127.0.0.1:9000',
      nodeOrigin: 'http://127.0.0.1:9000',
      homeserverUrl: 'http://127.0.0.1:8008',
      company_name: 'GuDuu Local',
      instance_id: 0,
      label: '本地 bot :9000（仅开发）',
    },
  ],
};
