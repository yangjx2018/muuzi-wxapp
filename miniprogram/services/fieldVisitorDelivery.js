/**
 * 对齐 MuuziGit fieldVisitorDelivery.ts
 */
var guest = require('./fieldGuestPersistence');
var cryptoUtil = require('../utils/field-crypto');
var speech = require('./fieldSpeech');

var uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function validId(value) {
  return typeof value === 'string' && uuid.test(value);
}

function canonicalizeLanguage(language) {
  if (typeof language !== 'string' || language.length > 35) return null;
  var base = language.trim().replace(/_/g, '-').split('-')[0].toLowerCase();
  if (
    Object.prototype.hasOwnProperty.call(speech.speechLanguages, base)
  ) {
    return base;
  }
  return null;
}

function createVisitorDelivery(recovery, transport, isCurrent, persistence, now) {
  persistence = persistence || guest.wxGuestPersistence();
  now = now || Date.now;
  var context = JSON.parse(JSON.stringify(recovery));
  var session = context.session;
  var scope = context.scope;
  if (!session) throw new Error('VISITOR_DELIVERY_SCOPE_INVALID');
  if (
    !validId(session.sessionId) ||
    !validId(session.participantId) ||
    !validId(scope.invitationId) ||
    typeof scope.instanceId !== 'string' ||
    !/^[1-9][0-9]*$/.test(scope.instanceId) ||
    typeof scope.nodeOrigin !== 'string' ||
    !scope.nodeOrigin.startsWith('https://') ||
    typeof context.sessionProof !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(context.sessionProof) ||
    !Number.isSafeInteger(session.expiresAt) ||
    !Number.isSafeInteger(scope.invitationExpiresAt) ||
    session.expiresAt <= 0 ||
    scope.invitationExpiresAt <= 0
  ) {
    throw new Error('VISITOR_DELIVERY_SCOPE_INVALID');
  }

  function credentials() {
    return {
      sessionId: session.sessionId,
      sessionProof: context.sessionProof,
    };
  }

  var store = guest.guestDeliveryStore(
    persistence,
    [
      scope.instanceId,
      scope.nodeOrigin,
      scope.invitationId,
      session.sessionId,
      session.participantId,
    ],
    'visitor'
  );

  function check() {
    if (!isCurrent()) throw new Error('VISITOR_CONTEXT_CHANGED');
    if (session.expiresAt <= now()) throw new Error('VISITOR_SESSION_EXPIRED');
  }

  function authorize() {
    check();
    return transport.status(credentials()).then(function (status) {
      check();
      if (
        !status ||
        status.active !== true ||
        status.sessionId !== session.sessionId ||
        status.participantId !== session.participantId ||
        status.expiresAt !== session.expiresAt
      ) {
        throw new Error('VISITOR_AUTHORIZATION_CHANGED');
      }
    });
  }

  return {
    pending: function () {
      return store.locked(function () {
        check();
        return Promise.resolve(store.read().pending);
      });
    },
    send: function (requestId, text, language) {
      var canonical = canonicalizeLanguage(language);
      if (
        !validId(requestId) ||
        typeof text !== 'string' ||
        !text.trim() ||
        text.indexOf('\0') >= 0 ||
        cryptoUtil.utf8ByteLength(text) > 2000 ||
        !canonical
      ) {
        return Promise.reject(new Error('VISITOR_MESSAGE_INVALID'));
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
        if (
          saved &&
          (saved.digest !== digest ||
            saved.participantId !== session.participantId)
        ) {
          throw new Error('VISITOR_MESSAGE_CONFLICT');
        }
        if (
          pending &&
          (pending.requestId !== requestId ||
            pending.text !== text ||
            pending.language !== canonical ||
            pending.participantId !== session.participantId)
        ) {
          throw new Error('VISITOR_PENDING_CONFLICT');
        }
        return authorize().then(function () {
          if (saved) return { eventId: saved.eventId };
          state.pending = {
            requestId: requestId,
            text: text,
            language: canonical,
            participantId: session.participantId,
          };
          store.write(state);
          check();
          return transport
            .send({
              sessionId: session.sessionId,
              sessionProof: context.sessionProof,
              requestId: requestId,
              text: text,
              language: canonical,
            })
            .then(function (result) {
              check();
              if (
                !result ||
                result.requestId !== requestId ||
                result.status !== 'sent' ||
                typeof result.eventId !== 'string' ||
                !/^\$[^\s]{1,511}$/.test(result.eventId)
              ) {
                throw new Error('VISITOR_RESULT_UNCONFIRMED');
              }
              state.receipts[requestId] = {
                digest: digest,
                participantId: session.participantId,
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
  createVisitorDelivery: createVisitorDelivery,
  canonicalizeLanguage: canonicalizeLanguage,
};
