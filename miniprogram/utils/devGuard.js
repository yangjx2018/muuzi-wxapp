/**
 * 开发辅助页门禁：trial / release 不得进入 pages/dev/*
 */
var config = require('../config');

function isDevRoute(route) {
  var path = String(route || '');
  if (path.indexOf('/pages/dev/') === 0) return true;
  if (path.indexOf('pages/dev/') === 0) return true;
  return false;
}

/** @returns {boolean} 当前环境允许打开 dev 页 */
function devPagesAllowed() {
  return typeof config.isDevelop === 'function' && config.isDevelop();
}

/**
 * 非 develop 环境：立即跳回登录页（不暴露联调工具）
 * @returns {boolean} true 表示已拦截，调用方应停止 onLoad 后续逻辑
 */
function blockIfNotDevelop() {
  if (devPagesAllowed()) return false;
  wx.showToast({ title: '当前版本不提供此入口', icon: 'none' });
  wx.reLaunch({ url: '/pages/auth/login/index' });
  return true;
}

module.exports = {
  isDevRoute: isDevRoute,
  devPagesAllowed: devPagesAllowed,
  blockIfNotDevelop: blockIfNotDevelop,
};
