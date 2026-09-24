/**
 * 构建期公开配置。禁止写入微信后台密钥、生产私钥或带凭据 URL。
 * 正式 AppId 由负责人在微信开发者工具 / project.config.json 配置。
 *
 * 环境策略（禁止正式包连本地）：
 * - develop（开发者工具）：可叠加 NODE_WHITELIST_LOCAL
 * - trial / release：只用 NODE_WHITELIST_PRODUCTION + 正式 PLATFORM_API
 *
 * 可选本机覆盖：复制 config.local.example.js → config.local.js（已 gitignore），
 * 仅 develop 读取；正式上传前请删除 miniprogram/config.local.js。
 *
 * 微信公众平台「服务器域名」须另登记：见 docs/P0_微信合法域名清单.md
 */
var PRODUCTION_PLATFORM_API = 'https://www.muuzi.co';

var NODE_WHITELIST_PRODUCTION = [
  {
    domain: 'im.muuzi.co',
    nodeOrigin: 'https://im.muuzi.co',
    company_name: 'MuuZi',
    instance_id: 7,
    label: 'im.muuzi.co',
  },
  {
    domain: 'dev-os.guduu.co',
    nodeOrigin: 'https://dev-os.guduu.co',
    company_name: 'GuDuu Dev',
    instance_id: 1,
    label: 'dev-os.guduu.co',
  },
  {
    domain: 'guduuos.com',
    nodeOrigin: 'https://guduuos.com',
    company_name: 'GuDuu OS',
    instance_id: 1,
    label: 'guduuos.com',
  },
];

/** 仅开发者工具联调；trial/release 永不并入白名单 */
var NODE_WHITELIST_LOCAL = [
  {
    domain: '127.0.0.1:9000',
    nodeOrigin: 'http://127.0.0.1:9000',
    homeserverUrl: 'http://127.0.0.1:8008',
    company_name: 'GuDuu Local',
    instance_id: 0,
    label: '本地 bot :9000（仅开发）',
  },
];

function envVersion() {
  try {
    if (typeof wx !== 'undefined' && wx.getAccountInfoSync) {
      var info = wx.getAccountInfoSync();
      if (info && info.miniProgram && info.miniProgram.envVersion) {
        return info.miniProgram.envVersion;
      }
    }
  } catch (e) {
    /* ignore */
  }
  if (typeof process !== 'undefined' && process.env && process.env.MUUZI_WX_ENV) {
    return process.env.MUUZI_WX_ENV;
  }
  // Node 单测无 wx：按 develop 处理，便于覆盖本地节点逻辑
  if (typeof wx === 'undefined') return 'develop';
  return 'release';
}

function isDevelop() {
  return envVersion() === 'develop';
}

function loadLocalOverlay() {
  if (!isDevelop()) return null;
  try {
    return require('./config.local.js');
  } catch (e) {
    return null;
  }
}

function buildWhitelist(overlay) {
  var list = NODE_WHITELIST_PRODUCTION.slice();
  if (!isDevelop()) return list;
  var localNodes =
    overlay && Array.isArray(overlay.NODE_WHITELIST)
      ? overlay.NODE_WHITELIST
      : NODE_WHITELIST_LOCAL;
  // 正式节点在前：默认进 im.muuzi.co（名片/Creator 可用）；本地节点仍可选
  return list.concat(localNodes);
}

function buildPlatformApi(overlay) {
  if (
    isDevelop() &&
    overlay &&
    typeof overlay.PLATFORM_API === 'string' &&
    overlay.PLATFORM_API
  ) {
    return String(overlay.PLATFORM_API).replace(/\/$/, '');
  }
  return PRODUCTION_PLATFORM_API;
}

/**
 * web-view 业务域名主机列表（不含协议与路径）。
 * 必须与微信公众平台「业务域名」一致；体验版默认留空（见 R_体验版提审材料）。
 * 留空时「看成品 / 打开主页」走复制链接回退，禁止挂载 web-view。
 * develop 可用 config.local.js 覆盖以便联调。
 */
function buildWebviewBusinessHosts(overlay) {
  if (overlay && Array.isArray(overlay.WEBVIEW_BUSINESS_HOSTS)) {
    return overlay.WEBVIEW_BUSINESS_HOSTS.slice();
  }
  return [];
}

var overlay = loadLocalOverlay();

module.exports = {
  PLATFORM_API: buildPlatformApi(overlay),
  NODE_WHITELIST: buildWhitelist(overlay),
  NODE_WHITELIST_PRODUCTION: NODE_WHITELIST_PRODUCTION,
  NODE_WHITELIST_LOCAL: NODE_WHITELIST_LOCAL,
  WEBVIEW_BUSINESS_HOSTS: buildWebviewBusinessHosts(overlay),
  MINIPROGRAM_APPID: 'wxf40b35f27b303bbe',
  DEFAULT_TAB: '/pages/connect/index',
  WECHAT_LOGIN_PREFIX: '/cosmac/login/wechat/miniprogram',
  APP_CODE_PATH: '/cosmac/muuzi/app-code',
  APP_CODE_PREFIX: 'mza_',
  MUUZI_CLIENT_ID: 'guduu-muuzi',
  envVersion: envVersion,
  isDevelop: isDevelop,
};
