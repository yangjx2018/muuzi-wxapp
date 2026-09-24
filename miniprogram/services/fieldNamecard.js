/** 对齐 MuuziGit fieldNamecard.ts + profileShare.shareTextUrl */

function shareTextUrl(value) {
  if (typeof value !== 'string' || !value) throw new Error('分享地址无效');
  // 微信环境无 URL 构造器时用正则兜底
  var m = String(value).match(/^(https:\/\/)([^\/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
  if (!m) throw new Error('分享地址无效');
  var host = m[2];
  if (host.indexOf('@') !== -1) throw new Error('分享地址无效');
  return m[1] + host + (m[3] || '') + (m[4] || '') + (m[5] || '');
}

/**
 * 仅已发布快照可上名片。resolve(url) 返回 Promise<string> 最终分享地址。
 * @returns {Promise<object|null>}
 */
function publishedNamecard(page, platformOrigin, resolve) {
  if (!page || !page.published) return Promise.resolve(null);
  var published = page.published;
  var source;
  try {
    source = shareTextUrl(
      page.page_url || platformOrigin + '/' + encodeURIComponent(page.slug)
    );
  } catch (e) {
    return Promise.reject(e);
  }
  return Promise.resolve(resolve(source))
    .then(function (resolved) {
      var url = shareTextUrl(resolved);
      var portrait = '';
      if (published.portrait_url) {
        try {
          portrait = shareTextUrl(published.portrait_url);
        } catch (e) {
          portrait = '';
        }
      }
      var name =
        typeof published.display_name === 'string'
          ? published.display_name.trim()
          : '';
      return {
        name: name || '我的 MuuZi',
        headline: published.headline || '',
        portrait: portrait,
        url: url,
      };
    });
}

module.exports = {
  shareTextUrl: shareTextUrl,
  publishedNamecard: publishedNamecard,
};
