const config = require('../config');
const http = require('./http');

var SHARE_ENTRY_KEY = 'muuzi.share-entry';

function parseHttpsUrl(value) {
  var m = String(value || '').match(
    /^(https:\/\/)([^\/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i
  );
  if (!m) throw new Error('分享地址无效');
  return {
    href: m[1] + m[2] + (m[3] || '') + (m[4] || '') + (m[5] || ''),
    origin: m[1] + m[2],
    pathname: m[3] || '/',
  };
}

function displayHost(url) {
  return String(url || '').replace(/^https?:\/\//i, '');
}

/**
 * 对齐 App resolveShareAddress：官方域走 share-link，其它 https 原样返回。
 */
function resolveShareAddress(url) {
  var parsed;
  try {
    parsed = parseHttpsUrl(url);
  } catch (e) {
    return Promise.reject(e);
  }
  var platformOrigin = parseHttpsUrl(config.PLATFORM_API).origin;
  var official = {};
  official[platformOrigin] = true;
  official['https://muuzi.co'] = true;
  official['https://www.muuzi.co'] = true;
  if (!official[parsed.origin]) {
    return Promise.resolve(parsed.href);
  }
  var path = parsed.pathname.charAt(0) === '/' ? parsed.pathname.slice(1) : parsed.pathname;
  return http
    .request({
      url:
        config.PLATFORM_API +
        '/api/public/share-link?path=' +
        encodeURIComponent(path),
      method: 'GET',
      timeout: 10000,
    })
    .then(function (result) {
      if (!result || typeof result.url !== 'string') {
        throw new Error('分享内容尚未发布或暂时不可访问');
      }
      var target = parseHttpsUrl(result.url);
      if (target.origin !== platformOrigin && target.href.indexOf('https://') !== 0) {
        throw new Error('分享地址无效');
      }
      return target.href;
    });
}

/**
 * 对齐 App shareChoicesFor：拉取可选分享入口（默认 / 国内）。
 */
function shareChoicesFor(url) {
  return http
    .request({
      url:
        config.PLATFORM_API +
        '/api/public/share-link?url=' +
        encodeURIComponent(String(url || '')),
      method: 'GET',
      timeout: 15000,
    })
    .then(function (result) {
      if (!result || !Array.isArray(result.options) || !result.options.length) {
        throw new Error('分享地址暂不可用');
      }
      return result.options;
    });
}

function preferredShareEntry(options) {
  var remembered = 'default';
  try {
    remembered = wx.getStorageSync(SHARE_ENTRY_KEY) || 'default';
  } catch (e) {
    /* ignore */
  }
  var found = null;
  var fallback = null;
  for (var i = 0; i < options.length; i++) {
    if (options[i].id === remembered) found = options[i];
    if (options[i].id === 'default') fallback = options[i];
  }
  return found || fallback || options[0];
}

function rememberShareEntry(id) {
  if (id !== 'default' && id !== 'domestic') return;
  try {
    wx.setStorageSync(SHARE_ENTRY_KEY, id);
  } catch (e) {
    /* ignore */
  }
}

module.exports = {
  resolveShareAddress: resolveShareAddress,
  shareChoicesFor: shareChoicesFor,
  preferredShareEntry: preferredShareEntry,
  rememberShareEntry: rememberShareEntry,
  displayHost: displayHost,
};
