/**
 * 打开条目链接 · 对齐 App 公开页 / CreatorScreen「打开」而非复制。
 * 真值见 docs/OPEN_HOME_APP_PARITY.md
 *
 * 微信约束：
 * - 任意网页：仅业务域名可 web-view
 * - 直链图片：优先 wx.previewImage（不依赖业务域名）
 * - 直链视频/音频：原生播放页（downloadFile 合法域名；开发期可关校验）
 */
const profileShare = require('./profileShare');

var IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|heic)(?:[?#]|$)/i;
var VIDEO_EXT = /\.(mp4|webm|mov|m4v|m3u8)(?:[?#]|$)/i;
var AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)(?:[?#]|$)/i;
/** 常见无后缀图床（本仓演示主页大量用 Unsplash） */
var IMAGE_HOST =
  /^https:\/\/(?:images|plus)\.unsplash\.com\//i;
var IMAGE_HOST_PATH =
  /^https:\/\/(?:cdn\.unsplash\.com|images\.pexels\.com|i\.imgur\.com)\//i;

function normalizeHref(url) {
  return profileShare.shareTextUrl(url);
}

function isDirectAudio(url) {
  try {
    var href = String(url || '').trim();
    if (href.indexOf('https://') !== 0) return false;
    return AUDIO_EXT.test(href);
  } catch (e) {
    return false;
  }
}

function isDirectImage(url) {
  try {
    var href = String(url || '').trim();
    if (href.indexOf('https://') !== 0) return false;
    if (IMAGE_EXT.test(href)) return true;
    if (IMAGE_HOST.test(href) || IMAGE_HOST_PATH.test(href)) return true;
    return false;
  } catch (e) {
    return false;
  }
}

function isDirectVideo(url) {
  try {
    var href = String(url || '').trim();
    if (href.indexOf('https://') !== 0) return false;
    return VIDEO_EXT.test(href);
  } catch (e) {
    return false;
  }
}

/**
 * @returns {'image'|'video'|'audio'|'page'}
 */
function classifyMedia(url) {
  if (isDirectImage(url)) return 'image';
  if (isDirectVideo(url)) return 'video';
  if (isDirectAudio(url)) return 'audio';
  return 'page';
}

function canEmbedUrl(url) {
  try {
    return profileShare.canEmbedHomeUrl(url);
  } catch (e) {
    return false;
  }
}

function navigateOpenLink(href, opts) {
  opts = opts || {};
  var q =
    'url=' +
    encodeURIComponent(href) +
    (opts.title ? '&title=' + encodeURIComponent(String(opts.title)) : '') +
    (opts.note ? '&note=' + encodeURIComponent(String(opts.note)) : '') +
    (opts.kind ? '&kind=' + encodeURIComponent(String(opts.kind)) : '');
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

function navigateOpenMedia(href, opts) {
  opts = opts || {};
  var kind = opts.kind === 'audio' ? 'audio' : 'video';
  var q =
    'url=' +
    encodeURIComponent(href) +
    '&kind=' +
    encodeURIComponent(kind) +
    (opts.title ? '&title=' + encodeURIComponent(String(opts.title)) : '') +
    (opts.note ? '&note=' + encodeURIComponent(String(opts.note)) : '');
  return new Promise(function (resolve, reject) {
    wx.navigateTo({
      url: '/pages/me/open-media/index?' + q,
      success: function () {
        resolve('media');
      },
      fail: function (err) {
        reject(err || new Error('无法打开'));
      },
    });
  });
}

/**
 * 全屏看图；失败则进 open-link 页内预览 / 复制。
 * @param {string} href
 * @param {{ title?: string, note?: string, urls?: string[] }} opts
 */
function previewImage(href, opts) {
  opts = opts || {};
  var list = Array.isArray(opts.urls) && opts.urls.length
    ? opts.urls.filter(function (u) {
        return typeof u === 'string' && u.indexOf('https://') === 0;
      })
    : [href];
  if (list.indexOf(href) < 0) list.unshift(href);
  return new Promise(function (resolve, reject) {
    wx.previewImage({
      current: href,
      urls: list,
      success: function () {
        resolve('preview');
      },
      fail: function () {
        navigateOpenLink(href, {
          title: opts.title,
          note: opts.note,
          kind: 'image',
        })
          .then(resolve)
          .catch(reject);
      },
    });
  });
}

/**
 * 打开 https 条目：
 * 图 → 全屏预览；音/视频直链 → 原生播放；可 embed → web-view；否则查看页（禁止默认复制 Toast）。
 */
function openHttps(url, opts) {
  opts = opts || {};
  var href;
  try {
    href = normalizeHref(url);
  } catch (e) {
    return Promise.reject(new Error('链接不可用'));
  }
  var kind = classifyMedia(href);
  if (kind === 'image') {
    return previewImage(href, opts);
  }
  if (kind === 'video' || kind === 'audio') {
    return navigateOpenMedia(href, {
      title: opts.title,
      note: opts.note,
      kind: kind,
    }).catch(function () {
      return navigateOpenLink(href, {
        title: opts.title,
        note: opts.note,
        kind: kind,
      });
    });
  }
  return navigateOpenLink(href, {
    title: opts.title,
    note: opts.note,
    kind: 'page',
  });
}

module.exports = {
  isDirectAudio: isDirectAudio,
  isDirectImage: isDirectImage,
  isDirectVideo: isDirectVideo,
  classifyMedia: classifyMedia,
  canEmbedUrl: canEmbedUrl,
  previewImage: previewImage,
  openHttps: openHttps,
};
