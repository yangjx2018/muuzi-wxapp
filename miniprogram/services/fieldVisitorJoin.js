/**
 * 对齐 MuuziGit fieldVisitorJoin.ts
 */
function createVisitorJoin(store, transport, isCurrent, now) {
  now = now || Date.now;
  var disposed = false;
  var queue = Promise.resolve();

  function check() {
    if (disposed || !isCurrent()) {
      throw new Error('VISITOR_JOIN_CONTEXT_CHANGED');
    }
  }

  function serial(run) {
    var next = queue.catch(function () {}).then(function () {
      check();
      return run();
    });
    queue = next;
    return next;
  }

  function confirm(value) {
    check();
    var session = value.session;
    if (!session) throw new Error('VISITOR_JOIN_SESSION_MISSING');
    return transport
      .status({
        sessionId: session.sessionId,
        sessionProof: value.sessionProof,
      })
      .then(function (status) {
        check();
        if (
          !status ||
          status.active !== true ||
          status.sessionId !== session.sessionId ||
          status.participantId !== session.participantId ||
          status.expiresAt !== session.expiresAt ||
          status.expiresAt <= now()
        ) {
          throw new Error('VISITOR_JOIN_SESSION_INVALID');
        }
        return { phase: 'ready', participantId: session.participantId };
      });
  }

  function advance(value, response) {
    check();
    var result = response;
    if (
      !result ||
      result.id !== value.scope.invitationId ||
      result.expiresAt !== value.scope.invitationExpiresAt ||
      !Number.isSafeInteger(result.revision) ||
      result.revision < 1 ||
      ['pending', 'approved', 'rejected', 'revoked', 'expired'].indexOf(
        result.status
      ) < 0
    ) {
      throw new Error('VISITOR_JOIN_RESPONSE_INVALID');
    }
    if (
      ['rejected', 'revoked', 'expired'].indexOf(result.status) >= 0 ||
      (result.status === 'pending' && result.expiresAt <= now())
    ) {
      return Promise.resolve({ phase: 'closed' });
    }
    if (result.status === 'pending') {
      return Promise.resolve({ phase: 'waiting' });
    }
    if (value.session) return confirm(value);
    return transport
      .exchange({
        invitationId: value.scope.invitationId,
        guestProof: value.guestProof,
        requestId: value.exchangeId,
        sessionProof: value.sessionProof,
      })
      .then(function (session) {
        check();
        return store.bind(session);
      })
      .then(function (bound) {
        check();
        return confirm(bound);
      });
  }

  return {
    submit: function (name, joinProof, consent) {
      return serial(function () {
        if (
          consent !== 'field-join-v1' ||
          typeof joinProof !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(joinProof)
        ) {
          throw new Error('VISITOR_JOIN_CONSENT_REQUIRED');
        }
        return store.prepare(name).then(function (value) {
          check();
          return transport
            .request({
              invitationId: value.scope.invitationId,
              joinProof: joinProof,
              requestId: value.requestId,
              guestProof: value.guestProof,
              name: value.name,
              consent: consent,
            })
            .then(function (result) {
              check();
              return advance(value, result);
            });
        });
      });
    },
    resume: function () {
      return serial(function () {
        return store
          .restore()
          .catch(function (error) {
            if (error && error.message === 'VISITOR_SESSION_CLEARED') {
              return null;
            }
            throw error;
          })
          .then(function (value) {
            check();
            if (value === null) return { phase: 'closed' };
            if (!value) return { phase: 'new' };
            if (value.session) return confirm(value);
            return transport
              .poll({
                invitationId: value.scope.invitationId,
                guestProof: value.guestProof,
              })
              .then(function (result) {
                check();
                return advance(value, result);
              });
          });
      });
    },
    end: function () {
      return serial(function () {
        return store
          .forExit()
          .catch(function (error) {
            if (error && error.message === 'VISITOR_SESSION_CLEARED') {
              return null;
            }
            throw error;
          })
          .then(function (value) {
            if (!value || !transport.leave) {
              throw new Error('VISITOR_EXIT_UNAVAILABLE');
            }
            return transport
              .leave({
                invitationId: value.scope.invitationId,
                guestProof: value.guestProof,
              })
              .then(function (result) {
                check();
                if (
                  !result ||
                  result.id !== value.scope.invitationId ||
                  result.expiresAt !== value.scope.invitationExpiresAt ||
                  !Number.isSafeInteger(result.revision) ||
                  result.revision < 1 ||
                  ['revoked', 'rejected', 'expired'].indexOf(result.status) < 0
                ) {
                  throw new Error('VISITOR_EXIT_UNCONFIRMED');
                }
                return store.finish().then(function () {
                  check();
                  return { phase: 'closed' };
                });
              });
          });
      });
    },
    dispose: function () {
      disposed = true;
    },
  };
}

module.exports = {
  createVisitorJoin: createVisitorJoin,
};
