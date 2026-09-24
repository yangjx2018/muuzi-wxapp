/**
 * 个人工作区 · 与 App matrix-workspaces / matrix-inbox 同 alias
 * `#muuzi-{sha256(userId)}-{key}:{server}` —— 多端收敛同一房间。
 */

var cryptoUtil = require('../utils/field-crypto');

var WORKSPACE_STATE = 'co.muuzi.workspace';
var INBOX_MARKER = 'co.muuzi.personal_inbox';

var WORKSPACES = [
  { key: 'business', name: '业务工作区', channel: '业务备忘' },
  { key: 'muu', name: 'Muu 工作区', channel: '报告与任务' },
  { key: 'following', name: 'Muu 关注私聊区', channel: '关注备忘' },
];

function ownerDigest(userId) {
  return cryptoUtil.sha256Hex(userId);
}

function workspaceAliasParts(userId) {
  if (!/^@[^:]+:.+$/.test(userId)) {
    throw new Error('请先登录节点账号');
  }
  var server = userId.slice(userId.indexOf(':') + 1);
  var id = ownerDigest(userId);
  return { server: server, id: id, userId: userId };
}

function aliasFor(userId, key) {
  var parts = workspaceAliasParts(userId);
  var localpart = 'muuzi-' + parts.id + '-' + key;
  return {
    localpart: localpart,
    alias: '#' + localpart + ':' + parts.server,
    server: parts.server,
  };
}

function inboxAliasFor(userId) {
  if (!/^@[^:]+:.+$/.test(userId)) {
    throw new Error('私人频道暂不可用，请稍后重试');
  }
  var server = userId.slice(userId.indexOf(':') + 1);
  var local = 'muuzi-inbox-' + ownerDigest(userId);
  return {
    localpart: local,
    alias: '#' + local + ':' + server,
    server: server,
  };
}

function findState(events, type, stateKey) {
  var key = stateKey == null ? '' : stateKey;
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (
      ev &&
      ev.type === type &&
      String(ev.state_key == null ? '' : ev.state_key) === key
    ) {
      return ev;
    }
  }
  return null;
}

function errcode(err) {
  return String((err && (err.code || (err.body && err.body.errcode))) || '');
}

var pendingInbox = null;
var pendingSender = undefined;

/**
 * 对齐 App matrix-inbox ensure · provisionOnly 启动只发现/建房，不邀请投递号。
 * @param {object} api
 * @param {string} userId
 * @param {string} [senderId]
 * @param {boolean} [provisionOnly]
 * @param {function} [active]
 */
function ensureInboxRoom(api, userId, senderId, provisionOnly, active) {
  var isActive = typeof active === 'function' ? active : function () {
    return true;
  };
  function check() {
    if (!isActive()) throw new Error('账号已切换');
  }
  check();
  if (
    senderId &&
    (!/^@[^:\s]+:[^\s]+$/.test(senderId) || senderId === userId)
  ) {
    return Promise.reject(new Error('私人频道暂不可用，请稍后重试'));
  }
  var named;
  try {
    named = inboxAliasFor(userId);
  } catch (e) {
    return Promise.reject(e);
  }

  function validate(id) {
    check();
    return api.roomState(id).then(function (events) {
      check();
      var creation = findState(events, 'm.room.create', '');
      var marker = findState(events, INBOX_MARKER, '');
      var joinRules = findState(events, 'm.room.join_rules', '');
      var history = findState(events, 'm.room.history_visibility', '');
      var guest = findState(events, 'm.room.guest_access', '');
      var encryption = findState(events, 'm.room.encryption', '');
      var self = findState(events, 'm.room.member', userId);
      var foreignMember = false;
      if (!provisionOnly) {
        for (var i = 0; i < events.length; i++) {
          var item = events[i];
          if (
            !item ||
            item.type !== 'm.room.member' ||
            item.state_key === userId ||
            item.state_key === senderId
          ) {
            continue;
          }
          var mem =
            item.content && item.content.membership
              ? String(item.content.membership)
              : '';
          if (mem === 'join' || mem === 'invite' || mem === 'knock') {
            foreignMember = true;
            break;
          }
        }
      }
      if (
        !creation ||
        creation.sender !== userId ||
        !creation.content ||
        creation.content['m.federate'] !== false ||
        !marker ||
        marker.sender !== userId ||
        !marker.content ||
        marker.content.owner !== userId ||
        marker.content.v !== 1 ||
        !joinRules ||
        !joinRules.content ||
        joinRules.content.join_rule !== 'invite' ||
        !history ||
        !history.content ||
        history.content.history_visibility !== 'joined' ||
        !guest ||
        !guest.content ||
        guest.content.guest_access !== 'forbidden' ||
        encryption ||
        !self ||
        !self.content ||
        self.content.membership !== 'join' ||
        foreignMember
      ) {
        throw new Error('私人频道暂不可用，请稍后重试');
      }
      if (senderId) {
        var sender = findState(events, 'm.room.member', senderId);
        var senderMem =
          sender && sender.content && sender.content.membership
            ? String(sender.content.membership)
            : '';
        if (senderMem !== 'join' && senderMem !== 'invite') {
          check();
          if (typeof api.invite !== 'function') {
            throw new Error('私人频道暂不可用，请稍后重试');
          }
          return api.invite(id, senderId).then(function () {
            check();
            return id;
          });
        }
      }
      return id;
    });
  }

  return api
    .getRoomIdForAlias(named.alias)
    .catch(function (error) {
      if (errcode(error) !== 'M_NOT_FOUND') throw error;
      check();
      var body = {
        room_alias_name: named.localpart,
        name: '留言信箱',
        room_version: '11',
        preset: 'private_chat',
        visibility: 'private',
        creation_content: { 'm.federate': false },
        initial_state: [
          {
            type: INBOX_MARKER,
            state_key: '',
            content: { v: 1, owner: userId },
          },
          {
            type: 'm.room.join_rules',
            state_key: '',
            content: { join_rule: 'invite' },
          },
          {
            type: 'm.room.history_visibility',
            state_key: '',
            content: { history_visibility: 'joined' },
          },
          {
            type: 'm.room.guest_access',
            state_key: '',
            content: { guest_access: 'forbidden' },
          },
        ],
      };
      if (senderId) body.invite = [senderId];
      return api.createRoom(body).catch(function (failure) {
        if (errcode(failure) !== 'M_ROOM_IN_USE') throw failure;
        check();
        return api.getRoomIdForAlias(named.alias);
      });
    })
    .then(validate);
}

/**
 * 绑定前：发现/创建私人频道并邀请节点接收账号。
 * @param {object} api
 * @param {string} userId
 * @param {string} [senderId]
 * @param {function} [active]
 */
function ensurePersonalInbox(api, userId, senderId, active) {
  if (pendingInbox && pendingSender !== senderId) {
    return Promise.reject(new Error('私人频道暂不可用，请稍后重试'));
  }
  if (!pendingInbox) {
    pendingSender = senderId;
    pendingInbox = ensureInboxRoom(
      api,
      userId,
      senderId,
      false,
      active
    ).finally(function () {
      pendingInbox = null;
      pendingSender = undefined;
    });
  }
  return pendingInbox;
}

/**
 * @param {object} api matrixApi 实例
 * @param {string} userId
 * @param {function} [active]
 */
function ensureWorkspaces(api, userId, active) {
  var isActive = typeof active === 'function' ? active : function () {
    return true;
  };
  function check() {
    if (!isActive()) throw new Error('账号已切换');
  }

  function ensure(key, name, space) {
    check();
    var named = aliasFor(userId, key);
    return api
      .getRoomIdForAlias(named.alias)
      .catch(function (error) {
        if (errcode(error) !== 'M_NOT_FOUND') throw error;
        check();
        var creationContent = { 'm.federate': false };
        if (space) creationContent.type = 'm.space';
        return api
          .createRoom({
            name: name,
            room_alias_name: named.localpart,
            visibility: 'private',
            preset: 'private_chat',
            creation_content: creationContent,
            initial_state: [
              {
                type: WORKSPACE_STATE,
                state_key: '',
                content: { owner: userId, key: key },
              },
            ],
          })
          .catch(function (failure) {
            if (errcode(failure) !== 'M_ROOM_IN_USE') throw failure;
            check();
            return api.getRoomIdForAlias(named.alias);
          });
      })
      .then(function (roomId) {
        check();
        return api.roomState(roomId).then(function (state) {
          check();
          var creation = findState(state, 'm.room.create', '');
          var marker = findState(state, WORKSPACE_STATE, '');
          if (
            !creation ||
            creation.sender !== userId ||
            !marker ||
            !marker.content ||
            marker.content.owner !== userId ||
            marker.content.key !== key ||
            (space &&
              (!creation.content || creation.content.type !== 'm.space'))
          ) {
            throw new Error('工作区身份校验失败，请联系节点管理员');
          }
          return roomId;
        });
      });
  }

  function linkChild(spaceId, childId, server) {
    check();
    return api
      .getStateEvent(spaceId, 'm.space.child', childId)
      .then(function (content) {
        if (content && Array.isArray(content.via) && content.via.length) {
          return;
        }
        check();
        return api.sendStateEvent(
          spaceId,
          'm.space.child',
          { via: [server] },
          childId
        );
      })
      .catch(function (error) {
        if (errcode(error) !== 'M_NOT_FOUND') throw error;
        check();
        return api.sendStateEvent(
          spaceId,
          'm.space.child',
          { via: [server] },
          childId
        );
      });
  }

  function prepareDefaultInbox() {
    return ensureInboxRoom(api, userId, undefined, true, isActive);
  }

  var server = workspaceAliasParts(userId).server;
  var result = [];
  var chain = Promise.resolve();

  WORKSPACES.forEach(function (entry) {
    chain = chain.then(function () {
      return ensure(entry.key, entry.name, true).then(function (roomId) {
        return ensure(entry.key + '-notes', entry.channel, false).then(
          function (channelId) {
            check();
            return linkChild(roomId, channelId, server).then(function () {
              result.push({
                key: entry.key,
                name: entry.name,
                roomId: roomId,
                channelId: channelId,
              });
            });
          }
        );
      });
    });
  });

  return chain
    .then(function () {
      check();
      return prepareDefaultInbox();
    })
    .then(function (inboxChannelId) {
      check();
      var business = null;
      for (var i = 0; i < result.length; i++) {
        if (result[i].key === 'business') business = result[i];
      }
      if (!business) throw new Error('业务工作区未准备好');
      return linkChild(business.roomId, inboxChannelId, server).then(
        function () {
          business.inboxChannelId = inboxChannelId;
          return result.slice();
        }
      );
    });
}

module.exports = {
  WORKSPACE_STATE: WORKSPACE_STATE,
  INBOX_MARKER: INBOX_MARKER,
  WORKSPACES: WORKSPACES,
  ownerDigest: ownerDigest,
  aliasFor: aliasFor,
  inboxAliasFor: inboxAliasFor,
  ensureInboxRoom: ensureInboxRoom,
  ensurePersonalInbox: ensurePersonalInbox,
  ensureWorkspaces: ensureWorkspaces,
};
