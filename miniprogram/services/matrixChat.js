/**
 * 会话发信 / 已读 / 历史 · 对齐 App matrix-chat 文本 + 明文图片路径
 * 加密房间：允许明文文字（与 App 好友互通）；附件仍禁发（matrixE2ee）。
 */

var rooms = require('./matrixRooms');
var e2ee = require('./matrixE2ee');
var media = require('./matrixMedia');

function makeTxnId() {
  return (
    'm' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * @param {object} deps
 * @param {object} deps.api matrixApi
 * @param {function} deps.getStore () => roomStore
 * @param {function} deps.getAccountData () => accountData
 * @param {function} deps.getUserId () => string
 * @param {function} deps.emit () => void
 * @param {function} [deps.active]
 * @param {function} [deps.getHomeserver]
 * @param {function} [deps.getAccessToken]
 * @param {function} [deps.uploadFilePath] 可注入测试
 */
function createChatActions(deps) {
  deps = deps || {};
  var api = deps.api;
  var isActive =
    typeof deps.active === 'function'
      ? deps.active
      : function () {
          return true;
        };
  var uploadFilePath =
    typeof deps.uploadFilePath === 'function'
      ? deps.uploadFilePath
      : media.uploadFilePath;
  var retries = Object.create(null);

  function check() {
    if (!isActive()) throw new Error('账号会话已结束，请重新登录');
  }

  function store() {
    return deps.getStore() || Object.create(null);
  }

  function userId() {
    return deps.getUserId() || '';
  }

  function emit() {
    if (typeof deps.emit === 'function') deps.emit();
  }

  function requireJoined(roomId) {
    var room = store()[roomId];
    if (!room || room.membership !== 'join') {
      throw new Error('请先接受邀请并等待对话同步完成');
    }
    return room;
  }

  function assertPlainAttachment(room) {
    if (rooms.stateContent(room, 'm.room.encryption', '')) {
      throw new Error(e2ee.ATTACH_BLOCKED);
    }
  }

  function getRoomDetail(roomId) {
    return rooms.roomDetail(
      store(),
      roomId,
      userId(),
      deps.getAccountData ? deps.getAccountData() : {}
    );
  }

  function sendText(roomId, body, replyTo) {
    try {
      check();
      var value = String(body || '').trim();
      if (!value) return Promise.resolve();
      if (value.length > 10000) {
        return Promise.reject(new Error('消息过长'));
      }
      var room = requireJoined(roomId);
      if (replyTo) {
        var found = false;
        for (var i = 0; i < (room.timeline || []).length; i++) {
          if (room.timeline[i] && room.timeline[i].event_id === replyTo) {
            found = true;
            break;
          }
        }
        if (!found) {
          return Promise.reject(new Error('这条消息暂时无法回复'));
        }
      }

      var txnId = makeTxnId();
      var content = { msgtype: 'm.text', body: value };
      if (replyTo) {
        content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo } };
      }
      var local = {
        type: 'm.room.message',
        sender: userId(),
        content: content,
        origin_server_ts: Date.now(),
        transaction_id: txnId,
        _txnId: txnId,
        _localId: 'txn:' + txnId,
        _delivery: 'sending',
        _ts: Date.now(),
      };
      rooms.upsertLocalEvent(room, local);
      emit();

      return api
        .sendEvent(roomId, 'm.room.message', content, txnId)
        .then(function (res) {
          check();
          local.event_id = res.eventId;
          local._delivery = 'sent';
          emit();
          return res;
        })
        .catch(function (err) {
          local._delivery = 'failed';
          emit();
          throw err;
        });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * 明文房间发送附件 · 对齐 App sendAttachment（image / video / file）
   * @param {string} roomId
   * @param {object} file
   * @param {string} file.filePath
   * @param {string} [file.name]
   * @param {string} [file.mimetype]
   * @param {number} [file.size]
   * @param {number} [file.width]
   * @param {number} [file.height]
   * @param {number} [file.duration]
   */
  function sendAttachment(roomId, file) {
    try {
      check();
      file = file || {};
      var filePath = file.filePath;
      if (!filePath) {
        return Promise.reject(new Error('未选择附件'));
      }
      var filename = file.name || media.basename(filePath, 'file');
      var mimetype = media.attachmentMime(file.mimetype || '', filename);
      var msgtype = media.msgtypeForMime(mimetype);
      if (typeof file.size === 'number' && file.size > media.MAX_ATTACHMENT_BYTES) {
        return Promise.reject(new Error(media.oversizeMessage(msgtype)));
      }
      var room = requireJoined(roomId);
      assertPlainAttachment(room);
      var homeserver =
        typeof deps.getHomeserver === 'function' ? deps.getHomeserver() : '';
      var accessToken =
        typeof deps.getAccessToken === 'function' ? deps.getAccessToken() : '';
      if (!homeserver || !accessToken) {
        return Promise.reject(new Error('消息服务尚未就绪'));
      }

      var txnId = makeTxnId();
      var info = {
        mimetype: mimetype,
        size: typeof file.size === 'number' ? file.size : 0,
      };
      if (Number.isFinite(file.width) && file.width > 0) {
        info.w = Math.round(file.width);
      }
      if (Number.isFinite(file.height) && file.height > 0) {
        info.h = Math.round(file.height);
      }
      if (Number.isFinite(file.duration) && file.duration > 0) {
        info.duration = Math.round(file.duration);
      }
      var content = {
        msgtype: msgtype,
        body: filename,
        url: '',
        info: info,
      };
      if (msgtype === 'm.file' || msgtype === 'm.audio') {
        content.filename = filename;
      }
      var local = {
        type: 'm.room.message',
        sender: userId(),
        content: content,
        origin_server_ts: Date.now(),
        transaction_id: txnId,
        _txnId: txnId,
        _localId: 'txn:' + txnId,
        _delivery: 'sending',
        _ts: Date.now(),
        _previewPath: filePath,
      };
      rooms.upsertLocalEvent(room, local);
      emit();

      return uploadFilePath({
        homeserver: homeserver,
        accessToken: accessToken,
        filePath: filePath,
        filename: filename,
        mimetype: mimetype,
      })
        .then(function (uploaded) {
          check();
          content.url = uploaded.contentUri;
          content.body = uploaded.filename || filename;
          content.msgtype = uploaded.msgtype || msgtype;
          if (content.msgtype === 'm.file' || content.msgtype === 'm.audio') {
            content.filename = content.body;
          }
          content.info = Object.assign({}, info, {
            mimetype: uploaded.mimetype || mimetype,
            size: uploaded.size || info.size || 0,
          });
          return api.sendEvent(roomId, 'm.room.message', content, txnId);
        })
        .then(function (res) {
          check();
          local.event_id = res.eventId;
          local._delivery = 'sent';
          emit();
          return res;
        })
        .catch(function (err) {
          local._delivery = 'failed';
          emit();
          throw err;
        });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** @deprecated 兼容旧调用；内部走 sendAttachment */
  function sendImage(roomId, file) {
    file = file || {};
    if (file.mimetype == null && file.filePath) {
      file = Object.assign({}, file, {
        mimetype: media.guessMime(file.filePath, 'image/jpeg'),
      });
    }
    return sendAttachment(roomId, file);
  }

  function retryMessage(roomId, messageId) {
    check();
    var key = roomId + ':' + messageId;
    if (retries[key]) return retries[key];
    var room = requireJoined(roomId);
    var target = null;
    for (var i = 0; i < (room.timeline || []).length; i++) {
      var ev = room.timeline[i];
      if (!ev) continue;
      if (
        ev._localId === messageId ||
        ev.transaction_id === messageId ||
        ev._txnId === messageId ||
        ev.event_id === messageId
      ) {
        target = ev;
        break;
      }
    }
    if (!target || target._delivery !== 'failed') {
      return Promise.reject(new Error('这条消息当前不能重试'));
    }
    var content = target.content || {};
    var txnId = target.transaction_id || target._txnId || makeTxnId();
    target._delivery = 'sending';
    emit();

    var prepare = Promise.resolve(content);
    if (
      (content.msgtype === 'm.image' ||
        content.msgtype === 'm.video' ||
        content.msgtype === 'm.file' ||
        content.msgtype === 'm.audio') &&
      (!content.url || !String(content.url).startsWith('mxc://')) &&
      target._previewPath
    ) {
      var homeserver =
        typeof deps.getHomeserver === 'function' ? deps.getHomeserver() : '';
      var accessToken =
        typeof deps.getAccessToken === 'function' ? deps.getAccessToken() : '';
      prepare = uploadFilePath({
        homeserver: homeserver,
        accessToken: accessToken,
        filePath: target._previewPath,
        filename: content.body || content.filename || 'file',
        mimetype: (content.info && content.info.mimetype) || undefined,
      }).then(function (uploaded) {
        content.url = uploaded.contentUri;
        content.body = uploaded.filename || content.body;
        content.msgtype = uploaded.msgtype || content.msgtype;
        if (content.msgtype === 'm.file' || content.msgtype === 'm.audio') {
          content.filename = content.body;
        }
        content.info = Object.assign({}, content.info || {}, {
          mimetype: uploaded.mimetype,
          size: uploaded.size || (content.info && content.info.size) || 0,
        });
        return content;
      });
    }

    var operation = prepare
      .then(function (readyContent) {
        return api.sendEvent(roomId, 'm.room.message', readyContent, txnId);
      })
      .then(function (res) {
        check();
        target.event_id = res.eventId;
        target._delivery = 'sent';
        emit();
      })
      .catch(function (err) {
        target._delivery = 'failed';
        emit();
        throw err;
      })
      .finally(function () {
        delete retries[key];
      });
    retries[key] = operation;
    return operation;
  }

  function markRead(roomId, eventId) {
    check();
    var room = store()[roomId];
    if (!room || room.membership !== 'join' || !eventId) {
      return Promise.resolve();
    }
    var detail = getRoomDetail(roomId);
    var message = null;
    if (detail && detail.messages) {
      for (var i = detail.messages.length - 1; i >= 0; i--) {
        if (detail.messages[i].eventId === eventId) {
          message = detail.messages[i];
          break;
        }
      }
    }
    if (!e2ee.canMarkNotification(message)) return Promise.resolve();
    var receiptType = e2ee.receiptTypeForMessage(message);
    if (!receiptType) return Promise.resolve();
    return api
      .sendReadReceipt(roomId, eventId, receiptType)
      .then(function () {
        check();
        // 仅在公开已读成功后清本地未读；私有回执不假装正文已读，仍清通知计数以免红点悬空
        room.unread = 0;
        room.highlight = 0;
        emit();
      });
  }

  function loadOlder(roomId) {
    check();
    var room = store()[roomId];
    if (!room || room.membership !== 'join') {
      return Promise.reject(new Error('对话尚未同步'));
    }
    if (!room.prevBatch) return Promise.resolve({ added: 0 });
    var from = room.prevBatch;
    return api.getMessages(roomId, from, 30, 'b').then(function (body) {
      check();
      var chunk = (body && body.chunk) || [];
      rooms.applyTimeline(room, chunk, { prepend: true });
      if (body && typeof body.end === 'string') {
        room.prevBatch = body.end;
      } else {
        room.prevBatch = '';
      }
      emit();
      return { added: chunk.length };
    });
  }

  /**
   * 现场宿主发信成功后的本地回显。host delivery 走裸 sendEvent，不经 sendText 乐观写入；
   * 若只等 sync，会出现「已发送」但气泡空白。按 event_id 去重，与后续 sync 合并安全。
   * 现场房可能尚未写入本地 join 表：缺失时补一条 join 房间，避免回显静默丢弃。
   */
  function noteSentEcho(roomId, eventId, body) {
    if (
      !roomId ||
      typeof eventId !== 'string' ||
      !/^\$[^\s]{1,511}$/.test(eventId) ||
      typeof body !== 'string' ||
      !body.trim()
    ) {
      return;
    }
    var table = store();
    var room = table[roomId];
    if (!room) {
      room = rooms.emptyRoom(roomId, 'join');
      table[roomId] = room;
    } else if (room.membership !== 'join') {
      room.membership = 'join';
    }
    rooms.upsertLocalEvent(room, {
      type: 'm.room.message',
      event_id: eventId,
      sender: userId(),
      content: { msgtype: 'm.text', body: body },
      origin_server_ts: Date.now(),
      _delivery: 'sent',
      _ts: Date.now(),
    });
    emit();
  }

  var aiRemovals = Object.create(null);
  var leftForDeletion = Object.create(null);

  /** 对齐 App matrix-chat.deleteAiSession：leave + forget，仅自己的 AI 会话 */
  function deleteAiSession(roomId) {
    check();
    if (!roomId) return Promise.reject(new Error('会话无效'));
    if (aiRemovals[roomId]) return aiRemovals[roomId];
    var room = store()[roomId];
    if (!room || !rooms.isOwnAiRoom(room, userId())) {
      return Promise.reject(new Error('只能管理自己创建的 AI 会话'));
    }
    var operation = Promise.resolve()
      .then(function () {
        if (leftForDeletion[roomId]) return;
        return api.leave(roomId).then(function () {
          leftForDeletion[roomId] = true;
        });
      })
      .then(function () {
        check();
        return api.forget(roomId);
      })
      .then(function () {
        check();
        delete leftForDeletion[roomId];
        var s = store();
        delete s[roomId];
        emit();
      })
      .finally(function () {
        delete aiRemovals[roomId];
      });
    aiRemovals[roomId] = operation;
    return operation;
  }

  return {
    getRoomDetail: getRoomDetail,
    sendText: sendText,
    sendAttachment: sendAttachment,
    sendImage: sendImage,
    retryMessage: retryMessage,
    markRead: markRead,
    loadOlder: loadOlder,
    noteSentEcho: noteSentEcho,
    deleteAiSession: deleteAiSession,
  };
}

module.exports = {
  createChatActions: createChatActions,
  makeTxnId: makeTxnId,
};
