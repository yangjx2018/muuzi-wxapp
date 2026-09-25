/**
 * 对齐 App profileShare.ts / ProfileShareSheet：
 * - 分享到… → 系统分享（小程序：open-type=share + onShareAppMessage）
 * - 打开主页 / 看成品 → open-home；仅 WEBVIEW_BUSINESS_HOSTS 命中时挂 web-view，否则复制回退
 */
const config = require('../config');

function shareTextUrl(value) {
  var raw = String(value || '').trim();
  var m = raw.match(/^(https:\/\/)([^\/?#:@]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
  if (!m) throw new Error('分享地址无效');
  return m[1] + m[2] + (m[3] || '') + (m[4] || '') + (m[5] || '');
}

function slugFromShareUrl(url) {
  try {
    var href = shareTextUrl(url);
    var path = href.replace(/^https:\/\/[^\/]+/i, '');
    var parts = path.split('/').filter(Boolean);
    var last = parts[parts.length - 1] || '';
    if (/^[a-z0-9][a-z0-9-]*$/i.test(last)) return last.toLowerCase();
  } catch (e) {
    /* ignore */
  }
  return '';
}

/**
 * 好友分享卡片（对齐 shareProfileLink 的 title/text/image 语义）。
 * 打开路径落在 open-home，由对方在小程序内打开真实主页。
 */
function friendShareMessage(opts) {
  opts = opts || {};
  var slug = String(opts.slug || '').trim() || slugFromShareUrl(opts.url || '');
  var path = '/pages/me/open-home/index';
  if (slug) {
    path += '?slug=' + encodeURIComponent(slug);
  } else if (opts.url) {
    path += '?url=' + encodeURIComponent(String(opts.url));
  }
  var msg = {
    title: opts.title || 'MuuZi',
    path: path,
  };
  if (opts.imageUrl) msg.imageUrl = opts.imageUrl;
  return msg;
}

/**
 * 业务域名主机（与微信后台「业务域名」及 config.WEBVIEW_BUSINESS_HOSTS 对齐）。
 * 体验版默认空：不得挂 web-view，否则微信直接进「无法打开该页面」系统页，
 * 文档承诺的复制回退永远不会出现。
 */
function hostFromShareUrl(url) {
  var href = shareTextUrl(url);
  var m = href.match(/^https:\/\/([^\/?#]+)/i);
  return m ? String(m[1]).toLowerCase() : '';
}

function webviewBusinessHosts() {
  var hosts = config.WEBVIEW_BUSINESS_HOSTS;
  if (!Array.isArray(hosts)) return [];
  var out = [];
  for (var i = 0; i < hosts.length; i++) {
    var h = String(hosts[i] || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    if (h) out.push(h);
  }
  return out;
}

/** 仅当 URL 主机已在业务域名白名单时才允许挂载 web-view。 */
function canEmbedHomeUrl(url) {
  var allowed = webviewBusinessHosts();
  if (!allowed.length) return false;
  var host = hostFromShareUrl(url);
  if (!host) return false;
  return allowed.indexOf(host) >= 0;
}

/**
 * open-home 决策：embed 时设 homeUrl；否则只给 fallbackUrl 走复制回退。
 * 纯函数便于单测锁定「空业务域名 → 不挂 web-view」。
 */
function homeOpenPlan(url) {
  var href = shareTextUrl(url);
  if (canEmbedHomeUrl(href)) {
    return { mode: 'embed', homeUrl: href, fallbackUrl: href };
  }
  return { mode: 'copy', homeUrl: '', fallbackUrl: href };
}

function openHomePage(url) {
  var href = shareTextUrl(url);
  var slug = slugFromShareUrl(href);
  var forceCopy = !canEmbedHomeUrl(href);
  var target =
    '/pages/me/open-home/index?' +
    (slug
      ? 'slug=' + encodeURIComponent(slug)
      : 'url=' + encodeURIComponent(href));
  if (forceCopy) {
    target += (target.indexOf('?') >= 0 ? '&' : '?') + 'force=copy';
  }
  return new Promise(function (resolve, reject) {
    wx.navigateTo({
      url: target,
      success: function () {
        resolve('opened');
      },
      fail: function (err) {
        reject(err || new Error('无法打开主页'));
      },
    });
  });
}

function copyShareUrlFallback(url, successNote) {
  var href = shareTextUrl(url);
  return new Promise(function (resolve, reject) {
    wx.setClipboardData({
      data: href,
      success: function () {
        resolve(successNote || '链接已复制');
      },
      fail: function () {
        reject(new Error('复制失败'));
      },
    });
  });
}

function platformOrigin() {
  return String(config.PLATFORM_API || 'https://www.muuzi.co').replace(/\/$/, '');
}

module.exports = {
  shareTextUrl: shareTextUrl,
  slugFromShareUrl: slugFromShareUrl,
  hostFromShareUrl: hostFromShareUrl,
  webviewBusinessHosts: webviewBusinessHosts,
  canEmbedHomeUrl: canEmbedHomeUrl,
  homeOpenPlan: homeOpenPlan,
  friendShareMessage: friendShareMessage,
  openHomePage: openHomePage,
  copyShareUrlFallback: copyShareUrlFallback,
  platformOrigin: platformOrigin,
};
