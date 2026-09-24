/**
 * 对齐 MuuziGit fieldVisitorSession.ts — 本机恢复凭据，非授权证明。
 */
var guest = require('./fieldGuestPersistence');
var cryptoUtil = require('../utils/field-crypto');
var idempotency = require('../utils/idempotency');

var clearedMarker = '{"version":1,"closed":true}';
var uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var proof = /^[A-Za-z0-9_-]{43}$/;

function isUuid(value) {
  return typeof value === 'string' && uuid.test(value);
}
function isProof(value) {
  return typeof value === 'string' && proof.test(value);
}
function validName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 64) return false;
  for (var i = 0; i < name.length; i++) {
    var c = name.charCodeAt(i);
    if (c < 32 || c === 127) return false;
  }
  return true;
}

function createVisitorSessionStore(selected, persistence, now) {
  persistence = persistence || guest.wxGuestPersistence();
  now = now || Date.now;
  var scope = {
    instanceId: selected.instanceId,
    nodeOrigin: selected.nodeOrigin,
    invitationId: selected.invitationId,
    invitationExpiresAt: selected.invitationExpiresAt,
  };
  if (
    typeof scope.instanceId !== 'string' ||
    !/^[1-9][0-9]*$/.test(scope.instanceId) ||
    typeof scope.nodeOrigin !== 'string' ||
    !scope.nodeOrigin.startsWith('https://') ||
    !isUuid(scope.invitationId) ||
    !Number.isSafeInteger(scope.invitationExpiresAt) ||
    scope.invitationExpiresAt <= 0
  ) {
    throw new Error('VISITOR_SCOPE_INVALID');
  }
  var key =
    'muuzi.field.visitor-session.v1:' +
    JSON.stringify([scope.instanceId, scope.nodeOrigin, scope.invitationId]);

  function sessionValid(value) {
    return (
      value &&
      isUuid(value.sessionId) &&
      isUuid(value.participantId) &&
      Number.isSafeInteger(value.expiresAt) &&
      value.expiresAt > 0
    );
  }

  function read() {
    var raw = persistence.storage.getItem(key);
    if (raw === null) return null;
    try {
      if (raw === clearedMarker) throw new Error('VISITOR_SESSION_CLEARED');
      var value = JSON.parse(raw);
      if (
        !value ||
        value.version !== 1 ||
        !value.scope ||
        value.scope.instanceId !== scope.instanceId ||
        value.scope.nodeOrigin !== scope.nodeOrigin ||
        value.scope.invitationId !== scope.invitationId ||
        value.scope.invitationExpiresAt !== scope.invitationExpiresAt ||
        !validName(value.name) ||
        !isUuid(value.requestId) ||
        !isUuid(value.exchangeId) ||
        !isProof(value.guestProof) ||
        !isProof(value.sessionProof) ||
        (value.session !== null && !sessionValid(value.session))
      ) {
        throw new Error();
      }
      return value;
    } catch (error) {
      if (error && error.message === 'VISITOR_SESSION_CLEARED') throw error;
      throw new Error('VISITOR_RECOVERY_CORRUPT');
    }
  }

  function active(value) {
    if (
      (!value && scope.invitationExpiresAt <= now()) ||
      (value && value.session && value.session.expiresAt <= now())
    ) {
      throw new Error('VISITOR_SESSION_EXPIRED');
    }
  }

  function write(value) {
    var raw = JSON.stringify(value);
    persistence.storage.setItem(key, raw);
    if (persistence.storage.getItem(key) !== raw) {
      throw new Error('VISITOR_RECOVERY_NOT_SAVED');
    }
  }

  return {
    /**
     * 对齐 App watchClosure：本机恢复记录被标记关闭时同步结束访客流。
     * 小程序无跨 Tab StorageEvent，靠 check()/onShow/轮询覆盖。
     */
    watchClosure: function (onClosed, onUnavailable) {
      var disposed = false;
      var closed = false;
      function check() {
        if (disposed) return false;
        if (closed) return true;
        try {
          closed = persistence.storage.getItem(key) === clearedMarker;
        } catch (e) {
          if (typeof onUnavailable === 'function') onUnavailable();
          return false;
        }
        if (closed && typeof onClosed === 'function') onClosed();
        return closed;
      }
      return {
        check: check,
        dispose: function () {
          disposed = true;
        },
      };
    },
    finish: function () {
      return persistence.withLock(key, function () {
        if (persistence.storage.getItem(key) === clearedMarker) {
          return Promise.resolve();
        }
        var value = read();
        if (!value) throw new Error('VISITOR_RECOVERY_MISSING');
        if (value.session) {
          var outbox = guest.guestDeliveryStore(
            persistence,
            [
              scope.instanceId,
              scope.nodeOrigin,
              scope.invitationId,
              value.session.sessionId,
              value.session.participantId,
            ],
            'visitor'
          );
          return outbox
            .locked(function () {
              outbox.write({ version: 1, pending: null, receipts: {} });
            })
            .then(function () {
              persistence.storage.setItem(key, clearedMarker);
              if (persistence.storage.getItem(key) !== clearedMarker) {
                throw new Error('VISITOR_RECOVERY_NOT_SAVED');
              }
            });
        }
        persistence.storage.setItem(key, clearedMarker);
        if (persistence.storage.getItem(key) !== clearedMarker) {
          throw new Error('VISITOR_RECOVERY_NOT_SAVED');
        }
        return Promise.resolve();
      });
    },
    forExit: function () {
      return persistence.withLock(key, function () {
        return Promise.resolve(read());
      });
    },
    restore: function () {
      return persistence.withLock(key, function () {
        var value = read();
        active(value);
        return Promise.resolve(value);
      });
    },
    prepare: function (name) {
      return persistence.withLock(key, function () {
        var prior = read();
        active(prior);
        if (!validName(name)) throw new Error('VISITOR_NAME_INVALID');
        if (prior) {
          if (prior.name !== name.trim()) {
            throw new Error('VISITOR_REQUEST_CONFLICT');
          }
          return Promise.resolve(prior);
        }
        var value = {
          version: 1,
          scope: {
            instanceId: scope.instanceId,
            nodeOrigin: scope.nodeOrigin,
            invitationId: scope.invitationId,
            invitationExpiresAt: scope.invitationExpiresAt,
          },
          name: name.trim(),
          requestId: idempotency.uuidV4(),
          guestProof: cryptoUtil.randomProof(),
          exchangeId: idempotency.uuidV4(),
          sessionProof: cryptoUtil.randomProof(),
          session: null,
        };
        write(value);
        return Promise.resolve(
          JSON.parse(JSON.stringify(value))
        );
      });
    },
    bind: function (session) {
      return persistence.withLock(key, function () {
        var value = read();
        active(value);
        if (
          !value ||
          !sessionValid(session) ||
          session.expiresAt <= now()
        ) {
          throw new Error('VISITOR_SESSION_INVALID');
        }
        if (
          value.session &&
          (value.session.sessionId !== session.sessionId ||
            value.session.participantId !== session.participantId ||
            value.session.expiresAt !== session.expiresAt)
        ) {
          throw new Error('VISITOR_SESSION_CONFLICT');
        }
        value.session = {
          sessionId: session.sessionId,
          participantId: session.participantId,
          expiresAt: session.expiresAt,
        };
        write(value);
        return Promise.resolve(value);
      });
    },
  };
}

module.exports = {
  createVisitorSessionStore: createVisitorSessionStore,
  clearedMarker: clearedMarker,
};
