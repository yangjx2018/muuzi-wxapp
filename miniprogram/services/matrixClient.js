/**
 * Matrix 客户端骨架（小程序内自研 sync）
 * 决策 4：房间真值在用户节点；用 /_matrix/client/v3/sync 长轮询，不引入 matrix-js-sdk。
 * M3.1：ready + 房间/邀请列表可读；发信/解密留给后续切片。
 */

var http = require('./http');
var rooms = require('./matrixRooms');

var INITIAL_FILTER = JSON.stringify({
  room: {
    timeline: { limit: 20 },
    state: { lazy_load_members: true },
  },
});

/**
 * Align App `@guduu/node-auth` tokenRejected:
 * bare HTTP 401 is NOT session death — only Matrix errcodes are.
 * (MP used to treat any 401 as “登录已失效”, hiding rooms while App still worked.)
 */
function tokenRejected(err) {
  if (!err) return false;
  var code = String(
    err.code ||
      err.errcode ||
      (err.body && (err.body.errcode || err.body.code)) ||
      ''
  );
  return code === 'M_UNKNOWN_TOKEN' || code === 'M_MISSING_TOKEN';
}

function syncErrorCopy(err) {
  if (!err) return '节点同步失败，正在重试';
  if (tokenRejected(err)) return '节点登录已失效，请重新登录';
  if (err.code === 'M_FORBIDDEN' || err.statusCode === 403) {
    return '节点拒绝了这个账号';
  }
  if (err.statusCode && err.statusCode >= 500) {
    return '节点服务异常，正在重试';
  }
  if (err.code === 'NETWORK') return '暂时无法连接节点，正在重试';
  return (
    '节点同步失败（' +
    (err.code || err.statusCode || '连不上') +
    '），正在重试'
  );
}

function normalizeHomeserver(url) {
  return String(url || '').replace(/\/$/, '');
}

/**
 * @param {object} opts
 * @param {string} opts.homeserver
 * @param {string} opts.accessToken
 * @param {string} opts.userId
 * @param {string} [opts.deviceId]
 * @param {string} [opts.since]
 * @param {function} [opts.request] 可注入，默认 http.request
 * @param {number} [opts.pollTimeoutMs] sync ?timeout=
 * @param {number} [opts.httpTimeoutMs] wx.request timeout
 */
function createMatrixClient(opts) {
  opts = opts || {};
  var homeserver = normalizeHomeserver(opts.homeserver);
  var accessToken = opts.accessToken || '';
  var userId = opts.userId || '';
  var requestFn = opts.request || http.request;
  var pollTimeoutMs =
    typeof opts.pollTimeoutMs === 'number' ? opts.pollTimeoutMs : 30000;
  var httpTimeoutMs =
    typeof opts.httpTimeoutMs === 'number' ? opts.httpTimeoutMs : 45000;

  var store = Object.create(null);
  var accountData = Object.create(null);
  var since = typeof opts.since === 'string' ? opts.since : '';
  var ready = false;
  var error = '';
  var running = false;
  var stopped = true;
  var loopToken = 0;
  var listeners = [];
  var cancelWait = null;
  var pendingReject = null;
  var refreshAttemptedFor = 0;

  function snapshot() {
    return {
      ready: ready,
      error: error,
      running: running && !stopped,
      userId: userId,
      since: since,
      rooms: rooms.listJoined(store, userId, accountData),
      invitations: rooms.listInvites(store, userId, accountData),
      nodeWorkspaces: rooms.workspaceViews(store),
    };
  }

  function emit() {
    var snap = snapshot();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snap);
      } catch (e) {
        /* listener 失败不影响 sync */
      }
    }
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  function syncUrl(timeout) {
    var q =
      'timeout=' +
      encodeURIComponent(String(timeout)) +
      '&filter=' +
      encodeURIComponent(INITIAL_FILTER);
    if (since) q += '&since=' + encodeURIComponent(since);
    return homeserver + '/_matrix/client/v3/sync?' + q;
  }

  function oneSync(timeout) {
    var cancelled = false;
    var req = new Promise(function (resolve, reject) {
      pendingReject = function () {
        cancelled = true;
        pendingReject = null;
        reject(Object.assign(new Error('sync cancelled'), { code: 'SYNC_CANCELLED' }));
      };
      Promise.resolve(
        requestFn({
          url: syncUrl(timeout),
          method: 'GET',
          header: {
            Authorization: 'Bearer ' + accessToken,
            Accept: 'application/json',
          },
          timeout: httpTimeoutMs,
        })
      ).then(
        function (body) {
          if (cancelled) return;
          pendingReject = null;
          resolve(body);
        },
        function (err) {
          if (cancelled) return;
          pendingReject = null;
          reject(err);
        }
      );
    });

    return req.then(function (body) {
      if (!body || typeof body !== 'object') {
        throw Object.assign(new Error('节点同步响应无效'), {
          code: 'BAD_SYNC',
        });
      }
      if (typeof body.next_batch === 'string' && body.next_batch) {
        since = body.next_batch;
      }
      store = rooms.applySyncRooms(store, body.rooms);
      if (body.account_data && Array.isArray(body.account_data.events)) {
        accountData = rooms.applyAccountData(
          accountData,
          body.account_data.events
        );
      }
      ready = true;
      error = '';
      emit();
      return body;
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        if (cancelWait === finish) cancelWait = null;
        resolve();
      }, ms);
      function finish() {
        clearTimeout(timer);
        resolve();
      }
      cancelWait = finish;
    });
  }

  function loop(token) {
    if (stopped || token !== loopToken) return;
    running = true;
    var timeout = since ? pollTimeoutMs : 0;
    oneSync(timeout)
      .then(function () {
        if (stopped || token !== loopToken) return;
        // 让出事件循环，避免首轮 timeout=0 时同步紧循环堵死定时器/测试
        return delay(timeout > 0 ? 0 : 30).then(function () {
          if (stopped || token !== loopToken) return;
          return loop(token);
        });
      })
      .catch(function (err) {
        if (stopped || token !== loopToken) return;
        if (err && err.code === 'SYNC_CANCELLED') return;
        if (
          tokenRejected(err) &&
          typeof opts.onTokenRefresh === 'function' &&
          refreshAttemptedFor !== token
        ) {
          refreshAttemptedFor = token;
          error = '正在续期节点登录…';
          emit();
          return Promise.resolve(opts.onTokenRefresh())
            .then(function (nextToken) {
              if (stopped || token !== loopToken) return;
              if (typeof nextToken === 'string' && nextToken) {
                accessToken = nextToken;
              }
              error = '';
              emit();
              return loop(token);
            })
            .catch(function () {
              if (stopped || token !== loopToken) return;
              error = syncErrorCopy(err);
              emit();
              running = false;
              stopped = true;
              if (typeof opts.onTokenRejected === 'function') {
                try {
                  opts.onTokenRejected(error);
                } catch (e) {
                  /* ignore */
                }
              }
            });
        }
        error = syncErrorCopy(err);
        emit();
        if (tokenRejected(err)) {
          running = false;
          stopped = true;
          if (typeof opts.onTokenRejected === 'function') {
            try {
              opts.onTokenRejected(error);
            } catch (e) {
              /* ignore */
            }
          }
          return;
        }
        return delay(2000).then(function () {
          if (stopped || token !== loopToken) return;
          return loop(token);
        });
      });
  }

  function start(optsStart) {
    optsStart = optsStart || {};
    if (!homeserver || !accessToken || !userId) {
      error = '缺少节点会话，无法同步消息';
      ready = false;
      emit();
      return;
    }
    if (!optsStart.force && !stopped && running) return;
    stopped = false;
    loopToken += 1;
    refreshAttemptedFor = 0;
    error = '';
    emit();
    loop(loopToken);
  }

  function stop() {
    stopped = true;
    running = false;
    loopToken += 1;
    if (typeof pendingReject === 'function') {
      var rejectPending = pendingReject;
      pendingReject = null;
      rejectPending();
    }
    if (typeof cancelWait === 'function') {
      var finish = cancelWait;
      cancelWait = null;
      finish();
    }
    emit();
  }

  function setAccessToken(token) {
    if (typeof token === 'string' && token) accessToken = token;
  }

  return {
    start: start,
    stop: stop,
    subscribe: subscribe,
    getSnapshot: snapshot,
    setAccessToken: setAccessToken,
    getStore: function () {
      return store;
    },
    getAccountData: function () {
      return accountData;
    },
    getUserId: function () {
      return userId;
    },
    notify: emit,
    /** 测试用：注入一帧 sync 体 */
    _applySyncBody: function (body) {
      if (!body || typeof body !== 'object') return snapshot();
      if (typeof body.next_batch === 'string') since = body.next_batch;
      store = rooms.applySyncRooms(store, body.rooms);
      if (body.account_data && Array.isArray(body.account_data.events)) {
        accountData = rooms.applyAccountData(
          accountData,
          body.account_data.events
        );
      }
      ready = true;
      error = '';
      emit();
      return snapshot();
    },
  };
}

module.exports = {
  createMatrixClient: createMatrixClient,
  tokenRejected: tokenRejected,
  syncErrorCopy: syncErrorCopy,
  INITIAL_FILTER: INITIAL_FILTER,
};
