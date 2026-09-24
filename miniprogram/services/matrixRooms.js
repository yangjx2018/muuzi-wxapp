/**
 * Matrix 房间摘要 · 纯函数
 * 从 /sync 的 join|invite|leave 段归并本地房间表，供列表与 ready 态展示。
 * 房间真值仍在用户节点；此处不另建聊天库。
 */

var FIELD_STATE = 'co.muuzi.field';
var AI_SESSION_STATE = 'cosmac.ai_session';
var WORKSPACE_STATE = 'co.muuzi.workspace';
var zhDateTime = require('../utils/zhDateTime');
var chatIdentity = require('./chatIdentity');

function emptyRoom(roomId, membership) {
  return {
    roomId: roomId,
    membership: membership || 'join',
    state: Object.create(null),
    timeline: [],
    prevBatch: '',
    unread: 0,
    highlight: 0,
    receipts: Object.create(null),
  };
}

function stateKey(type, key) {
  return String(type) + '\0' + String(key == null ? '' : key);
}

function putState(room, event) {
  if (!event || typeof event.type !== 'string') return;
  var key = stateKey(event.type, event.state_key);
  room.state[key] = event;
}

function getState(room, type, key) {
  if (!room || !room.state) return null;
  return room.state[stateKey(type, key == null ? '' : key)] || null;
}

function stateContent(room, type, key) {
  var ev = getState(room, type, key);
  return ev && ev.content && typeof ev.content === 'object' ? ev.content : null;
}

function eventKey(ev) {
  if (!ev) return '';
  if (typeof ev.event_id === 'string' && ev.event_id) return ev.event_id;
  if (typeof ev.transaction_id === 'string' && ev.transaction_id) {
    return 'txn:' + ev.transaction_id;
  }
  if (ev._localId) return String(ev._localId);
  return '';
}

function applyTimeline(room, events, opts) {
  opts = opts || {};
  if (!Array.isArray(events) || !events.length) return;
  var next = room.timeline.slice();
  var seen = Object.create(null);
  for (var i = 0; i < next.length; i++) {
    var k = eventKey(next[i]);
    if (k) seen[k] = i;
  }
  for (var j = 0; j < events.length; j++) {
    var ev = events[j];
    if (!ev || typeof ev.type !== 'string') continue;
    if (ev.state_key !== undefined && ev.state_key !== null) {
      putState(room, ev);
    }
    var key = eventKey(ev);
    if (key && seen[key] !== undefined) {
      next[seen[key]] = ev;
      continue;
    }
    if (opts.prepend) next.unshift(ev);
    else next.push(ev);
    if (key) seen[key] = opts.prepend ? 0 : next.length - 1;
  }
  if (next.length > 120) {
    next = opts.prepend ? next.slice(0, 120) : next.slice(next.length - 120);
  }
  room.timeline = next;
}

/**
 * 归并 sync 中某一 membership 段（join / invite / leave）。
 * @param {Object} store roomId -> room
 * @param {Object} section sync.rooms[membership]
 * @param {string} membership
 */
function applySection(store, section, membership) {
  if (!section || typeof section !== 'object') return store;
  var ids = Object.keys(section);
  for (var i = 0; i < ids.length; i++) {
    var roomId = ids[i];
    var chunk = section[roomId] || {};
    if (membership === 'leave') {
      delete store[roomId];
      continue;
    }
    var room = store[roomId] || emptyRoom(roomId, membership);
    room.membership = membership;

    var stateEvents =
      (chunk.state && chunk.state.events) ||
      (chunk.invite_state && chunk.invite_state.events) ||
      [];
    if (Array.isArray(stateEvents)) {
      for (var s = 0; s < stateEvents.length; s++) putState(room, stateEvents[s]);
    }

    var timelineEvents = (chunk.timeline && chunk.timeline.events) || [];
    applyTimeline(room, timelineEvents);
    if (
      chunk.timeline &&
      typeof chunk.timeline.prev_batch === 'string' &&
      chunk.timeline.prev_batch
    ) {
      room.prevBatch = chunk.timeline.prev_batch;
    }

    var unread = chunk.unread_notifications || chunk.unread_notification_counts;
    if (unread && typeof unread === 'object') {
      if (typeof unread.notification_count === 'number') {
        room.unread = unread.notification_count;
      }
      if (typeof unread.highlight_count === 'number') {
        room.highlight = unread.highlight_count;
      }
    }

    var ephemeral = (chunk.ephemeral && chunk.ephemeral.events) || [];
    if (Array.isArray(ephemeral)) {
      applyReceiptEvents(room, ephemeral);
    }

    if (chunk.summary && typeof chunk.summary === 'object') {
      room.summary = {
        heroes: Array.isArray(chunk.summary['m.heroes'])
          ? chunk.summary['m.heroes'].slice()
          : [],
        joined_member_count:
          typeof chunk.summary['m.joined_member_count'] === 'number'
            ? chunk.summary['m.joined_member_count']
            : 0,
        invited_member_count:
          typeof chunk.summary['m.invited_member_count'] === 'number'
            ? chunk.summary['m.invited_member_count']
            : 0,
      };
    }

    store[roomId] = room;
  }
  return store;
}

/** m.receipt ephemeral → room.receipts[eventId][userId] = ts */
function applyReceiptEvents(room, events) {
  if (!room.receipts) room.receipts = Object.create(null);
  for (var i = 0; i < (events || []).length; i++) {
    var ev = events[i];
    if (!ev || ev.type !== 'm.receipt' || !ev.content) continue;
    var eventIds = Object.keys(ev.content);
    for (var e = 0; e < eventIds.length; e++) {
      var eventId = eventIds[e];
      var types = ev.content[eventId];
      if (!types || typeof types !== 'object') continue;
      var readMap = types['m.read'] || types['m.read.private'];
      if (!readMap || typeof readMap !== 'object') continue;
      if (!room.receipts[eventId]) room.receipts[eventId] = Object.create(null);
      var users = Object.keys(readMap);
      for (var u = 0; u < users.length; u++) {
        var uid = users[u];
        var info = readMap[uid];
        var ts =
          info && typeof info.ts === 'number' ? info.ts : Date.now();
        room.receipts[eventId][uid] = ts;
      }
    }
  }
}

function hasUserReadEvent(room, userId, eventId) {
  if (!room || !room.receipts || !eventId || !userId) return false;
  var map = room.receipts[eventId];
  return !!(map && Object.prototype.hasOwnProperty.call(map, userId));
}

function applySyncRooms(store, roomsPayload) {
  var next = store || Object.create(null);
  if (!roomsPayload || typeof roomsPayload !== 'object') return next;
  applySection(next, roomsPayload.join, 'join');
  applySection(next, roomsPayload.invite, 'invite');
  applySection(next, roomsPayload.leave, 'leave');
  return next;
}

function applyAccountData(accountData, events) {
  var next = accountData || Object.create(null);
  if (!Array.isArray(events)) return next;
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (!ev || typeof ev.type !== 'string') continue;
    next[ev.type] = ev.content && typeof ev.content === 'object' ? ev.content : {};
  }
  return next;
}

function isSpaceRoom(room) {
  var create = stateContent(room, 'm.room.create', '');
  return !!(create && create.type === 'm.space');
}

function canonicalAlias(room) {
  var c = stateContent(room, 'm.room.canonical_alias', '');
  return c && typeof c.alias === 'string' ? c.alias : '';
}

function shouldOmitFromInbox(room) {
  if (!room) return true;
  if (isSpaceRoom(room)) return true;
  var alias = canonicalAlias(room);
  if (alias.indexOf('#cosmac-ctrl:') === 0) return true;
  return false;
}

function isOwnAiRoom(room, ownUserId) {
  var ai = stateContent(room, AI_SESSION_STATE, '');
  var named = String((stateContent(room, 'm.room.name', '') || {}).name || '').trim();
  var isAI = !!ai || named === '中枢 AI';
  if (!isAI) return false;
  var create = getState(room, 'm.room.create', '');
  var creator =
    (create && create.sender) ||
    (create && create.content && create.content.creator) ||
    '';
  return creator === ownUserId;
}

function isAiRoom(room) {
  var ai = stateContent(room, AI_SESSION_STATE, '');
  var named = String((stateContent(room, 'm.room.name', '') || {}).name || '').trim();
  return !!ai || named === '中枢 AI';
}

function directMap(accountData) {
  var raw = accountData && accountData['m.direct'];
  var map = Object.create(null);
  if (!raw || typeof raw !== 'object') return map;
  var peers = Object.keys(raw);
  for (var i = 0; i < peers.length; i++) {
    var peer = peers[i];
    var ids = raw[peer];
    if (!Array.isArray(ids)) continue;
    for (var j = 0; j < ids.length; j++) {
      if (typeof ids[j] === 'string' && ids[j]) map[ids[j]] = peer;
    }
  }
  return map;
}

function memberAvatarUrl(room, userId) {
  var c = stateContent(room, 'm.room.member', userId);
  if (c && typeof c.avatar_url === 'string' && c.avatar_url.indexOf('mxc://') === 0) {
    return c.avatar_url;
  }
  return '';
}

function roomAvatarMxc(room, kind, peerId) {
  if (kind === 'ai') return '';
  if (kind === 'direct' && peerId) {
    var peerAvatar = memberAvatarUrl(room, peerId);
    if (peerAvatar) return peerAvatar;
  }
  var av = stateContent(room, 'm.room.avatar', '');
  if (av && typeof av.url === 'string' && av.url.indexOf('mxc://') === 0) {
    return av.url;
  }
  return '';
}

function memberNickname(room, userId) {
  var c = stateContent(room, 'm.room.member', userId);
  if (c && typeof c.displayname === 'string' && c.displayname.trim()) {
    return c.displayname.trim();
  }
  return '';
}

function memberDisplayName(room, userId) {
  var nick = memberNickname(room, userId);
  if (nick) return nick;
  if (typeof userId === 'string' && userId.charAt(0) === '@') {
    var cut = userId.indexOf(':');
    if (cut > 1) return userId.slice(1, cut);
  }
  return userId || '';
}

function directListName(room, ownUserId, peerId, accountData) {
  if (!peerId) return '私人对话';
  var preferences = chatIdentity.preferencesFromStore(accountData);
  var identity = chatIdentity.contactIdentity(
    peerId,
    ownUserId,
    memberNickname(room, peerId),
    preferences
  );
  return chatIdentity.listLabel(identity) || memberDisplayName(room, peerId);
}

function findPeerId(room, ownUserId, dmMap) {
  if (dmMap && dmMap[room.roomId]) return dmMap[room.roomId];
  var dmState = stateContent(room, 'cosmac.dm', '');
  if (dmState && typeof dmState.peer_id === 'string' && dmState.peer_id) {
    return dmState.peer_id;
  }
  var keys = Object.keys(room.state || {});
  for (var i = 0; i < keys.length; i++) {
    var ev = room.state[keys[i]];
    if (!ev || ev.type !== 'm.room.member') continue;
    var uid = ev.state_key;
    if (!uid || uid === ownUserId) continue;
    var mem = ev.content && ev.content.membership;
    if (mem === 'join' || mem === 'invite') return uid;
  }
  // lazy_load 时成员可能不全，用 summary heroes 兜底
  var heroes = room.summary && room.summary.heroes;
  if (Array.isArray(heroes)) {
    for (var h = 0; h < heroes.length; h++) {
      if (heroes[h] && heroes[h] !== ownUserId) return heroes[h];
    }
  }
  var ownMember = getState(room, 'm.room.member', ownUserId);
  if (
    ownMember &&
    ownMember.content &&
    ownMember.content.is_direct === true &&
    ownMember.sender &&
    ownMember.sender !== ownUserId
  ) {
    return ownMember.sender;
  }
  return '';
}

function isHumanDirect(room, ownUserId, dmMap) {
  if (!room || isAiRoom(room)) return false;
  if (shouldOmitFromInbox(room)) return false;
  var joinRules = stateContent(room, 'm.room.join_rules', '');
  if (joinRules && joinRules.join_rule === 'public') return false;
  var others = 0;
  var keys = Object.keys(room.state || {});
  for (var i = 0; i < keys.length; i++) {
    var ev = room.state[keys[i]];
    if (!ev || ev.type !== 'm.room.member') continue;
    var uid = ev.state_key;
    if (!uid || uid === ownUserId) continue;
    var mem = ev.content && ev.content.membership;
    if (mem === 'join' || mem === 'invite') others += 1;
    if (others > 1) return false;
  }
  var joined =
    room.summary && typeof room.summary.joined_member_count === 'number'
      ? room.summary.joined_member_count
      : 0;
  var invited =
    room.summary && typeof room.summary.invited_member_count === 'number'
      ? room.summary.invited_member_count
      : 0;
  if (joined + invited > 2) return false;
  if (dmMap && dmMap[room.roomId]) return true;
  if (stateContent(room, 'cosmac.dm', '')) return true;
  // 对齐 App getDMInviter：邀请态 membership 带 is_direct
  var ownMember = getState(room, 'm.room.member', ownUserId);
  if (
    ownMember &&
    ownMember.content &&
    ownMember.content.is_direct === true &&
    ownMember.sender &&
    ownMember.sender !== ownUserId
  ) {
    return true;
  }
  return false;
}

function latestVisiblePreview(room) {
  var events = room.timeline || [];
  for (var i = events.length - 1; i >= 0; i--) {
    var ev = events[i];
    if (!ev) continue;
    if (ev.type === 'm.room.message.encrypted' || ev.type === 'm.room.encrypted') {
      return {
        body: '加密消息正在等待解密。',
        timestamp: Number(ev.origin_server_ts) || 0,
      };
    }
    if (ev.type !== 'm.room.message') continue;
    var content = ev.content || {};
    var msgtype = content.msgtype || '';
    var body = '';
    if (msgtype === 'm.image') body = '[图片]';
    else if (msgtype === 'm.file' || msgtype === 'm.audio' || msgtype === 'm.video') {
      body = '[文件] ' + String(content.filename || content.body || '');
    } else if (msgtype === 'm.text' || msgtype === 'm.notice' || msgtype === 'm.emote') {
      body = String(content.body || '').trim();
    } else {
      body = '这条消息暂不支持显示';
    }
    if (!body) continue;
    return { body: body, timestamp: Number(ev.origin_server_ts) || 0 };
  }
  return { body: '', timestamp: 0 };
}

function roomKind(room, ownUserId, dmMap) {
  if (isAiRoom(room)) return 'ai';
  if (isHumanDirect(room, ownUserId, dmMap)) return 'direct';
  var joinRules = stateContent(room, 'm.room.join_rules', '');
  if (joinRules && joinRules.join_rule === 'public') return 'community';
  return 'channel';
}

function isFieldTopic(room) {
  var field = stateContent(room, FIELD_STATE, '');
  return !!(field && field.kind === 'topic');
}

/**
 * @returns {null|object} 列表项；null 表示不进收件箱
 */
function toListItem(room, ownUserId, dmMap, accountData) {
  if (!room || shouldOmitFromInbox(room)) return null;
  if (room.membership === 'leave') return null;

  if (isAiRoom(room) && !isOwnAiRoom(room, ownUserId)) return null;

  var kind = roomKind(room, ownUserId, dmMap);
  var ai = stateContent(room, AI_SESSION_STATE, '');
  var named = String((stateContent(room, 'm.room.name', '') || {}).name || '').trim();
  var peerId = kind === 'direct' ? findPeerId(room, ownUserId, dmMap) : '';
  var name;
  if (kind === 'ai') {
    name =
      String((ai && (ai.user_title || ai.title)) || '').trim() ||
      '新会话';
  } else if (kind === 'direct') {
    name = directListName(room, ownUserId, peerId, accountData);
  } else {
    name = zhDateTime.normalizeFieldRoomName(
      named || canonicalAlias(room) || '未命名频道'
    );
  }

  var subtitle =
    kind === 'ai'
      ? 'Muu · 独立会话'
      : kind === 'direct'
        ? 'GuDuu OS 私信'
        : kind === 'community'
          ? 'GuDuu OS 公共社区'
          : 'GuDuu OS 频道';

  var latest = latestVisiblePreview(room);
  var encrypted = !!stateContent(room, 'm.room.encryption', '');
  var avatar = roomAvatarMxc(room, kind, peerId);
  var identity = null;
  if (kind === 'direct' && peerId) {
    identity = chatIdentity.contactIdentity(
      peerId,
      ownUserId,
      memberNickname(room, peerId),
      chatIdentity.preferencesFromStore(accountData)
    );
  }

  return {
    roomId: room.roomId,
    membership: room.membership,
    name: name,
    kind: kind,
    subtitle: subtitle,
    preview: latest.body || subtitle,
    timestamp: latest.timestamp,
    unread: Number(room.unread) || 0,
    mentioned: Number(room.highlight) > 0,
    encrypted: encrypted,
    field: isFieldTopic(room),
    peerId: peerId || undefined,
    identity: identity || undefined,
    starred: !!(kind === 'ai' && ai && ai.starred === true),
    avatar: avatar || undefined,
  };
}

function listRooms(store, ownUserId, accountData, membership) {
  var dmMap = directMap(accountData);
  var items = [];
  var ids = Object.keys(store || {});
  for (var i = 0; i < ids.length; i++) {
    var room = store[ids[i]];
    if (!room || room.membership !== membership) continue;
    var item = null;
    try {
      item = toListItem(room, ownUserId, dmMap, accountData);
    } catch (err) {
      // 单房间异常不得拖垮整表 snapshot / 收件箱
      item = null;
    }
    if (item) items.push(item);
  }
  items.sort(function (a, b) {
    return (
      Number(b.starred) - Number(a.starred) ||
      (b.timestamp || 0) - (a.timestamp || 0)
    );
  });
  return items;
}

function listJoined(store, ownUserId, accountData) {
  return listRooms(store, ownUserId, accountData, 'join');
}

function listInvites(store, ownUserId, accountData) {
  return listRooms(store, ownUserId, accountData, 'invite');
}

function visibleMessage(event, ownUserId) {
  if (!event) return null;
  if (event.unsigned && event.unsigned.redacted_because) return null;
  if (event._cancelled) return null;
  var relates = event.content && event.content['m.relates_to'];
  if (relates && relates.rel_type === 'm.replace') return null;

  var opaque =
    event.type === 'm.room.encrypted' ||
    event.type === 'm.room.message.encrypted' ||
    event._decryptFailed;
  if (!opaque && event.type !== 'm.room.message') return null;

  var content = event.content || {};
  var attachment = null;
  var body = '';
  if (opaque) {
    body = event._decryptFailed
      ? '这条消息暂时无法解密，请检查设备密钥。'
      : '加密消息正在等待解密。';
  } else {
    var msgtype = content.msgtype || '';
    if (msgtype === 'm.image') {
      body = '[图片]';
      attachment = {
        kind: 'image',
        mxc: String(content.url || ''),
        name: String(content.body || '图片'),
        mimetype: (content.info && content.info.mimetype) || 'image/jpeg',
        size: (content.info && content.info.size) || 0,
        width: (content.info && content.info.w) || 0,
        height: (content.info && content.info.h) || 0,
      };
    } else if (msgtype === 'm.video') {
      body = '[视频] ' + String(content.body || '');
      attachment = {
        kind: 'video',
        mxc: String(content.url || ''),
        name: String(content.body || '视频'),
        mimetype: (content.info && content.info.mimetype) || 'video/mp4',
        size: (content.info && content.info.size) || 0,
        width: (content.info && content.info.w) || 0,
        height: (content.info && content.info.h) || 0,
        duration: (content.info && content.info.duration) || 0,
      };
    } else if (msgtype === 'm.file' || msgtype === 'm.audio') {
      body =
        (msgtype === 'm.audio' ? '[音频] ' : '[文件] ') +
        String(content.filename || content.body || '');
      attachment = {
        kind: msgtype === 'm.audio' ? 'audio' : 'file',
        mxc: String(content.url || ''),
        name: String(content.filename || content.body || '附件'),
        mimetype: (content.info && content.info.mimetype) || '',
        size: (content.info && content.info.size) || 0,
      };
    } else if (
      msgtype === 'm.text' ||
      msgtype === 'm.notice' ||
      msgtype === 'm.emote'
    ) {
      body = String(content.body || '').trim();
    } else {
      body = '这条消息暂不支持显示';
    }
  }
  if (!body) return null;

  var replyTo =
    relates &&
    relates['m.in_reply_to'] &&
    typeof relates['m.in_reply_to'].event_id === 'string'
      ? relates['m.in_reply_to'].event_id
      : '';

  var mentions =
    content['m.mentions'] && Array.isArray(content['m.mentions'].user_ids)
      ? content['m.mentions'].user_ids
      : [];

  var delivery = 'sent';
  if (event._delivery === 'sending' || event._delivery === 'failed') {
    delivery = event._delivery;
  }

  var fieldKind = '';
  if (!opaque && content['co.muuzi.field.record']) {
    fieldKind = 'record';
  } else if (!opaque && content['co.muuzi.field.audience']) {
    fieldKind = 'audience';
  }

  return {
    id: event.event_id || event._localId || event.transaction_id || '',
    eventId: event.event_id || '',
    txnId: event.transaction_id || event._txnId || '',
    sender: event.sender || '',
    body: body,
    timestamp: Number(event.origin_server_ts) || Number(event._ts) || 0,
    own: (event.sender || '') === ownUserId,
    replyTo: replyTo || undefined,
    mentioned: !opaque && mentions.indexOf(ownUserId) >= 0,
    attachment: attachment || undefined,
    previewPath: event._previewPath || '',
    delivery: delivery,
    encrypted: !!opaque,
    fieldKind: fieldKind,
  };
}

function listMessages(room, ownUserId) {
  if (!room) return [];
  var out = [];
  var events = room.timeline || [];
  var memberIds = [];
  var keys = Object.keys(room.state || {});
  for (var k = 0; k < keys.length; k++) {
    var st = room.state[keys[k]];
    if (!st || st.type !== 'm.room.member') continue;
    var uid = st.state_key;
    if (!uid || uid === ownUserId) continue;
    var mem = st.content && st.content.membership;
    if (mem === 'join' || mem === 'invite') memberIds.push(uid);
  }
  for (var i = 0; i < events.length; i++) {
    var msg = visibleMessage(events[i], ownUserId);
    if (!msg) continue;
    var readByOthers = false;
    if (msg.own && msg.eventId) {
      for (var m = 0; m < memberIds.length; m++) {
        if (hasUserReadEvent(room, memberIds[m], msg.eventId)) {
          readByOthers = true;
          break;
        }
      }
    }
    out.push(Object.assign({}, msg, { readByOthers: readByOthers }));
  }
  return out;
}

/**
 * 对齐 App workspaceViews：已加入的 space + 有效 m.space.child
 * @returns {Array<{ roomId, name, field, channelIds: string[] }>}
 */
function workspaceViews(store) {
  var out = [];
  var ids = Object.keys(store || {});
  for (var i = 0; i < ids.length; i++) {
    var room = store[ids[i]];
    if (!room || room.membership !== 'join') continue;
    if (!isSpaceRoom(room)) continue;
    var field = stateContent(room, FIELD_STATE, '');
    var channelIds = [];
    var keys = Object.keys(room.state || {});
    for (var s = 0; s < keys.length; s++) {
      var ev = room.state[keys[s]];
      if (!ev || ev.type !== 'm.space.child') continue;
      var childId = ev.state_key;
      var via = ev.content && ev.content.via;
      if (
        typeof childId === 'string' &&
        childId &&
        Array.isArray(via) &&
        via.length > 0
      ) {
        channelIds.push(childId);
      }
    }
    var named = String(
      (stateContent(room, 'm.room.name', '') || {}).name || ''
    ).trim();
    out.push({
      roomId: room.roomId,
      name: named || '未命名工作区',
      field: !!(field && field.kind === 'space'),
      channelIds: channelIds,
    });
  }
  out.sort(function (a, b) {
    try {
      return String(a.name).localeCompare(String(b.name), 'zh');
    } catch (e) {
      // 微信真机部分基础库无 zh locale，localeCompare 抛错会拖垮整个 snapshot
      return String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0;
    }
  });
  return out;
}

function roomDetail(store, roomId, ownUserId, accountData) {
  var room = store && store[roomId];
  if (!room || room.membership !== 'join') return null;
  var messages = listMessages(room, ownUserId);
  var dmMap = directMap(accountData);
  var item = toListItem(room, ownUserId, dmMap, accountData);
  // 现场话题等可能不进收件箱（toListItem 为 null），但仍需返回消息供扫码交流读取
  var base = item || {
    roomId: room.roomId,
    membership: room.membership,
    name: '',
    kind: 'channel',
    field: isFieldTopic(room),
    preview: '',
    timestamp: 0,
    unread: 0,
  };
  return Object.assign({}, base, {
    messages: messages,
    hasMore: !!(room.prevBatch),
    prevBatch: room.prevBatch || '',
  });
}

function upsertLocalEvent(room, event) {
  if (!room || !event) return;
  applyTimeline(room, [event]);
}

function removeLocalByTxn(room, txnId) {
  if (!room || !txnId) return;
  room.timeline = (room.timeline || []).filter(function (ev) {
    return (
      ev.transaction_id !== txnId &&
      ev._txnId !== txnId &&
      ev._localId !== 'txn:' + txnId
    );
  });
}

module.exports = {
  FIELD_STATE: FIELD_STATE,
  AI_SESSION_STATE: AI_SESSION_STATE,
  WORKSPACE_STATE: WORKSPACE_STATE,
  emptyRoom: emptyRoom,
  applySyncRooms: applySyncRooms,
  applyAccountData: applyAccountData,
  applyTimeline: applyTimeline,
  shouldOmitFromInbox: shouldOmitFromInbox,
  toListItem: toListItem,
  listJoined: listJoined,
  listInvites: listInvites,
  visibleMessage: visibleMessage,
  listMessages: listMessages,
  roomDetail: roomDetail,
  upsertLocalEvent: upsertLocalEvent,
  removeLocalByTxn: removeLocalByTxn,
  getState: getState,
  stateContent: stateContent,
  isHumanDirect: isHumanDirect,
  isAiRoom: isAiRoom,
  isOwnAiRoom: isOwnAiRoom,
  directMap: directMap,
  workspaceViews: workspaceViews,
  applyReceiptEvents: applyReceiptEvents,
  hasUserReadEvent: hasUserReadEvent,
  memberNickname: memberNickname,
  directListName: directListName,
};
