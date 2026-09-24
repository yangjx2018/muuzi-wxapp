/**
 * Studio / 认证外链 · 对齐 PRD：复制链接打开，无 web-view
 * www.muuzi.co → studio.muuzi.co；其它 PLATFORM_API 回退 /studio/
 */
const config = require('../config');

function platformOrigin() {
  return String(config.PLATFORM_API || 'https://www.muuzi.co').replace(/\/$/, '');
}

function studioOrigin() {
  var api = platformOrigin();
  if (/^https:\/\/www\./i.test(api)) {
    return api.replace(/^https:\/\/www\./i, 'https://studio.');
  }
  if (/^https:\/\/studio\./i.test(api)) {
    return api;
  }
  return api + '/studio';
}

/** Studio 首页 */
function studioUrl() {
  return studioOrigin() + '/';
}

/**
 * 认证申请在 Studio「域名与认证」工作区提交。
 * 深链指向 settings 面板（含 verification-card）。
 */
function verificationUrl() {
  return studioOrigin() + '/#workspace-settings';
}

function displayHost(url) {
  return String(url || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

/**
 * @param {'studio'|'verification'} purpose
 * @returns {Promise<{url: string, purpose: string, label: string}>}
 */
function copyLink(purpose) {
  var kind = purpose === 'verification' ? 'verification' : 'studio';
  var url = kind === 'verification' ? verificationUrl() : studioUrl();
  var label =
    kind === 'verification'
      ? '认证申请链接已复制，请在浏览器打开 Studio 提交'
      : 'Studio 链接已复制，请在浏览器打开';
  return new Promise(function (resolve, reject) {
    wx.setClipboardData({
      data: url,
      success: function () {
        resolve({ url: url, purpose: kind, label: label });
      },
      fail: function () {
        var err = new Error(
          '复制失败，请手动打开 ' + displayHost(url)
        );
        err.url = url;
        reject(err);
      },
    });
  });
}

module.exports = {
  platformOrigin: platformOrigin,
  studioOrigin: studioOrigin,
  studioUrl: studioUrl,
  verificationUrl: verificationUrl,
  displayHost: displayHost,
  copyLink: copyLink,
};
