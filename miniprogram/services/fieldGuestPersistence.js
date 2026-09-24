/**
 * 访客本机持久化：对齐 browserGuestPersistence，但用串行 Promise 代替 Web Locks。
 */
var store = require('../adapters/secure-store');
var cryptoUtil = require('../utils/field-crypto');

var chains = {};

function wxGuestPersistence() {
  return {
    storage: {
      getItem: function (key) {
        var v = store.get(key);
        return v === '' || v == null ? null : String(v);
      },
      setItem: function (key, value) {
        store.set(key, value);
      },
      removeItem: function (key) {
        store.remove(key);
      },
    },
    withLock: function (key, run) {
      var prev = chains[key] || Promise.resolve();
      var next = prev.catch(function () {}).then(run);
      chains[key] = next.then(
        function () {},
        function () {}
      );
      return next;
    },
  };
}

var uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function guestDeliveryStore(persistence, scope, kind) {
  kind = kind || 'visitor';
  var key =
    'muuzi.field.' + kind + '-outbox.v1:' + JSON.stringify(scope);
  return {
    locked: function (run) {
      return persistence.withLock(key, run);
    },
    read: function () {
      var raw = persistence.storage.getItem(key);
      if (raw === null) return { version: 1, pending: null, receipts: {} };
      try {
        var state = JSON.parse(raw);
        if (
          !state ||
          state.version !== 1 ||
          !state.receipts ||
          typeof state.receipts !== 'object' ||
          Array.isArray(state.receipts)
        ) {
          throw new Error();
        }
        Object.keys(state.receipts).forEach(function (id) {
          var receipt = state.receipts[id];
          if (
            !uuid.test(id) ||
            !receipt ||
            !/^[0-9a-f]{64}$/.test(receipt.digest) ||
            !uuid.test(receipt.participantId) ||
            !/^\$[^\s]{1,511}$/.test(receipt.eventId)
          ) {
            throw new Error();
          }
        });
        var pending = state.pending;
        if (pending !== null) {
          if (
            !pending ||
            !uuid.test(pending.requestId) ||
            !uuid.test(pending.participantId) ||
            typeof pending.text !== 'string' ||
            !pending.text.trim() ||
            pending.text.indexOf('\0') >= 0 ||
            cryptoUtil.utf8ByteLength(pending.text) > 2000 ||
            typeof pending.language !== 'string' ||
            pending.language.length > 35 ||
            Object.prototype.hasOwnProperty.call(
              state.receipts,
              pending.requestId
            )
          ) {
            throw new Error();
          }
        }
        return state;
      } catch (e) {
        throw new Error('待发送记录无法读取，已保留原数据');
      }
    },
    write: function (state) {
      var raw = JSON.stringify(state);
      persistence.storage.setItem(key, raw);
      if (persistence.storage.getItem(key) !== raw) {
        throw new Error('待发送记录未可靠保存');
      }
    },
  };
}

module.exports = {
  wxGuestPersistence: wxGuestPersistence,
  guestDeliveryStore: guestDeliveryStore,
};
