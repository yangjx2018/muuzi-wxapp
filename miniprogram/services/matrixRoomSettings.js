/**
 * 房间设置 · 对齐 App matrix-room-settings.ts
 * 使用 matrixApi.roomState / sendStateEvent / invite / kick。
 */

function findState(events, type, stateKey) {
  var key = stateKey == null ? '' : stateKey;
  for (var i = 0; i < (events || []).length; i++) {
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

function powerContent(events) {
  var ev = findState(events, 'm.room.power_levels', '');
  return (ev && ev.content) || {};
}

/**
 * 自身权力等级：users[userId] 或 users_default（默认 0）。
 */
function ownPower(content, userId) {
  var users = (content && content.users) || {};
  if (
    userId &&
    typeof users[userId] === 'number' &&
    Number.isSafeInteger(users[userId])
  ) {
    return users[userId];
  }
  var def = content && content.users_default;
  return Number.isSafeInteger(def) ? def : 0;
}

function requiredPower(content, key, fallback) {
  var value = content && content[key];
  return Number.isSafeInteger(value) ? value : fallback;
}

/**
 * 状态事件所需权力：events[type] ?? state_default（默认 50）。
 */
function stateEventPower(content, eventType) {
  var events = (content && content.events) || {};
  if (
    typeof events[eventType] === 'number' &&
    Number.isSafeInteger(events[eventType])
  ) {
    return events[eventType];
  }
  return requiredPower(content, 'state_default', 50);
}

function maySendStateEvent(content, userId, eventType) {
  return ownPower(content, userId) >= stateEventPower(content, eventType);
}

function mayInvite(content, userId) {
  return ownPower(content, userId) >= requiredPower(content, 'invite', 0);
}

/**
 * 可否踢出：自身 ≥ kick（默认 50）且严格高于目标；不可踢自己。
 */
function mayKick(content, ownId, targetId) {
  if (!ownId || !targetId || ownId === targetId) return false;
  var own = ownPower(content, ownId);
  var target = ownPower(content, targetId);
  var need = requiredPower(content, 'kick', 50);
  return own >= need && own > target;
}

function memberDisplayName(events, userId) {
  var ev = findState(events, 'm.room.member', userId);
  if (ev && ev.content && typeof ev.content.displayname === 'string') {
    var name = ev.content.displayname.trim();
    if (name) return name;
  }
  return userId;
}

function roomName(events) {
  var ev = findState(events, 'm.room.name', '');
  var raw =
    ev && ev.content && typeof ev.content.name === 'string'
      ? ev.content.name
      : '';
  return require('../utils/zhDateTime').normalizeFieldRoomName(raw);
}

function roomTopic(events) {
  var ev = findState(events, 'm.room.topic', '');
  if (ev && ev.content && typeof ev.content.topic === 'string') {
    return String(ev.content.topic);
  }
  return '';
}

function createRoomSettings(api, userId, active) {
  var isActive = typeof active === 'function' ? active : function () {
    return true;
  };
  function check() {
    if (!isActive()) throw new Error('账号已切换，请重新打开设置');
  }

  function requireJoined(roomId) {
    check();
    return api.roomState(roomId).then(function (events) {
      check();
      var self = findState(events, 'm.room.member', userId);
      if (
        !self ||
        !self.content ||
        self.content.membership !== 'join'
      ) {
        throw new Error('尚未加入此会话');
      }
      return events;
    });
  }

  function canRemove(events, targetId) {
    if (!userId || userId === targetId) return false;
    var target = findState(events, 'm.room.member', targetId);
    var mem =
      target && target.content && target.content.membership
        ? String(target.content.membership)
        : '';
    if (mem !== 'join' && mem !== 'invite') return false;
    return mayKick(powerContent(events), userId, targetId);
  }

  function read(roomId) {
    return requireJoined(roomId).then(function (events) {
      check();
      var power = powerContent(events);
      var members = [];
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (!ev || ev.type !== 'm.room.member' || !ev.state_key) continue;
        var mem =
          ev.content && ev.content.membership
            ? String(ev.content.membership)
            : '';
        if (mem !== 'join' && mem !== 'invite') continue;
        members.push({
          id: ev.state_key,
          name: memberDisplayName(events, ev.state_key),
          invited: mem === 'invite',
          canRemove: canRemove(events, ev.state_key),
        });
      }
      members.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), 'zh');
      });
      return {
        name: roomName(events),
        topic: roomTopic(events),
        canName: maySendStateEvent(power, userId, 'm.room.name'),
        canTopic: maySendStateEvent(power, userId, 'm.room.topic'),
        canInvite: mayInvite(power, userId),
        members: members,
      };
    });
  }

  function update(roomId, field, value) {
    return requireJoined(roomId).then(function (events) {
      check();
      var power = powerContent(events);
      if (field !== 'name' && field !== 'topic') {
        throw new Error('你没有修改此项的权限');
      }
      if (!maySendStateEvent(power, userId, 'm.room.' + field)) {
        throw new Error('你没有修改此项的权限');
      }
      var clean = String(value || '').trim();
      if (field === 'name' && (!clean || clean.length > 100)) {
        throw new Error('名称需为 1–100 字');
      }
      if (field === 'topic' && clean.length > 1000) {
        throw new Error('介绍最多 1000 字');
      }
      var content =
        field === 'name' ? { name: clean } : { topic: clean };
      return api
        .sendStateEvent(roomId, 'm.room.' + field, content, '')
        .then(function () {
          check();
        });
    });
  }

  function invite(roomId, user) {
    return requireJoined(roomId).then(function (events) {
      check();
      if (!mayInvite(powerContent(events), userId)) {
        throw new Error('你没有邀请成员的权限');
      }
      var clean = String(user || '').trim();
      if (!/^@[^\s:]+:[^\s]+$/.test(clean)) {
        throw new Error('请填写完整账号 @用户名:节点');
      }
      return api.invite(roomId, clean).then(function () {
        check();
      });
    });
  }

  function remove(roomId, target) {
    return requireJoined(roomId).then(function (events) {
      check();
      if (!canRemove(events, target)) {
        throw new Error('你没有移除此成员的权限，或成员已离开');
      }
      return api.kick(roomId, target).then(function () {
        check();
      });
    });
  }

  return {
    read: read,
    update: update,
    invite: invite,
    remove: remove,
  };
}

module.exports = {
  findState: findState,
  powerContent: powerContent,
  ownPower: ownPower,
  stateEventPower: stateEventPower,
  maySendStateEvent: maySendStateEvent,
  mayInvite: mayInvite,
  mayKick: mayKick,
  createRoomSettings: createRoomSettings,
};
