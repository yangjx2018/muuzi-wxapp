/**
 * Matrix 运行时单例 · 绑定当前节点会话
 * 登录/恢复后 start；退出 clearLocal 时 stop 并清 sync token。
 * ready 后 ensureWorkspaces（与 App 同 alias）。
 */

var store = require('../adapters/secure-store');
var session = require('./session');
var config = require('../config');
var matrixClient = require('./matrixClient');
var matrixApi = require('./matrixApi');
var matrixWorkspaces = require('./matrixWorkspaces');
var matrixDirect = require('./matrixDirect');
var matrixChat = require('./matrixChat');
var matrixRooms = require('./matrixRooms');
var matrixField = require('./matrixField');
var matrixRoomSettings = require('./matrixRoomSettings');
var matrixHomeserver = require('./matrixHomeserver');
var fieldCleanup = require('./fieldCleanup');
var tabUnread = require('./tabUnread');
var chatIdentity = require('./chatIdentity');

var SYNC_SINCE_KEY = 'matrix_sync_since';

var client = null;
var api = null;
var direct = null;
var chat = null;
var field = null;
var roomSettings = null;
var unsub = null;
var workspacesStarted = false;
var workspacesToken = 0;
var lastSnap = emptySnap();
var listeners = [];
var fieldOwnerKey = '';
var homeserverResolvedFor = '';
var homeserverResolving = false;
var directsReconciled = false;
var directReconcileToken = 0;

function emptySnap() {
  return {
    ready: false,
    error: '',
    running: false,
    userId: '',
    since: '',
    rooms: [],
    invitations: [],
    workspaces: [],
    nodeWorkspaces: [],
    workspaceError: '',
    workspacesReady: false,
  };
}

function persistSince(_since) {
  // 房间表只在内存；不得持久化 since。否则冷启动/重建 client 时用旧 since
  // 做增量 sync，已加入私信不会出现在 join 段，表现为「好友消失、需重新添加」。
}

function clearPersistedSync() {
  store.remove(SYNC_SINCE_KEY);
}

function emit(snap) {
  lastSnap = snap;
  if (snap && snap.since) persistSince(snap.since);
  try {
    var roomUnread = tabUnread.totalUnread(snap && snap.rooms);
    var inviteCount =
      snap && Array.isArray(snap.invitations) ? snap.invitations.length : 0;
    tabUnread.applyTabBadge(roomUnread + (inviteCount > 0 ? inviteCount : 0));
  } catch (e) {
    /* badge 失败不影响 sync */
  }
  for (var i = 0; i < listeners.length; i++) {
    try {
      listeners[i](snap);
    } catch (err) {
      /* ignore */
    }
  }
}

function mergeClientState(state) {
  return Object.assign({}, lastSnap, state, {
    workspaces: lastSnap.workspaces || [],
    workspaceError: lastSnap.workspaceError || '',
    workspacesReady: !!lastSnap.workspacesReady,
    nodeWorkspaces:
      (state && state.nodeWorkspaces) || lastSnap.nodeWorkspaces || [],
  });
}

function subscribe(fn) {
  if (typeof fn !== 'function') return function () {};
  listeners.push(fn);
  try {
    fn(lastSnap);
  } catch (e) {
    /* ignore */
  }
  return function unsubscribe() {
    listeners = listeners.filter(function (x) {
      return x !== fn;
    });
  };
}

function getSnapshot() {
  return lastSnap;
}

function isReady() {
  return !!(lastSnap && lastSnap.ready);
}

function stop() {
  workspacesToken += 1;
  workspacesStarted = false;
  directsReconciled = false;
  directReconcileToken += 1;
  if (unsub) {
    unsub();
    unsub = null;
  }
  if (client) {
    client.stop();
    client = null;
  }
  api = null;
  direct = null;
  chat = null;
  field = null;
  roomSettings = null;
  fieldOwnerKey = '';
  lastSnap = emptySnap();
  emit(lastSnap);
}

function resetForSignOut() {
  stop();
  clearPersistedSync();
  homeserverResolvedFor = '';
  homeserverResolving = false;
}

function startWorkspaces(userId) {
  if (workspacesStarted || !api || !userId) return;
  workspacesStarted = true;
  var token = ++workspacesToken;
  matrixWorkspaces
    .ensureWorkspaces(api, userId, function () {
      return token === workspacesToken && !!client;
    })
    .then(function (list) {
      if (token !== workspacesToken) return;
      emit(
        Object.assign({}, lastSnap, {
          workspaces: list || [],
          workspaceError: '',
          workspacesReady: true,
        })
      );
    })
    .catch(function () {
      if (token !== workspacesToken) return;
      workspacesStarted = false;
      emit(
        Object.assign({}, lastSnap, {
          workspaces: [],
          workspaceError:
            '工作区暂未准备好，请重试；现有聊天仍可使用。',
          workspacesReady: false,
        })
      );
    });
}

function retryWorkspaces() {
  if (!lastSnap.ready || !api || !lastSnap.userId) return Promise.resolve();
  workspacesStarted = false;
  startWorkspaces(lastSnap.userId);
  return Promise.resolve();
}

function refreshHomeserverFromWellKnown(snap) {
  if (!snap || !snap.nodeOrigin || !snap.matrixUserId) return;
  var sig = String(snap.matrixUserId) + '|' + String(snap.nodeOrigin);
  if (homeserverResolvedFor === sig || homeserverResolving) return;
  homeserverResolving = true;
  matrixHomeserver
    .resolveHomeserver(snap.nodeOrigin, {
      fallback: snap.homeserver,
      develop: config.isDevelop(),
    })
    .then(function (hs) {
      homeserverResolving = false;
      homeserverResolvedFor = sig;
      if (!hs || hs === snap.homeserver) return;
      session.updateHomeserver(hs);
      // Rebuild client against the discovered Client-Server base (App connectNode parity).
      if (client) {
        stop();
      }
      ensureStarted();
    })
    .catch(function () {
      homeserverResolving = false;
      homeserverResolvedFor = sig;
    });
}

function ensureStarted() {
  var snap = session.snapshot();
  if (
    !session.isSignedIn() ||
    !snap.accessToken ||
    !snap.homeserver ||
    !snap.matrixUserId
  ) {
    stop();
    return null;
  }

  refreshHomeserverFromWellKnown(snap);

  if (client && lastSnap.userId === snap.matrixUserId) {
    client.setAccessToken(snap.accessToken);
    if (api) api.setAccessToken(snap.accessToken);
    if (direct) direct.setAccessToken(snap.accessToken);
    // 切回消息 Tab / 重试：强制拉起同步并清掉误报红字（对齐 App 恢复态）
    client.start({ force: true });
    return client;
  }

  stop();
  // 无磁盘房间缓存时必须全量 sync（since 空），否则私信/好友列表会空。
  clearPersistedSync();
  var since = '';
  api = matrixApi.createMatrixApi({
    homeserver: snap.homeserver,
    accessToken: snap.accessToken,
  });
  direct = matrixDirect.createDirectActions({
    homeserver: snap.homeserver,
    accessToken: snap.accessToken,
    userId: snap.matrixUserId,
    active: function () {
      return !!client && lastSnap.userId === snap.matrixUserId;
    },
    getStore: function () {
      return client ? client.getStore() : Object.create(null);
    },
    getAccountData: function () {
      return client ? client.getAccountData() : Object.create(null);
    },
    onAccountDataChanged: function () {
      if (client && typeof client.notify === 'function') client.notify();
    },
  });
  fieldOwnerKey = JSON.stringify([
    snap.instanceId,
    snap.nodeOrigin,
    snap.matrixUserId,
    snap.deviceId || '',
  ]);
  field = matrixField.createFieldActions(
    api,
    function () {
      return client ? client.getUserId() : '';
    },
    function () {
      return !!client && lastSnap.userId === snap.matrixUserId;
    },
    fieldCleanup.fieldCleanup(fieldOwnerKey)
  );
  client = matrixClient.createMatrixClient({
    homeserver: snap.homeserver,
    accessToken: snap.accessToken,
    userId: snap.matrixUserId,
    deviceId: snap.deviceId || '',
    since: since,
    onTokenRefresh: function () {
      return session.refreshMatrixToken().then(function (next) {
        var token = next && next.accessToken;
        if (api && token) api.setAccessToken(token);
        if (direct && token) direct.setAccessToken(token);
        return token;
      });
    },
    onTokenRejected: function (message) {
      emit(
        Object.assign({}, lastSnap, {
          ready: false,
          error: message || '节点登录已失效，请重新登录',
          running: false,
        })
      );
    },
  });
  chat = matrixChat.createChatActions({
    api: api,
    getStore: function () {
      return client ? client.getStore() : Object.create(null);
    },
    getAccountData: function () {
      return client ? client.getAccountData() : Object.create(null);
    },
    getUserId: function () {
      return client ? client.getUserId() : '';
    },
    getHomeserver: function () {
      return session.snapshot().homeserver || '';
    },
    getAccessToken: function () {
      return session.snapshot().accessToken || '';
    },
    emit: function () {
      if (!client) return;
      var state = client.getSnapshot();
      emit(mergeClientState(state));
    },
    active: function () {
      return !!client && lastSnap.userId === snap.matrixUserId;
    },
  });
  roomSettings = matrixRoomSettings.createRoomSettings(
    api,
    snap.matrixUserId,
    function () {
      return !!client && lastSnap.userId === snap.matrixUserId;
    }
  );
  unsub = client.subscribe(function (state) {
    var next = mergeClientState(state);
    emit(next);
    if (next.ready) {
      startWorkspaces(next.userId || snap.matrixUserId);
      if (!directsReconciled) {
        directsReconciled = true;
        reconcileMissingDirects();
      }
    }
  });
  client.start();
  return client;
}

function createDirectMessage(input) {
  if (!direct) return Promise.reject(new Error('消息服务尚未就绪'));
  return direct.createDirectMessage(input).then(function (result) {
    if (result && result.roomId) {
      var peer = '';
      try {
        var dmMap = matrixRooms.directMap(
          (client && client.getAccountData()) || {}
        );
        peer = dmMap[result.roomId] || '';
      } catch (e) {
        peer = '';
      }
      ensureLocalJoined(result.roomId, peer);
    }
    return result;
  });
}

function respondToInvite(roomId, accept) {
  if (!direct) return Promise.reject(new Error('消息服务尚未就绪'));
  return direct.respondToInvite(roomId, accept).then(function (result) {
    if (accept && roomId) ensureLocalJoined(roomId);
    return result;
  });
}

/** 创建/接受后立刻可进会话页，不等下一轮 sync */
function ensureLocalJoined(roomId, peerId) {
  if (!client || !roomId) return;
  var table = client.getStore();
  if (!table) return;
  var room = table[roomId];
  if (!room) {
    room = matrixRooms.emptyRoom(roomId, 'join');
    table[roomId] = room;
  } else {
    room.membership = 'join';
  }
  // 补 cosmac.dm，避免空壳房间被当成「未命名频道」
  if (peerId && !matrixRooms.stateContent(room, 'cosmac.dm', '')) {
    matrixRooms.hydrateJoinedRoom(table, roomId, [
      {
        type: 'cosmac.dm',
        state_key: '',
        content: { v: 1, peer_id: peerId },
      },
    ]);
  }
  if (typeof client.notify === 'function') client.notify();
}

/**
 * sync 漏掉的私信：以 m.direct + joined_rooms 为准，拉 /state 补进内存表。
 * 对齐「同账号登录后好友仍在」——不得要求用户重新添加。
 */
function reconcileMissingDirects() {
  if (!client || !api) return Promise.resolve(0);
  var token = ++directReconcileToken;
  var accountData = client.getAccountData() || Object.create(null);
  var dmMap = matrixRooms.directMap(accountData);
  var roomIds = Object.keys(dmMap);
  if (!roomIds.length) return Promise.resolve(0);
  var store = client.getStore() || Object.create(null);
  var missing = [];
  for (var i = 0; i < roomIds.length; i++) {
    var rid = roomIds[i];
    var room = store[rid];
    if (!room || room.membership === 'leave') {
      missing.push(rid);
      continue;
    }
    // 空壳（无成员且无 dm state）也补全，否则列表名/分类不对
    var hasDm = !!matrixRooms.stateContent(room, 'cosmac.dm', '');
    var peer = dmMap[rid];
    if (!hasDm && peer) {
      missing.push(rid);
    }
  }
  if (!missing.length) return Promise.resolve(0);

  return api
    .getJoinedRooms()
    .then(function (joined) {
      if (token !== directReconcileToken || !client) return 0;
      var joinedSet = Object.create(null);
      for (var j = 0; j < (joined || []).length; j++) {
        joinedSet[joined[j]] = true;
      }
      var targets = missing.filter(function (id) {
        return joinedSet[id];
      });
      if (!targets.length) return 0;
      var table = client.getStore();
      return Promise.all(
        targets.map(function (roomId) {
          return api.roomState(roomId).then(
            function (events) {
              if (token !== directReconcileToken || !client) return;
              matrixRooms.hydrateJoinedRoom(table, roomId, events);
            },
            function () {
              /* 单房失败不阻断 */
            }
          );
        })
      ).then(function () {
        if (token !== directReconcileToken || !client) return 0;
        if (typeof client.notify === 'function') client.notify();
        return targets.length;
      });
    })
    .catch(function () {
      return 0;
    });
}

function deleteAiSession(roomId) {
  if (!chat || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  if (typeof chat.deleteAiSession !== 'function') {
    return Promise.reject(new Error('删除能力待节点接通'));
  }
  return chat.deleteAiSession(roomId);
}

function getRoomDetail(roomId) {
  if (!chat) return null;
  return chat.getRoomDetail(roomId);
}

function noteSentEcho(roomId, eventId, body) {
  if (!chat) return;
  chat.noteSentEcho(roomId, eventId, body);
}

function sendText(roomId, body, replyTo) {
  if (!chat || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return chat.sendText(roomId, body, replyTo);
}

function sendImage(roomId, file) {
  if (!chat || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return chat.sendImage(roomId, file);
}

function sendAttachment(roomId, file) {
  if (!chat || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return chat.sendAttachment(roomId, file);
}

function retryMessage(roomId, messageId) {
  if (!chat || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return chat.retryMessage(roomId, messageId);
}

function markRead(roomId, eventId) {
  if (!chat) return Promise.resolve();
  return chat.markRead(roomId, eventId);
}

function loadOlder(roomId) {
  if (!chat || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return chat.loadOlder(roomId);
}

function openFieldTopic(topicKey) {
  if (!field || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return field.open(topicKey);
}

function saveFieldRecord(topicKey, recordKey, record) {
  if (!field || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return field.save(topicKey, recordKey, record);
}

function closeFieldTopic(topicKey) {
  if (!field) return Promise.resolve();
  return field.close(topicKey);
}

function recoverFieldTopic(topicKey) {
  if (!field || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  return field.recover(topicKey);
}

function ensurePersonalInbox(senderId) {
  if (!api || !lastSnap.ready || !lastSnap.userId) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  var userId = lastSnap.userId;
  return matrixWorkspaces.ensurePersonalInbox(
    api,
    userId,
    senderId,
    function () {
      return !!client && lastSnap.userId === userId;
    }
  );
}

function readRoomSettings(roomId) {
  if (!roomSettings || !lastSnap.ready) {
    return Promise.reject(new Error('设置服务尚未就绪'));
  }
  return roomSettings.read(roomId);
}

function updateRoomSettings(roomId, fieldName, value) {
  if (!roomSettings || !lastSnap.ready) {
    return Promise.reject(new Error('设置服务尚未就绪'));
  }
  return roomSettings.update(roomId, fieldName, value);
}

function inviteRoomMember(roomId, user) {
  if (!roomSettings || !lastSnap.ready) {
    return Promise.reject(new Error('设置服务尚未就绪'));
  }
  return roomSettings.invite(roomId, user);
}

function removeRoomMember(roomId, target) {
  if (!roomSettings || !lastSnap.ready) {
    return Promise.reject(new Error('设置服务尚未就绪'));
  }
  return roomSettings.remove(roomId, target);
}

function getApi() {
  return api;
}

function getFieldOwnerKey() {
  return fieldOwnerKey;
}

/**
 * 联调专用：仅改本机房间表，标记加密态（不写服务器）。
 * 用于验证「加密房可发明文」而当前账号无 App 加密 DM 时。
 */
function __debugMarkRoomEncrypted(roomId) {
  if (!client || !roomId) return false;
  var roomStore = client.getStore();
  var room = roomStore[roomId];
  if (!room || room.membership !== 'join') return false;
  var rooms = require('./matrixRooms');
  rooms.applyTimeline(room, [
    {
      type: 'm.room.encryption',
      state_key: '',
      content: { algorithm: 'm.megolm.v1.aes-sha2' },
    },
  ]);
  emit(
    Object.assign({}, lastSnap, {
      rooms: lastSnap.rooms ? lastSnap.rooms.slice() : lastSnap.rooms,
    })
  );
  return true;
}

function nodeBrands() {
  var snap = session.snapshot();
  var brands = Object.create(null);
  var node = snap.node;
  if (node && node.domain) {
    brands[String(node.domain).toLowerCase()] =
      node.brandName || node.company_name || node.label || '';
  }
  return brands;
}

function currentLabelPreferences() {
  var snap = session.snapshot();
  var accountPrefs = chatIdentity.preferencesFromStore(
    client ? client.getAccountData() : Object.create(null)
  );
  var key = chatIdentity.preferencesKey(snap.instanceId, snap.matrixUserId);
  var localPrefs = chatIdentity.readPreferences(function (k) {
    return store.get(k);
  }, key);
  return chatIdentity.mergePreferences(accountPrefs, localPrefs);
}

/**
 * Peer ContactIdentity for DM settings · parity with App room.identity.
 */
function getContactIdentity(roomId) {
  if (!client || !roomId) return null;
  var detail = getRoomDetail(roomId);
  if (!detail || detail.kind !== 'direct' || !detail.peerId) return null;
  var snap = session.snapshot();
  var roomStore = client.getStore();
  var room = roomStore[roomId];
  var rooms = require('./matrixRooms');
  var nickname = room
    ? rooms.memberNickname(room, detail.peerId)
    : (detail.identity && detail.identity.nickname) || '';
  return chatIdentity.contactIdentity(
    detail.peerId,
    snap.matrixUserId || client.getUserId() || '',
    nickname,
    currentLabelPreferences(),
    nodeBrands()
  );
}

/**
 * Save contact + node remarks to local cache and Matrix account_data
 * `im.muuzi.chat_labels` · same account as App.
 */
function saveContactLabels(userId, remark, nodeRemark) {
  if (!client || !api || !lastSnap.ready) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  var snap = session.snapshot();
  if (!snap.signedIn || !snap.matrixUserId) {
    return Promise.reject(new Error('请先登录'));
  }
  var key = chatIdentity.preferencesKey(snap.instanceId, snap.matrixUserId);
  var preferences;
  try {
    preferences = chatIdentity.updatePreferences(
      currentLabelPreferences(),
      userId,
      remark,
      nodeRemark
    );
  } catch (err) {
    return Promise.reject(err);
  }
  try {
    chatIdentity.writePreferences(
      function (k, v) {
        store.set(k, v);
      },
      key,
      preferences
    );
  } catch (err) {
    return Promise.reject(new Error('暂时无法保存备注'));
  }
  return api
    .setAccountData(
      snap.matrixUserId,
      chatIdentity.CHAT_LABELS_ACCOUNT_DATA,
      preferences
    )
    .then(function () {
      var accountData = client.getAccountData();
      accountData[chatIdentity.CHAT_LABELS_ACCOUNT_DATA] = preferences;
      if (typeof client.notify === 'function') client.notify();
      else {
        var state = client.getSnapshot();
        emit(mergeClientState(state));
      }
    })
    .catch(function () {
      return Promise.reject(
        new Error('备注未同步到账号，请检查网络后重试')
      );
    });
}

module.exports = {
  SYNC_SINCE_KEY: SYNC_SINCE_KEY,
  ensureStarted: ensureStarted,
  stop: stop,
  resetForSignOut: resetForSignOut,
  clearPersistedSync: clearPersistedSync,
  reconcileMissingDirects: reconcileMissingDirects,
  subscribe: subscribe,
  getSnapshot: getSnapshot,
  isReady: isReady,
  retryWorkspaces: retryWorkspaces,
  createDirectMessage: createDirectMessage,
  respondToInvite: respondToInvite,
  deleteAiSession: deleteAiSession,
  getRoomDetail: getRoomDetail,
  noteSentEcho: noteSentEcho,
  sendText: sendText,
  sendImage: sendImage,
  sendAttachment: sendAttachment,
  retryMessage: retryMessage,
  markRead: markRead,
  loadOlder: loadOlder,
  openFieldTopic: openFieldTopic,
  saveFieldRecord: saveFieldRecord,
  closeFieldTopic: closeFieldTopic,
  recoverFieldTopic: recoverFieldTopic,
  ensurePersonalInbox: ensurePersonalInbox,
  readRoomSettings: readRoomSettings,
  updateRoomSettings: updateRoomSettings,
  inviteRoomMember: inviteRoomMember,
  removeRoomMember: removeRoomMember,
  getContactIdentity: getContactIdentity,
  saveContactLabels: saveContactLabels,
  getApi: getApi,
  getFieldOwnerKey: getFieldOwnerKey,
  __debugMarkRoomEncrypted: __debugMarkRoomEncrypted,
};
