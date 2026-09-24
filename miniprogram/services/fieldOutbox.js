/**
 * 对齐 MuuziGit fieldOutbox.ts — 单条待确认本机记录（非历史库）。
 * Matrix 写入接通前：本机确认后 clear；跨端/杀进程可恢复重试翻译确认。
 */
const store = require('../adapters/secure-store');

function slotKey(owner) {
  return 'field_pending_v1:' + owner;
}

function validPending(item) {
  if (!item || typeof item !== 'object') return false;
  if (!/^[0-9a-f-]{36}$/i.test(item.topic) || !/^[0-9a-f-]{36}$/i.test(item.key)) {
    return false;
  }
  var v = item.value;
  if (!v || typeof v !== 'object') return false;
  if (v.speaker !== 'mine' && v.speaker !== 'guest') return false;
  if (
    typeof v.original !== 'string' ||
    !v.original.trim() ||
    v.original.length > 4500
  ) {
    return false;
  }
  if (
    typeof v.translated !== 'string' ||
    !v.translated.trim() ||
    v.translated.length > 4500
  ) {
    return false;
  }
  if (
    typeof v.source !== 'string' ||
    !/^[a-z]{2,3}$/.test(v.source) ||
    typeof v.target !== 'string' ||
    !/^[a-z]{2,3}$/.test(v.target)
  ) {
    return false;
  }
  return true;
}

function fieldOutbox(owner) {
  var slot = slotKey(owner);
  return {
    read: function () {
      var raw = store.get(slot);
      if (!raw) return null;
      var item;
      try {
        item = JSON.parse(raw);
      } catch (e) {
        throw new Error('待保存交流无法读取，请保留本机数据并联系支持。');
      }
      if (!validPending(item)) {
        throw new Error('待保存交流无法读取，请保留本机数据并联系支持。');
      }
      return item;
    },
    write: function (item) {
      if (!validPending(item)) {
        throw new Error('待保存交流内容无效。');
      }
      var raw = store.get(slot);
      if (raw) {
        var previous = JSON.parse(raw);
        if (
          previous.key !== item.key ||
          previous.topic !== item.topic ||
          JSON.stringify(previous.value) !== JSON.stringify(item.value)
        ) {
          throw new Error('另有交流等待保存，请先完成原有记录。');
        }
      }
      var serialized = JSON.stringify(item);
      store.set(slot, serialized);
      if (store.get(slot) !== serialized) {
        throw new Error('待保存交流未可靠写入，请保留当前文字并重试');
      }
    },
    clear: function (key) {
      var raw = store.get(slot);
      if (!raw) return;
      var item = JSON.parse(raw);
      if (item.key === key) {
        store.remove(slot);
        if (store.get(slot)) {
          throw new Error('待保存记录尚未清除，请重试确认');
        }
      }
    },
  };
}

module.exports = {
  fieldOutbox: fieldOutbox,
  validPending: validPending,
};
