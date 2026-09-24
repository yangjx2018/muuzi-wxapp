/**
 * Matrix Client-Server 薄封装 · 供工作区 / 发信等复用
 * Token 只放 Authorization，不进 URL / 日志。
 */

var http = require('./http');

function createMatrixApi(opts) {
  opts = opts || {};
  var homeserver = String(opts.homeserver || '').replace(/\/$/, '');
  var accessToken = opts.accessToken || '';
  var requestFn = opts.request || http.request;

  function setAccessToken(token) {
    if (typeof token === 'string' && token) accessToken = token;
  }

  function call(method, path, data, timeout) {
    return requestFn({
      url: homeserver + path,
      method: method,
      data: data,
      header: {
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json',
      },
      timeout: timeout || 20000,
    });
  }

  function getRoomIdForAlias(alias) {
    var encoded = encodeURIComponent(alias);
    return call('GET', '/_matrix/client/v3/directory/room/' + encoded).then(
      function (body) {
        if (!body || typeof body.room_id !== 'string' || !body.room_id) {
          throw Object.assign(new Error('房间别名无效'), { code: 'BAD_ALIAS' });
        }
        return body.room_id;
      }
    );
  }

  function createRoom(body) {
    return call('POST', '/_matrix/client/v3/createRoom', body).then(function (
      res
    ) {
      if (!res || typeof res.room_id !== 'string' || !res.room_id) {
        throw Object.assign(new Error('创建房间未返回 room_id'), {
          code: 'BAD_CREATE',
        });
      }
      return res.room_id;
    });
  }

  function roomState(roomId) {
    return call(
      'GET',
      '/_matrix/client/v3/rooms/' + encodeURIComponent(roomId) + '/state'
    ).then(function (events) {
      if (!Array.isArray(events)) {
        throw Object.assign(new Error('房间状态无效'), { code: 'BAD_STATE' });
      }
      return events;
    });
  }

  function getStateEvent(roomId, type, stateKey) {
    var path =
      '/_matrix/client/v3/rooms/' +
      encodeURIComponent(roomId) +
      '/state/' +
      encodeURIComponent(type) +
      '/' +
      encodeURIComponent(stateKey == null ? '' : stateKey);
    return call('GET', path);
  }

  function sendStateEvent(roomId, type, content, stateKey) {
    var path =
      '/_matrix/client/v3/rooms/' +
      encodeURIComponent(roomId) +
      '/state/' +
      encodeURIComponent(type) +
      '/' +
      encodeURIComponent(stateKey == null ? '' : stateKey);
    return call('PUT', path, content || {});
  }

  function sendEvent(roomId, eventType, content, txnId) {
    var txn =
      txnId ||
      'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    var path =
      '/_matrix/client/v3/rooms/' +
      encodeURIComponent(roomId) +
      '/send/' +
      encodeURIComponent(eventType) +
      '/' +
      encodeURIComponent(txn);
    return call('PUT', path, content || {}).then(function (res) {
      return {
        eventId: res && res.event_id ? res.event_id : '',
        txnId: txn,
      };
    });
  }

  function sendReadReceipt(roomId, eventId, receiptType) {
    var type = receiptType || 'm.read';
    var path =
      '/_matrix/client/v3/rooms/' +
      encodeURIComponent(roomId) +
      '/receipt/' +
      encodeURIComponent(type) +
      '/' +
      encodeURIComponent(eventId);
    return call('POST', path, {});
  }

  function getMessages(roomId, from, limit, dir) {
    var q =
      'dir=' +
      encodeURIComponent(dir || 'b') +
      '&limit=' +
      encodeURIComponent(String(limit || 30));
    if (from) q += '&from=' + encodeURIComponent(from);
    return call(
      'GET',
      '/_matrix/client/v3/rooms/' +
        encodeURIComponent(roomId) +
        '/messages?' +
        q
    );
  }

  function getEvent(roomId, eventId) {
    return call(
      'GET',
      '/_matrix/client/v3/rooms/' +
        encodeURIComponent(roomId) +
        '/event/' +
        encodeURIComponent(eventId)
    );
  }

  function leave(roomId) {
    return call(
      'POST',
      '/_matrix/client/v3/rooms/' + encodeURIComponent(roomId) + '/leave',
      {}
    );
  }

  function forget(roomId) {
    return call(
      'POST',
      '/_matrix/client/v3/rooms/' + encodeURIComponent(roomId) + '/forget',
      {}
    );
  }

  function getJoinedRooms() {
    return call('GET', '/_matrix/client/v3/joined_rooms').then(function (body) {
      return (body && body.joined_rooms) || [];
    });
  }

  function invite(roomId, userId) {
    return call(
      'POST',
      '/_matrix/client/v3/rooms/' + encodeURIComponent(roomId) + '/invite',
      { user_id: userId }
    );
  }

  function kick(roomId, userId, reason) {
    return call(
      'POST',
      '/_matrix/client/v3/rooms/' + encodeURIComponent(roomId) + '/kick',
      { user_id: userId, reason: reason || '' }
    );
  }

  function setAccountData(userId, type, content) {
    if (!userId || !type) {
      return Promise.reject(new Error('账号数据参数无效'));
    }
    return call(
      'PUT',
      '/_matrix/client/v3/user/' +
        encodeURIComponent(userId) +
        '/account_data/' +
        encodeURIComponent(type),
      content || {}
    );
  }

  return {
    setAccessToken: setAccessToken,
    getRoomIdForAlias: getRoomIdForAlias,
    createRoom: createRoom,
    roomState: roomState,
    getStateEvent: getStateEvent,
    sendStateEvent: sendStateEvent,
    sendEvent: sendEvent,
    sendReadReceipt: sendReadReceipt,
    getMessages: getMessages,
    getEvent: getEvent,
    leave: leave,
    forget: forget,
    getJoinedRooms: getJoinedRooms,
    invite: invite,
    kick: kick,
    setAccountData: setAccountData,
  };
}

module.exports = {
  createMatrixApi: createMatrixApi,
};
