/**
 * 对齐 MuuziGit fieldVisitorHistory.ts
 */
var cryptoUtil = require('../utils/field-crypto');

var uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parsePage(value) {
  var p = value;
  function cursorOk(c) {
    return c === null || (typeof c === 'string' && uuid.test(c));
  }
  if (
    !p ||
    !Array.isArray(p.messages) ||
    p.messages.length > 50 ||
    !cursorOk(p.olderCursor) ||
    !cursorOk(p.nextCursor)
  ) {
    throw new Error('VISITOR_HISTORY_INVALID');
  }
  var messages = p.messages.map(function (m) {
    if (
      !m ||
      typeof m.eventId !== 'string' ||
      !/^\$[^\s]{1,511}$/.test(m.eventId) ||
      typeof m.text !== 'string' ||
      cryptoUtil.utf8ByteLength(m.text) > 16384 ||
      !Number.isSafeInteger(m.timestamp) ||
      m.timestamp < 0 ||
      !(
        (m.role === 'host' && m.source === 'host-account') ||
        (m.role === 'guest' && m.source === 'node-recorded-guest')
      )
    ) {
      throw new Error('VISITOR_HISTORY_INVALID');
    }
    return {
      eventId: m.eventId,
      role: m.role,
      text: m.text,
      timestamp: m.timestamp,
      source: m.source,
    };
  });
  return {
    messages: messages,
    olderCursor: p.olderCursor,
    nextCursor: p.nextCursor,
  };
}

function createVisitorHistory(read, isCurrent, expiresAt, now) {
  now = now || Date.now;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new Error('VISITOR_HISTORY_SCOPE_INVALID');
  }
  var messages = [];
  var initialized = false;
  var olderCursor = null;
  var nextCursor = null;
  var closed = false;
  var queue = Promise.resolve();

  function clear() {
    messages = [];
    initialized = false;
    olderCursor = null;
    nextCursor = null;
  }

  function check() {
    if (closed || !isCurrent() || expiresAt <= now()) {
      clear();
      throw new Error('VISITOR_HISTORY_CLOSED');
    }
  }

  function snapshot() {
    check();
    return {
      messages: messages.map(function (m) {
        return {
          eventId: m.eventId,
          role: m.role,
          text: m.text,
          timestamp: m.timestamp,
          source: m.source,
        };
      }),
      initialized: initialized,
      hasOlder: olderCursor !== null,
    };
  }

  function load(mode) {
    var task = queue.catch(function () {}).then(function () {
      check();
      if (mode === 'initial' && initialized) return snapshot();
      if (mode !== 'initial' && !initialized) {
        throw new Error('VISITOR_HISTORY_NOT_INITIALIZED');
      }
      var cursor =
        mode === 'initial'
          ? null
          : mode === 'older'
            ? olderCursor
            : nextCursor;
      if (mode === 'older' && cursor === null) return snapshot();
      return read(cursor)
        .then(function (raw) {
          return parsePage(raw);
        })
        .catch(function (error) {
          var code = error && error.code;
          if (
            [
              'SESSION_CLOSED',
              'SESSION_UNAVAILABLE',
              'ACCESS_DENIED',
              'NODE_FIELD_DISABLED',
            ].indexOf(code || '') >= 0
          ) {
            closed = true;
            clear();
          }
          throw error;
        })
        .then(function (result) {
          check();
          if (
            (mode !== 'older' && result.nextCursor === null) ||
            (mode === 'older' && result.nextCursor !== null) ||
            (mode === 'poll' && result.olderCursor !== null) ||
            (mode === 'older' && result.olderCursor === cursor)
          ) {
            throw new Error('VISITOR_HISTORY_INVALID');
          }
          var combined =
            mode === 'older'
              ? result.messages.concat(messages)
              : messages.concat(result.messages);
          var unique = {};
          var ordered = [];
          combined.forEach(function (message) {
            var prior = unique[message.eventId];
            if (
              prior &&
              JSON.stringify(prior) !== JSON.stringify(message)
            ) {
              throw new Error('VISITOR_HISTORY_EVENT_CONFLICT');
            }
            if (!unique[message.eventId]) ordered.push(message);
            unique[message.eventId] = message;
          });
          if (Object.keys(unique).length > 1000) {
            throw new Error('VISITOR_HISTORY_LIMIT');
          }
          messages = ordered.map(function (m) {
            return unique[m.eventId];
          });
          if (mode !== 'poll') olderCursor = result.olderCursor;
          if (mode !== 'older') nextCursor = result.nextCursor;
          initialized = true;
          return snapshot();
        });
    });
    queue = task;
    return task;
  }

  return {
    initial: function () {
      return load('initial');
    },
    older: function () {
      return load('older');
    },
    poll: function () {
      return load('poll');
    },
    snapshot: snapshot,
    dispose: function () {
      closed = true;
      clear();
    },
  };
}

module.exports = {
  createVisitorHistory: createVisitorHistory,
};
