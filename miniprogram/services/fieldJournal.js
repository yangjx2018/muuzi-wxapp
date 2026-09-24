/**
 * 现场话题恢复清单 · 对齐 fieldJournal.ts
 */
var store = require('../adapters/secure-store');

function fieldJournal(owner) {
  var slot = 'muuzi.field.cleanup.v1:' + owner;
  function read() {
    var raw = store.get(slot);
    var ids = JSON.parse(raw || '[]');
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      !ids.every(function (id) {
        return typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
      })
    ) {
      throw new Error('现场话题恢复清单无效');
    }
    return ids;
  }
  return {
    read: read,
    add: function (id) {
      var ids = read();
      if (ids.indexOf(id) < 0) {
        if (ids.length >= 100) throw new Error('请先恢复未结束的话题');
        ids.push(id);
      }
      store.set(slot, JSON.stringify(ids));
    },
    remove: function (id) {
      store.set(
        slot,
        JSON.stringify(
          read().filter(function (value) {
            return value !== id;
          })
        )
      );
    },
  };
}

module.exports = { fieldJournal: fieldJournal };
