/**
 * 打开条目链接 · 对齐 App 公开页 / CreatorScreen「打开」而非复制。
 * 真值见 docs/OPEN_HOME_APP_PARITY.md
 */
const profileShare = require('./profileShare');

function isDirectAudio(url) {
  try {
    var href = String(url || '').trim();
    if (href.indexOf('https://') !== 0) return false;
    return /^https:\/\/[^?#]+\.(mp3|m4a|aac|wav|ogg)(?:[?#]|$)/i.test(href);
  } catch (e) {
    return false;
  }
}

function canEmbedUrl(url) {
  try {
    return profileShare.canEmbedHomeUrl(url);
  } catch (e) {
    return false;
  }
}

/**
 * 打开 https 条目：优先 open-link（可挂 web-view 则内嵌；否则查看页，禁止默认复制 Toast）。
 */
function openHttps(url, opts) {
  opts = opts || {};
  var href;
  try {
    href = profileShare.shareTextUrl(url);
  } catch (e) {
    return Promise.reject(new Error('链接不可用'));
  }
  var q =
    'url=' +
    encodeURIComponent(href) +
    (opts.title ? '&title=' + encodeURIComponent(String(opts.title)) : '') +
    (opts.note ? '&note=' + encodeURIComponent(String(opts.note)) : '');
  return new Promise(function (resolve, reject) {
    wx.navigateTo({
      url: '/pages/me/open-link/index?' + q,
      success: function () {
        resolve('opened');
      },
      fail: function (err) {
        reject(err || new Error('无法打开'));
      },
    });
  });
}

module.exports = {
  isDirectAudio: isDirectAudio,
  canEmbedUrl: canEmbedUrl,
  openHttps: openHttps,
};
