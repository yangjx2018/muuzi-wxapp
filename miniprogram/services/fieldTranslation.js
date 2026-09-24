/** 对齐 MuuziGit fieldTranslation.ts */

function utf8Length(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return unescape(encodeURIComponent(text)).length;
}

/**
 * 同语种本地确认；跨语种才调用 translate(text)。
 * @returns {Promise<string>}
 */
function translateFieldText(original, source, target, translate) {
  var text = String(original || '').trim();
  if (!text || utf8Length(text) > 4500) {
    return Promise.reject(new Error('文字为空或过长，请缩短后重试。'));
  }
  if (source === target) return Promise.resolve(text);
  return Promise.resolve(translate(text));
}

module.exports = {
  utf8Length: utf8Length,
  translateFieldText: translateFieldText,
};
