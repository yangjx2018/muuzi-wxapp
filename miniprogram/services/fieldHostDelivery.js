/**
 * 宿主向访客房间发信 · 对齐 fieldGuestDelivery.ts
 */
var guest = require('./fieldGuestPersistence');
var cryptoUtil = require('../utils/field-crypto');
var speech = require('./fieldSpeech');

var uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function base(value) {
  return String(value || '').replace(/\/+$/, '');
}

/**
 * @param {object} opts
 * @param {object} opts.api matrixApi
 * @param {{ instanceId, homeserver, roomId, invitationId }} opts.context
 * @param {function(): string} opts.getUserId
 * @param {function(): string} opts.getDeviceId
 * @param {function(): Promise<object>} opts.recipient
 * @param {function(): boolean} opts.isCurrent
 */
function createFieldHostDelivery(opts) {
  opts = opts || {};
  var api = opts.api;
  var context = Object.assign({}, opts.context);
  var getUserId = opts.getUserId;
  var getDeviceId = opts.getDeviceId;
  var recipient = opts.recipient;
  var isCurrent = opts.isCurrent || function () { return true; };
  var now = opts.now || Date.now;
  var persistence = opts.persistence || guest.wxGuestPersistence();

  var owner = getUserId();
  var device = getDeviceId();
  if (
    !owner ||
    !device ||
    !/^[1-9][0-9]*$/.test(context.instanceId) ||
    !/^![^\s:]+:[^\s]+$/.test(context.roomId) ||
    !uuid.test(context.invitationId)
  ) {
    throw new Error('现场接收者上下文无效');
  }

  function check() {
    if (
      !isCurrent() ||
      getUserId() !== owner ||
      getDeviceId() !== device
    ) {
      throw new Error('账号或节点已切换，停止发送');
    }
  }

  var store = guest.guestDeliveryStore(
    persistence,
    [
      context.instanceId,
      base(context.homeserver),
      owner,
      device,
      context.roomId,
      context.invitationId,
    ],
    'host'
  );

  return {
    pending: function () {
      return store.locked(function () {
        check();
        return store.read().pending;
      });
    },
    send: function (requestId, text, language) {
      if (
        !uuid.test(requestId) ||
        typeof text !== 'string' ||
        !text.trim() ||
        text.indexOf('\0') >= 0 ||
        cryptoUtil.utf8ByteLength(text) > 2000 ||
        typeof language !== 'string' ||
        language.length > 35
      ) {
        return Promise.reject(new Error('发送内容无效'));
      }
      var canonical = speech.canonicalizeLanguage
        ? speech.canonicalizeLanguage(language)
        : null;
      if (!canonical) {
        var baseLang = language.trim().replace(/_/g, '-').split('-')[0].toLowerCase();
        if (
          Object.prototype.hasOwnProperty.call(speech.speechLanguages, baseLang)
        ) {
          canonical = baseLang;
        }
      }
      if (!canonical) {
        return Promise.reject(new Error('说话语言无效'));
      }
      return store.locked(function () {
        check();
        var digest = cryptoUtil.sha256Hex(
          JSON.stringify([requestId, text, canonical])
        );
        check();
        var state = store.read();
        var saved = state.receipts[requestId];
        var pending = state.pending;
        if (saved && saved.digest !== digest) {
          throw new Error('同一条消息不能更换内容');
        }
        if (
          pending &&
          (pending.requestId !== requestId ||
            pending.text !== text ||
            pending.language !== canonical)
        ) {
          throw new Error('另有消息等待确认，不能更换内容或覆盖');
        }
        check();
        return Promise.resolve(recipient()).then(function (target) {
          check();
          if (
            !target ||
            target.version !== 1 ||
            target.instanceId !== context.instanceId ||
            target.ownerId !== owner ||
            target.roomId !== context.roomId ||
            target.invitationId !== context.invitationId ||
            !uuid.test(target.participantId) ||
            !Number.isSafeInteger(target.expiresAt) ||
            target.expiresAt <= now()
          ) {
            throw new Error('客户尚未就绪或交流授权已失效');
          }
          if (
            (saved && saved.participantId !== target.participantId) ||
            (pending && pending.participantId !== target.participantId)
          ) {
            throw new Error('接收者已变化，停止重试');
          }
          if (saved) return { eventId: saved.eventId };
          state.pending = {
            requestId: requestId,
            text: text,
            language: canonical,
            participantId: target.participantId,
          };
          store.write(state);
          check();
          var content = {
            msgtype: 'm.text',
            body: text,
            'co.muuzi.field.audience': {
              version: 1,
              instanceId: context.instanceId,
              invitationId: context.invitationId,
              participantId: target.participantId,
              language: canonical,
              requestId: requestId,
            },
          };
          var txn =
            'field-host-' + context.invitationId + '-' + requestId;
          return api
            .sendEvent(context.roomId, 'm.room.message', content, txn)
            .then(function (result) {
              check();
              if (
                !result ||
                typeof result.eventId !== 'string' ||
                !/^\$[^\s]{1,511}$/.test(result.eventId)
              ) {
                throw new Error('发送结果尚未确认');
              }
              state.receipts[requestId] = {
                digest: digest,
                participantId: target.participantId,
                eventId: result.eventId,
              };
              state.pending = null;
              store.write(state);
              return { eventId: result.eventId };
            });
        });
      });
    },
  };
}

module.exports = {
  createFieldHostDelivery: createFieldHostDelivery,
};
