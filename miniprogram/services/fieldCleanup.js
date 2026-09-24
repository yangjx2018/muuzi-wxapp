/**
 * 空话题恢复意图 · 对齐 fieldCleanup.ts（仅本机标识，无正文）
 */
var store = require('../adapters/secure-store');

function fieldCleanup(owner) {
  function key(topic) {
    if (!/^[0-9a-f-]{36}$/.test(topic)) {
      throw new Error('空话题恢复编号无效');
    }
    return 'muuzi.field.leave.v1:' + owner + ':' + topic;
  }
  function valid(value) {
    if (!value || typeof value !== 'object') return false;
    var keys = Object.keys(value);
    if (keys.length !== 2) return false;
    return (
      typeof value.room === 'string' &&
      typeof value.space === 'string' &&
      value.room.length <= 512 &&
      value.space.length <= 512 &&
      /^![^\s:]+:[^\s]{1,255}$/.test(value.room) &&
      /^![^\s:]+:[^\s]{1,255}$/.test(value.space) &&
      value.room !== value.space
    );
  }
  return {
    read: function (topic) {
      var raw = store.get(key(topic));
      if (raw === '' || raw == null) return null;
      if (String(raw).length > 2048) throw new Error('空话题恢复记录无效');
      var value = JSON.parse(raw);
      if (!valid(value)) throw new Error('空话题恢复记录无效');
      return value;
    },
    write: function (topic, target) {
      if (!valid(target)) throw new Error('空话题恢复记录无效');
      store.set(key(topic), JSON.stringify(target));
    },
    clear: function (topic) {
      store.remove(key(topic));
    },
  };
}

module.exports = { fieldCleanup: fieldCleanup };
