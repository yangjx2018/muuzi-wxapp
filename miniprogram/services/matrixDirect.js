/**
 * 私信 / 邀请 · 对齐 matrix-direct（复用已有 DM；接受邀请注册 m.direct）
 */

var http = require('./http');
var rooms = require('./matrixRooms');

var DM_STATE = 'cosmac.dm';

function normalizePeer(input, ownId) {
  if (!/^@[^\s:]+:[^\s]+$/.test(ownId)) {
    throw new Error('请先登录节点账号');
  }
  var value = String(input || '').trim();
  var ownServer = ownId.slice(ownId.indexOf(':') + 1);
  var id = value.indexOf(':') >= 0 ? value : '@' + value.replace(/^@/, '') + ':' + ownServer;
  if (!/^@[^\s:/?#]+:[^\s/?#]+$/.test(id) || id.length > 255) {
    throw new Error('请输入用户名或完整账号，例如 @name:node.example');
  }
  var colon = id.indexOf(':');
  var server = id.slice(colon + 1);
  if (
    !/^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?$/i.test(
      server
    )
  ) {
    throw new Error('账号中的节点地址无效');
  }
  var host = server.toLowerCase();
  var result = id.slice(0, colon) + ':' + host;
  if (
    result ===
    ownId.slice(0, ownId.indexOf(':')) + ':' + ownServer.toLowerCase()
  ) {
    throw new Error('不能给自己发起私信');
  }
  if (id.slice(1, colon).toLowerCase() === 'guduu') {
    throw new Error('请从“Muu”开始与 AI 的对话');
  }
  return result;
}

function errcode(err) {
  return String((err && (err.code || (err.body && err.body.errcode))) || '');
}

function memberIds(room, ownUserId) {
  var out = [];
  var keys = Object.keys((room && room.state) || {});
  for (var i = 0; i < keys.length; i++) {
    var ev = room.state[keys[i]];
    if (!ev || ev.type !== 'm.room.member') continue;
    var uid = ev.state_key;
    if (!uid || uid === ownUserId) continue;
    var mem = ev.content && ev.content.membership;
    if (mem === 'join' || mem === 'invite') out.push(uid);
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string} opts.homeserver
 * @param {string} opts.accessToken
 * @param {string} opts.userId
 * @param {function} [opts.request]
 * @param {function} [opts.active]
 * @param {function} [opts.getStore] sync room store
 * @param {function} [opts.getAccountData]
 */
function createDirectActions(opts) {
  opts = opts || {};
  var homeserver = String(opts.homeserver || '').replace(/\/$/, '');
  var accessToken = opts.accessToken || '';
  var userId = opts.userId || '';
  var requestFn = opts.request || http.request;
  var isActive =
    typeof opts.active === 'function'
      ? opts.active
      : function () {
          return true;
        };
  var getStore =
    typeof opts.getStore === 'function'
      ? opts.getStore
      : function () {
          return Object.create(null);
        };
  var getAccountData =
    typeof opts.getAccountData === 'function'
      ? opts.getAccountData
      : function () {
          return Object.create(null);
        };
  var onAccountDataChanged =
    typeof opts.onAccountDataChanged === 'function'
      ? opts.onAccountDataChanged
      : function () {};
  var creating = Object.create(null);
  var created = Object.create(null);
  var invited = Object.create(null);
  var responding = Object.create(null);
  var accountWrites = Promise.resolve();

  function check() {
    if (!isActive()) throw new Error('账号会话已结束，请重新登录');
  }

  function call(method, path, data) {
    return requestFn({
      url: homeserver + path,
      method: method,
      data: data,
      header: {
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json',
      },
      timeout: 20000,
    });
  }

  function setAccessToken(token) {
    if (typeof token === 'string' && token) accessToken = token;
  }

  function registerDirect(roomId, peer) {
    check();
    var operation = accountWrites.catch(function () {}).then(function () {
      return call(
        'GET',
        '/_matrix/client/v3/user/' +
          encodeURIComponent(userId) +
          '/account_data/m.direct'
      )
        .catch(function (error) {
          if (errcode(error) !== 'M_NOT_FOUND') throw error;
          return {};
        })
        .then(function (current) {
          check();
          if (!current || typeof current !== 'object' || Array.isArray(current)) {
            current = {};
          }
          var ids = Array.isArray(current[peer]) ? current[peer].slice() : [];
          if (ids.indexOf(roomId) >= 0) return { roomId: roomId };
          ids.push(roomId);
          var next = Object.assign({}, current);
          next[peer] = ids;
          return call(
            'PUT',
            '/_matrix/client/v3/user/' +
              encodeURIComponent(userId) +
              '/account_data/m.direct',
            next
          ).then(function () {
            // 对齐 App setAccountDataRaw：立刻补本地 m.direct，不等 sync 回声
            var local = getAccountData();
            if (local && typeof local === 'object') {
              local['m.direct'] = next;
              try {
                onAccountDataChanged();
              } catch (e) {
                /* ignore */
              }
            }
            return { roomId: roomId };
          });
        });
    });
    accountWrites = operation.then(
      function () {},
      function () {}
    );
    return operation.catch(function () {
      check();
      return {
        roomId: roomId,
        warning:
          '对话已建立，联系人分类尚未同步；可继续聊天，稍后再次打开会重试同步。',
      };
    });
  }

  function findExisting(peer) {
    var store = getStore() || Object.create(null);
    var accountData = getAccountData() || Object.create(null);
    var dmMap = rooms.directMap
      ? rooms.directMap(accountData)
      : Object.create(null);
    if (!rooms.directMap) {
      dmMap = Object.create(null);
      var raw = accountData['m.direct'];
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (p) {
          var ids = raw[p];
          if (!Array.isArray(ids)) return;
          ids.forEach(function (rid) {
            if (typeof rid === 'string') dmMap[rid] = p;
          });
        });
      }
    }

    // 1) 对齐 App：m.direct[peer] 直接命中（lazy_load 时成员列表可能为空）
    var mapped = accountData['m.direct'];
    if (mapped && typeof mapped === 'object' && Array.isArray(mapped[peer])) {
      for (var m = 0; m < mapped[peer].length; m++) {
        var mappedId = mapped[peer][m];
        var mappedRoom = store[mappedId];
        if (
          mappedRoom &&
          (mappedRoom.membership === 'join' ||
            mappedRoom.membership === 'invite')
        ) {
          return mappedRoom;
        }
      }
    }

    var ids = Object.keys(store);
    for (var i = 0; i < ids.length; i++) {
      var room = store[ids[i]];
      if (!room) continue;
      if (room.membership !== 'join' && room.membership !== 'invite') continue;
      if (!rooms.isHumanDirect(room, userId, dmMap)) continue;

      // 2) cosmac.dm.peer_id（对齐 App candidates.find by DM_STATE）
      var dmState = rooms.stateContent
        ? rooms.stateContent(room, DM_STATE, '')
        : null;
      if (
        dmState &&
        typeof dmState.peer_id === 'string' &&
        dmState.peer_id === peer
      ) {
        return room;
      }

      // 3) 成员 / heroes
      var others = memberIds(room, userId);
      if (others.length === 1 && others[0] === peer) {
        return room;
      }
      if (dmMap[room.roomId] === peer) {
        return room;
      }
    }
    return null;
  }

  function createDirectMessage(input) {
    var peer;
    try {
      check();
      peer = normalizePeer(input, userId);
    } catch (error) {
      return Promise.reject(error);
    }
    if (creating[peer]) return creating[peer];
    var operation = Promise.resolve()
      .then(function () {
        var existing = findExisting(peer);
        if (existing) {
          if (existing.membership === 'invite') {
            return { roomId: existing.roomId };
          }
          return registerDirect(existing.roomId, peer);
        }
        var roomId = created[peer];
        if (roomId && invited[roomId]) {
          return registerDirect(roomId, peer);
        }
        var remote =
          peer.slice(peer.indexOf(':') + 1) !==
          userId.slice(userId.indexOf(':') + 1).toLowerCase();
        return call('POST', '/_matrix/client/v3/createRoom', {
          preset: 'private_chat',
          visibility: 'private',
          is_direct: true,
          creation_content: { 'm.federate': remote },
          initial_state: [
            {
              type: DM_STATE,
              state_key: '',
              content: { v: 1, peer_id: peer },
            },
          ],
        }).then(function (res) {
          check();
          if (!res || typeof res.room_id !== 'string') {
            throw new Error('未能创建私信');
          }
          roomId = res.room_id;
          created[peer] = roomId;
          return call(
            'PUT',
            '/_matrix/client/v3/rooms/' +
              encodeURIComponent(roomId) +
              '/state/m.room.member/' +
              encodeURIComponent(peer),
            { membership: 'invite', is_direct: true }
          ).then(function () {
            check();
            invited[roomId] = true;
            return registerDirect(roomId, peer);
          });
        });
      })
      .finally(function () {
        delete creating[peer];
      });
    creating[peer] = operation;
    return operation;
  }

  function respondToInvite(roomId, accept) {
    check();
    if (!roomId) return Promise.reject(new Error('邀请无效'));
    var key = roomId + ':' + (accept ? '1' : '0');
    if (responding[key]) return responding[key];
    var store = getStore() || Object.create(null);
    var room = store[roomId];
    var inviter = '';
    var isDirect = false;
    if (room) {
      var accountData = getAccountData() || Object.create(null);
      var dmMap = Object.create(null);
      var raw = accountData['m.direct'];
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (p) {
          var ids = raw[p];
          if (!Array.isArray(ids)) return;
          ids.forEach(function (rid) {
            if (typeof rid === 'string') dmMap[rid] = p;
          });
        });
      }
      isDirect = rooms.isHumanDirect(room, userId, dmMap);
      inviter = memberIds(room, userId)[0] || '';
      var ownMember = room.state && room.state['m.room.member:' + userId];
      // also check invite sender from membership event
      var keys = Object.keys(room.state || {});
      for (var i = 0; i < keys.length; i++) {
        var ev = room.state[keys[i]];
        if (
          ev &&
          ev.type === 'm.room.member' &&
          ev.state_key === userId &&
          ev.sender &&
          ev.sender !== userId
        ) {
          inviter = ev.sender;
          break;
        }
      }
    }
    var path =
      '/_matrix/client/v3/rooms/' +
      encodeURIComponent(roomId) +
      '/' +
      (accept ? 'join' : 'leave');
    var operation = call('POST', path, {})
      .then(function () {
        check();
        if (accept && isDirect && inviter) {
          return registerDirect(roomId, inviter);
        }
        return { roomId: roomId, accepted: !!accept };
      })
      .finally(function () {
        delete responding[key];
      });
    responding[key] = operation;
    return operation;
  }

  return {
    setAccessToken: setAccessToken,
    normalizePeer: normalizePeer,
    createDirectMessage: createDirectMessage,
    respondToInvite: respondToInvite,
  };
}

module.exports = {
  DM_STATE: DM_STATE,
  normalizePeer: normalizePeer,
  createDirectActions: createDirectActions,
};
