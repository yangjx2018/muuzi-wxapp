/**
 * 固定中文数字时间戳。
 * 微信真机 JS 引擎上 toLocaleString('zh-CN') 常退化成 Date.toString()
 *（Tue Sep 22 2026 …），不能用于现场话题房间名。
 */

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * @param {Date|number|string} [value]
 * @returns {string} 如 2026/9/22 22:19:29（月日不补零，对齐历史 zh-CN 房间名）
 */
function formatZhDateTime(value) {
  var d = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
  if (!Number.isFinite(d.getTime())) return '';
  return (
    d.getFullYear() +
    '/' +
    (d.getMonth() + 1) +
    '/' +
    d.getDate() +
    ' ' +
    pad2(d.getHours()) +
    ':' +
    pad2(d.getMinutes()) +
    ':' +
    pad2(d.getSeconds())
  );
}

function parseLooseDate(stamp) {
  var text = String(stamp || '').trim();
  if (!text) return NaN;
  var parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return parsed;
  // Date.toString() 截断或带 GMT 后缀
  var cut = text.replace(/\s+GMT.*$/i, '').trim();
  parsed = Date.parse(cut);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * 纠正「现场交流 · Tue Sep 22…」为「现场交流 · 2026/9/22 …」；其它名称原样返回。
 * @param {string} name
 * @returns {string}
 */
function normalizeFieldRoomName(name) {
  var raw = String(name || '').trim();
  var match = /^现场交流 · (.+)$/.exec(raw);
  if (!match) return raw;
  var stamp = String(match[1] || '').trim();
  if (/^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}/.test(stamp)) {
    return raw;
  }
  var ms = parseLooseDate(stamp);
  if (!Number.isFinite(ms)) return raw;
  return '现场交流 · ' + formatZhDateTime(new Date(ms));
}

function fieldTopicRoomName(value) {
  return '现场交流 · ' + formatZhDateTime(value);
}

module.exports = {
  formatZhDateTime: formatZhDateTime,
  normalizeFieldRoomName: normalizeFieldRoomName,
  fieldTopicRoomName: fieldTopicRoomName,
};
